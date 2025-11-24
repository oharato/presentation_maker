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
        const filesEntries = formData.getAll('files') as (File | string)[];
        const files = filesEntries.filter((f): f is File => f instanceof File);

        if (!files || files.length === 0) {
            return c.json({ error: 'No files uploaded' }, 400);
        }

        const jobId = uuidv4();
        const slides: any[] = [];

        // ファイルをR2にアップロード
        for (const file of files) {
            const key = `jobs/${jobId}/uploads/${file.name}`;
            console.log(`Uploading file to R2: ${key}, size: ${file.size}`);
            try {
                await c.env.PRESENTATION_MAKER_BUCKET.put(key, file.stream());
                console.log(`Successfully uploaded: ${key}`);
            } catch (uploadError) {
                console.error(`Failed to upload ${key}:`, uploadError);
                throw uploadError;
            }

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

        // ジョブキューに追加 (DOへの保存も含む)
        const queue = new JobQueue(c.env);
        await queue.addJob(jobId, { slides });

        // コンテナを起動 (オンデマンド)
        const containerManager = new ContainerManager(c.env);
        c.executionCtx.waitUntil(containerManager.startContainer());

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
        const queue = new JobQueue(c.env);
        const status = await queue.getJobInfo(jobId);

        if (!status) {
            return c.json({ error: 'Job not found' }, 404);
        }

        return c.json(status);
        return c.json(status);
    } catch (error) {
        console.error('Job status error:', error);
        return c.json({ error: 'Failed to get job status' }, 500);
    }
});

/**
 * [Internal] 次のジョブを取得 (コンテナ用)
 */
/**
 * [Internal] 次のジョブを取得 (コンテナ用)
 */
api.get('/internal/queue/next', async (c) => {
    console.log(`[Internal] GET /queue/next called from ${c.req.header('User-Agent')}`);
    try {
        const queue = new JobQueue(c.env);
        const job = await queue.getJob();

        if (!job) {
            console.log('[Internal] No job available (204)');
            return c.body(null, 204); // No Content
        }

        console.log(`[Internal] Job dispatched: ${job.jobId}`);
        return c.json(job);
    } catch (error) {
        console.error('[Internal] Queue error:', error);
        return c.json({ error: 'Failed to get next job' }, 500);
    }
});

/**
 * [Internal] ジョブステータス更新 (コンテナ用)
 */
api.post('/internal/jobs/:id/status', async (c) => {
    try {
        const jobId = c.req.param('id');
        const { status, ...data } = await c.req.json();

        const queue = new JobQueue(c.env);
        await queue.updateJobStatus(jobId, status, data);

        return c.json({ success: true });
    } catch (error) {
        console.error('Update status error:', error);
        return c.json({ error: 'Failed to update status' }, 500);
    }
});

/**
 * 動画URL取得
 */
api.get('/videos/:id', async (c) => {
    try {
        const jobId = c.req.param('id');
        const key = `jobs/${jobId}/final_presentation.mp4`;

        // R2からオブジェクトの存在確認
        const object = await c.env.PRESENTATION_MAKER_BUCKET.head(key);

        if (!object) {
            return c.json({ error: 'Video not found' }, 404);
        }

        // Workers経由のプロキシURL（R2は署名付きURLをネイティブサポートしていないため）
        const url = new URL(c.req.url);
        const proxyUrl = `${url.protocol}//${url.host}/api/videos/${jobId}/download`;

        return c.json({
            url: proxyUrl,
            size: object.size,
            uploaded: object.uploaded,
        });
    } catch (error) {
        console.error('Video URL error:', error);
        return c.json({ error: 'Failed to get video URL' }, 500);
    }
});

/**
 * 動画ダウンロード（R2プロキシ）
 */
api.get('/videos/:id/download', async (c) => {
    try {
        const jobId = c.req.param('id');
        const key = `jobs/${jobId}/final_presentation.mp4`;

        // R2からオブジェクトを取得
        const object = await c.env.PRESENTATION_MAKER_BUCKET.get(key);

        if (!object) {
            return c.json({ error: 'Video not found' }, 404);
        }

        // ストリーミングレスポンスを返す
        return new Response(object.body, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="presentation_${jobId}.mp4"`,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('Video download error:', error);
        return c.json({ error: 'Failed to download video' }, 500);
    }
});

export { api as apiRoutes };
