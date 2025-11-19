import { Hono } from 'hono';
import { videoQueue, VideoJobData } from '../queue';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

const app = new Hono();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// Multer middleware wrapper for Hono
const multerMiddleware = (uploadHandler: any) => {
    return async (c: any, next: any) => {
        return new Promise((resolve, reject) => {
            uploadHandler(c.req.raw, {} as any, (err: any) => {
                if (err) reject(err);
                else resolve(next());
            });
        });
    };
};

// Parse uploaded files and create job
app.post('/upload-folder', async (c) => {
    const formData = await c.req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
        return c.json({ error: 'No files uploaded' }, 400);
    }

    try {
        // Group files by slide ID
        const slides = new Map<string, { md?: string, txt?: string }>();

        for (const file of files) {
            const basename = path.basename(file.name);
            const match = basename.match(/^(\d+)__(.*)\.(md|txt)$/);

            if (match) {
                const [, id, , ext] = match;

                if (!slides.has(id)) {
                    slides.set(id, {});
                }

                const content = await file.text();
                const slide = slides.get(id)!;

                if (ext === 'md') {
                    slide.md = content;
                } else if (ext === 'txt') {
                    slide.txt = content;
                }
            }
        }

        // Convert to array format
        const slideArray = Array.from(slides.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, { md, txt }]) => ({
                id,
                markdown: md || '',
                script: txt || '',
            }));

        if (slideArray.length === 0) {
            return c.json({ error: 'No valid slide files found' }, 400);
        }

        // Create job
        const jobId = uuidv4();
        const jobData: VideoJobData = {
            jobId,
            slides: slideArray,
        };

        await videoQueue.add(jobData, {
            jobId,
            removeOnComplete: false,
            removeOnFail: false,
        });

        return c.json({
            jobId,
            slidesCount: slideArray.length,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return c.json({
            error: error instanceof Error ? error.message : 'Upload failed',
        }, 500);
    }
});

// Create job from manual input
app.post('/generate', async (c) => {
    try {
        const { slides } = await c.req.json();

        if (!slides || !Array.isArray(slides) || slides.length === 0) {
            return c.json({ error: 'Invalid slides data' }, 400);
        }

        const jobId = uuidv4();
        const jobData: VideoJobData = {
            jobId,
            slides,
        };

        await videoQueue.add(jobData, {
            jobId,
            removeOnComplete: false,
            removeOnFail: false,
        });

        return c.json({ jobId });
    } catch (error) {
        console.error('Generate error:', error);
        return c.json({
            error: error instanceof Error ? error.message : 'Generation failed',
        }, 500);
    }
});

// Get job status
app.get('/jobs/:jobId', async (c) => {
    try {
        const jobId = c.req.param('jobId');
        const job = await videoQueue.getJob(jobId);

        if (!job) {
            return c.json({ error: 'Job not found' }, 404);
        }

        const state = await job.getState();
        const progress = job.progress();
        const result = job.returnvalue;

        return c.json({
            jobId,
            state,
            progress,
            result,
        });
    } catch (error) {
        console.error('Job status error:', error);
        return c.json({
            error: error instanceof Error ? error.message : 'Failed to get job status',
        }, 500);
    }
});

export default app;
