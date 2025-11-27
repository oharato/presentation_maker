/**
 * API ルート
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { JobQueue } from '../../utils/queue';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
        const body = await c.req.json();
        const { slides } = body as any;

        if (!slides || !Array.isArray(slides)) {
            return c.json({ error: 'Invalid slides data' }, 400);
        }

        const jobId = uuidv4();

        // Accept optional voice selection and include in job data
        const voicevoxSpeaker = (body as any).voicevoxSpeaker || 1;

        // ジョブキューに追加
        const queue = new JobQueue(c.env);
        await queue.addJob(jobId, { slides, voicevoxSpeaker });

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
        // First, check the Durable Object for job metadata (worker may store videoUrl)
        try {
            const queue = new JobQueue(c.env as any);
            const info = await queue.getJobInfo(jobId);

            if (info && info.videoUrl) {
                // If the DO has a public URL, return the proxy URL but include info from DO
                const url = new URL(c.req.url);
                const proxyUrl = `${url.protocol}//${url.host}/api/videos/${jobId}/download`;

                return c.json({
                    url: proxyUrl,
                    original: info.videoUrl,
                    uploaded: info.updatedAt || null,
                });
            }
        } catch (doErr) {
            console.warn('Failed to read job info from DO:', doErr);
        }

        // If no DO metadata, fall back to checking R2 bucket
        try {
            if (c.env && (c.env as any).PRESENTATION_MAKER_BUCKET) {
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
            }
        } catch (e) {
            console.warn('R2 head failed, will attempt other fallbacks:', e);
        }
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
        // Prefer reading the worker-provided public URL from the Durable Object
        try {
            const queue = new JobQueue(c.env as any);
            const info = await queue.getJobInfo(jobId);
            if (info && info.videoUrl) {
                // Normalize hostname for Docker: if the worker reported localhost:9000,
                // replace with the internal MinIO hostname defined in R2_PUBLIC_URL or by host mapping.
                let targetUrl = info.videoUrl as string;
                try {
                    const parsed = new URL(targetUrl);
                    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                        const publicBase = (c.env as any)?.R2_PUBLIC_URL || 'http://minio:9000/presentation-videos';
                        // Replace the base (protocol + host + possible path) with publicBase
                        const suffix = parsed.pathname.replace(/^\/+/,'');
                        // If original contains /presentation-videos/... preserve suffix after that
                        const idx = suffix.indexOf('presentation-videos/');
                        const finalPath = idx >=0 ? suffix.substring(idx + 'presentation-videos/'.length) : suffix;
                        targetUrl = `${publicBase}/${finalPath}`;
                    }
                } catch (e) {
                    // leave targetUrl as-is
                }

                // Try fetching the worker-provided URL over HTTP and proxy the response
                try {
                    const resp = await fetch(targetUrl);
                    if (resp.ok && resp.body) {
                        return new Response(resp.body, {
                            headers: {
                                'Content-Type': resp.headers.get('Content-Type') || 'video/mp4',
                                'Content-Disposition': `attachment; filename="presentation_${jobId}.mp4"`,
                                'Cache-Control': 'public, max-age=3600',
                            },
                        });
                    }
                    // If fetch returned 403/404, fall through to other fallbacks
                } catch (fetchErr) {
                    console.warn('Failed to fetch worker-provided URL, will try other fallbacks:', fetchErr);
                }
            }
        } catch (doErr) {
            console.warn('Failed to read job info from DO for download:', doErr);
        }

        // Next: try R2 binding directly
        try {
            if (c.env && (c.env as any).PRESENTATION_MAKER_BUCKET) {
                const object = await c.env.PRESENTATION_MAKER_BUCKET.get(key);

                if (object) {
                    return new Response(object.body, {
                        headers: {
                            'Content-Type': 'video/mp4',
                            'Content-Disposition': `attachment; filename="presentation_${jobId}.mp4"`,
                            'Cache-Control': 'public, max-age=3600',
                        },
                    });
                }
            }
        } catch (e) {
            console.warn('R2 get failed, will attempt other fallbacks:', e);
        }

        // Finally, as a last resort, try S3 fallback if configured (MinIO)
        const r2Endpoint = (c.env as any)?.R2_ENDPOINT;
        const r2AccessKey = (c.env as any)?.R2_ACCESS_KEY_ID;
        const r2Secret = (c.env as any)?.R2_SECRET_ACCESS_KEY;
        const r2Bucket = (c.env as any)?.R2_BUCKET_NAME || 'presentation-videos';

        if (r2Endpoint && r2AccessKey && r2Secret) {
            try {
                const s3 = new S3Client({
                    endpoint: r2Endpoint,
                    region: 'us-east-1',
                    credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2Secret },
                    forcePathStyle: true,
                } as any);

                const getCmd = new GetObjectCommand({ Bucket: r2Bucket, Key: key });
                const resp = await s3.send(getCmd);

                return new Response(resp.Body as any, {
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Content-Disposition': `attachment; filename="presentation_${jobId}.mp4"`,
                        'Cache-Control': 'public, max-age=3600',
                    },
                });
            } catch (s3err) {
                console.error('S3 fallback error:', s3err);
                return c.json({ error: 'Video not found' }, 404);
            }
        }

        return c.json({ error: 'Video not found' }, 404);
    } catch (error) {
        console.error('Video download error:', error);
        return c.json({ error: 'Failed to download video' }, 500);
    }
});

export { api as apiRoutes };
