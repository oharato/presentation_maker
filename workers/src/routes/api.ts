/**
 * API ルート
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { JobQueue } from '../../utils/queue';
import { v4 as uuidv4 } from 'uuid';

const api = new Hono<{ Bindings: Env }>();

import { ContainerManager } from '../../utils/container-manager';

/**
 * ファイルアップロード
 */
api.post('/upload-folder', async (c) => {
    try {
        const formData = await c.req.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return c.json({ error: 'No files uploaded' }, 400);
        }

        const jobId = uuidv4();
        const slides: any[] = [];

        // ファイルをR2にアップロード
        for (const file of files) {
            const key = `jobs/${jobId}/uploads/${file.name}`;
            await c.env.VIDEO_BUCKET.put(key, file.stream());

            // ファイル名からスライド情報を抽出
            const match = file.name.match(/^(\d+)__(.+)\.(md|txt)$/);
            if (match) {
                const [, id, title, ext] = match;
                const existingSlide = slides.find(s => s.id === id);

                if (existingSlide) {
                    if (ext === 'md') {
                        existingSlide.markdown = await file.text();
                    } else if (ext === 'txt') {
                        existingSlide.script = await file.text();
                    }
                } else {
                    slides.push({
                        id,
                        title,
                        markdown: ext === 'md' ? await file.text() : '',
                        script: ext === 'txt' ? await file.text() : '',
                    });
                }
            }
        }

        // ジョブキューに追加
        const queue = new JobQueue(c.env);
        await queue.addJob(jobId, { slides });

        // コンテナを起動 (オンデマンド)
        const containerManager = new ContainerManager(c.env);
        c.executionCtx.waitUntil(containerManager.startContainer());

        // Durable Objectsにジョブステータスを初期化
        const doId = c.env.JOB_MANAGER.idFromName(jobId);
        const doStub = c.env.JOB_MANAGER.get(doId);
        await doStub.fetch(`https://internal/update/${jobId}`, {
            method: 'POST',
            body: JSON.stringify({
                status: 'pending',
                progress: 0,
                message: 'Job queued',
            }),
        });

        return c.json({
            jobId,
            slidesCount: slides.length,
            message: 'Files uploaded successfully',
        });
    } catch (error) {
        console.error('Upload error:', error);
        return c.json({ error: 'Upload failed' }, 500);
    }
});

/**
 * 手動入力から動画生成
 */
api.post('/generate', async (c) => {
    try {
        const { slides } = await c.req.json();

        if (!slides || !Array.isArray(slides)) {
            return c.json({ error: 'Invalid slides data' }, 400);
        }

        const jobId = uuidv4();

        // ジョブキューに追加
        const queue = new JobQueue(c.env);
        await queue.addJob(jobId, { slides });

        // コンテナを起動 (オンデマンド)
        const containerManager = new ContainerManager(c.env);
        c.executionCtx.waitUntil(containerManager.startContainer());

        // Durable Objectsにジョブステータスを初期化
        const doId = c.env.JOB_MANAGER.idFromName(jobId);
        const doStub = c.env.JOB_MANAGER.get(doId);
        await doStub.fetch(`https://internal/update/${jobId}`, {
            method: 'POST',
            body: JSON.stringify({
                status: 'pending',
                progress: 0,
                message: 'Job queued',
            }),
        });

        return c.json({
            jobId,
            slidesCount: slides.length,
            message: 'Job created successfully',
        });
    } catch (error) {
        console.error('Generate error:', error);
        return c.json({ error: 'Generation failed' }, 500);
    }
});

/**
 * ジョブステータス取得
 */
api.get('/jobs/:id', async (c) => {
    try {
        const jobId = c.req.param('id');

        // Durable Objectsからステータス取得
        const doId = c.env.JOB_MANAGER.idFromName(jobId);
        const doStub = c.env.JOB_MANAGER.get(doId);
        const response = await doStub.fetch(`https://internal/jobs/${jobId}`);

        if (!response.ok) {
            return c.json({ error: 'Job not found' }, 404);
        }

        const status = await response.json();
        return c.json(status);
    } catch (error) {
        console.error('Job status error:', error);
        return c.json({ error: 'Failed to get job status' }, 500);
    }
});

/**
 * 動画URL取得
 */
api.get('/videos/:id', async (c) => {
    try {
        const jobId = c.req.param('id');
        const key = `jobs/${jobId}/final_presentation.mp4`;

        // R2から署名付きURLを生成
        const object = await c.env.VIDEO_BUCKET.head(key);

        if (!object) {
            return c.json({ error: 'Video not found' }, 404);
        }

        // 署名付きURL生成 (1時間有効)
        const url = await c.env.VIDEO_BUCKET.createSignedUrl(key, {
            expiresIn: 3600,
        });

        return c.json({
            url,
            size: object.size,
            uploaded: object.uploaded,
        });
    } catch (error) {
        console.error('Video URL error:', error);
        return c.json({ error: 'Failed to get video URL' }, 500);
    }
});

export { api as apiRoutes };
