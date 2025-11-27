/**
 * Video Worker
 * 
 * Cloudflare Container内で動画生成処理を実行
 */

import {
    config,
    VideoGenerator,
    SlideRenderer,
    VoicevoxService
} from '@presentation-maker/core';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import http from 'http';

// HTTPサーバー起動 (Cloudflare Containers用)
const PORT = process.env.PORT || 80;
const server = http.createServer((req, res) => {
    // Respond to keepalive probes and any basic request
    if (req.url && req.url.includes('keepalive')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Video Worker is running');
});

// Listen on the given port. Avoid forcing a host to increase likelihood the
// process binds to all available interfaces (IPv4/IPv6 differences between
// platforms can cause EADDRNOTAVAIL when binding to a specific IP).
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const PORT_NUM = Number(PORT) || 80;

// Prefer listening without an explicit host so the OS chooses the best
// interface mapping (this binds to all addresses). Keep LISTEN_HOST for
// informational logging and backward-compatibility via env override.
server.listen(PORT_NUM, () => {
    // Attempt to read the address information after bind
    try {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
            console.log(`Server listening on ${addr.address}:${(addr as any).port}`);
        } else {
            console.log(`Server listening on port ${PORT_NUM} (host: ${LISTEN_HOST})`);
        }

        // Print network interfaces to help debugging which IPs are assigned inside the container
        try {
            const { networkInterfaces } = require('os');
            const ifaces = networkInterfaces();
            console.log('Network interfaces:', JSON.stringify(ifaces, null, 2));
        } catch (e) {
            console.warn('Failed to list network interfaces', e);
        }
    } catch (e) {
        console.warn('Failed to report server address after listen', e);
    }
});

// Server-level error handling to surface listen/binding errors to logs
server.on('error', (err) => {
    console.error('HTTP server error:', err && err.message ? err.message : err);
});

// Global process-level handlers to capture uncaught errors/rejections in logs
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err && err.stack ? err.stack : err);
    // Give logs a moment to flush
    setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

// 環境変数
const API_URL = process.env.CONTAINER_API_URL || 'http://host.docker.internal:8787';
const API_TOKEN = process.env.CONTAINER_API_TOKEN || 'dev-token';
// アイドル時のタイムアウト (ms)。環境変数 `IDLE_TIMEOUT_MS` で上書き可能。
// `DISABLE_IDLE_SHUTDOWN=true` を渡すとアイドル時にコンテナを終了しない（開発用）
const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT_MS || String(5 * 60 * 1000), 10);
const DISABLE_IDLE_SHUTDOWN = process.env.DISABLE_IDLE_SHUTDOWN === 'true';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'presentation-videos';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';

// R2クライアント (S3互換)
// R2クライアント (S3互換)
console.log(`Initializing S3Client with endpoint: ${R2_ENDPOINT}`);
const s3Client = new S3Client({
    region: 'us-east-1', // R2互換のためus-east-1を指定
    endpoint: R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

/**
 * R2からファイルをダウンロード
 */
async function downloadFileFromR2(jobId: string, filePath: string, destinationPath: string): Promise<void> {
    const key = `jobs/${jobId}/uploads/${filePath}`;
    const { Body } = await s3Client.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
    }));

    if (!Body) {
        throw new Error(`File not found in R2: ${key}`);
    }

    await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(destinationPath);
        Readable.fromWeb(Body.transformToWebStream() as any).pipe(writeStream)
            .on('finish', () => resolve(undefined))
            .on('error', reject);
    });
    console.log(`Downloaded ${key} to ${destinationPath}`);
}

/**
 * R2にファイルをアップロード
 */
async function uploadFileToR2(jobId: string, filePath: string, fileContent: Buffer, contentType: string): Promise<string> {
    const key = `jobs/${jobId}/${filePath}`;
    await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
    }));
    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/jobs/${jobId}/${filePath}` : `s3://${R2_BUCKET_NAME}/${key}`;
    console.log(`Uploaded ${filePath} to R2 as ${key}. Public URL: ${publicUrl}`);
    return publicUrl;
}

/**
 * ジョブを取得 (API経由)
 */
async function getJob() {
    const maxAttempts = 4;
    const baseDelay = 2000; // ms

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`${API_URL}/api/internal/queue/next`, {
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'User-Agent': 'VideoWorker/1.0',
                },
            });

            if (response.status === 204) {
                return null;
            }

            if (response.status === 429) {
                console.warn('Rate limited (429). Waiting before retry...');
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30秒待機
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to get job: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error: any) {
            const isLast = attempt === maxAttempts;
            console.error(`Error getting job (attempt ${attempt}/${maxAttempts}):`, error && error.message ? error.message : error);
            if (isLast) {
                console.error('Max attempts reached while fetching job. Will wait before next poll.');
                return null;
            }

            // Exponential backoff with jitter
            const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
            console.log(`Retrying getJob after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
    }

    return null;
}

/**
 * ジョブステータス更新 (API経由)
 */
async function updateJobStatus(jobId: string, status: string, data?: any) {
    try {
        await fetch(`${API_URL}/api/internal/jobs/${jobId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`,
            },
            body: JSON.stringify({
                status,
                ...data,
            }),
        });
        console.log(`Job status updated: ${jobId} -> ${status}`);
    } catch (error) {
        console.error('Error updating job status:', error);
    }
}

async function main() {
    console.log('Video Worker started');
    console.log(`API URL: ${API_URL}`);

    let lastActivityTime = Date.now();

    while (true) {
        try {
            const job = await getJob();

            if (!job) {
                // アイドルチェック
                if (!DISABLE_IDLE_SHUTDOWN && IDLE_TIMEOUT > 0 && Date.now() - lastActivityTime > IDLE_TIMEOUT) {
                    console.log('Idle timeout reached. Shutting down container...');
                    process.exit(0); // コンテナを終了
                }

                // ジョブがない場合は待機 (10秒)
                if (Date.now() % 60000 < 10000) { // およそ1分ごとにログ出力
                    console.log('Waiting for jobs... (Idle)');
                }
                await new Promise(resolve => setTimeout(resolve, 10000));
                continue;
            }

            // アクティビティ時間を更新
            lastActivityTime = Date.now();

            let jobId: string | undefined;
            let tempDir: string | undefined;
            let outputDir: string | undefined;

            try {
                console.log('Received job:', JSON.stringify(job, null, 2));

                const jobData = job as { jobId: string; data: { slides: any[]; voicevoxSpeaker?: number } };
                jobId = jobData.jobId;
                const slides = jobData.data?.slides;

                if (!slides || !Array.isArray(slides)) {
                    throw new Error(`Invalid job data: slides is ${typeof slides}. Job data: ${JSON.stringify(job)}`);
                }

                console.log(`Processing job: ${jobId} with ${slides.length} slides`);

                await updateJobStatus(jobId, 'processing', { progress: 0, message: 'Starting video generation' });

                tempDir = path.join(process.cwd(), 'temp', jobId);
                outputDir = path.join(process.cwd(), 'output', jobId);

                await fs.ensureDir(tempDir);
                await fs.ensureDir(outputDir);

                const videoGenerator = new VideoGenerator();
                const slideRenderer = new SlideRenderer();

                // Allow job to specify a Voicevox speaker id
                const jobVoiceSpeaker = jobData.data?.voicevoxSpeaker ?? 1;
                const voicevoxService = new VoicevoxService(VOICEVOX_URL, jobVoiceSpeaker);

                const finalVideoPaths: string[] = [];

                for (let i = 0; i < slides.length; i++) {
                    const slide = slides[i];
                    const slideId = slide.id;
                    const slideTitle = slide.title || `slide_${i + 1}`; // titleがない場合はデフォルト値

                    await updateJobStatus(jobId, 'processing', {
                        progress: Math.floor((i / slides.length) * 100),
                        message: `Processing slide ${slideId}: ${slideTitle}`,
                    });

                    const markdownFileName = `${slideId}__${slideTitle}.md`;
                    const scriptFileName = `${slideId}__${slideTitle}.txt`;

                    const markdownPath = path.join(tempDir, markdownFileName);
                    const scriptPath = path.join(tempDir, scriptFileName);
                    const imagePath = path.join(tempDir, `${slideId}__${slideTitle}.png`);
                    const audioPath = path.join(outputDir, `${slideId}__${slideTitle}.wav`);
                    const silentVideoPath = path.join(outputDir, `${slideId}__${slideTitle}.nosound.mp4`);
                    const mergedVideoPath = path.join(outputDir, `${slideId}__${slideTitle}.mp4`);

                    // 1. Prepare markdown and script files
                    // Check if content is provided directly in the job data
                    if (slide.markdown) {
                        await fs.writeFile(markdownPath, slide.markdown);
                        console.log(`Wrote markdown for slide ${slideId} from job data`);
                    } else {
                        try {
                            await downloadFileFromR2(jobId, markdownFileName, markdownPath);
                        } catch (e) {
                            console.warn(`Markdown file for slide ${slideId} not found in R2. Skipping.`, e);
                        }
                    }

                    if (slide.script) {
                        await fs.writeFile(scriptPath, slide.script);
                        console.log(`Wrote script for slide ${slideId} from job data`);
                    } else {
                        try {
                            await downloadFileFromR2(jobId, scriptFileName, scriptPath);
                        } catch (e) {
                            console.warn(`Script file for slide ${slideId} not found in R2. Skipping.`, e);
                        }
                    }

                    let slideDuration = 0;

                    // 2. Generate audio from script (if exists)
                    if (await fs.pathExists(scriptPath)) {
                        const scriptContent = await fs.readFile(scriptPath, 'utf8');
                        await voicevoxService.generateAudio(scriptContent, audioPath);
                        slideDuration = await videoGenerator.getAudioDuration(audioPath);
                        console.log(`Generated audio for slide ${slideId}, duration: ${slideDuration}s`);
                    }

                    // 3. Render markdown to image
                    if (await fs.pathExists(markdownPath)) {
                        const markdownContent = await fs.readFile(markdownPath, 'utf8');
                        await slideRenderer.renderSlide(markdownContent, imagePath);
                        console.log(`Rendered image for slide ${slideId}`);
                    } else {
                        // If no markdown, create a blank image (or use a default)
                        console.warn(`No markdown file for slide ${slideId}. Using a placeholder for image path.`);
                        const blankPngPath = path.join(process.cwd(), 'blank.png'); // /app/blank.png
                        await fs.copyFile(blankPngPath, imagePath);
                    }

                    // 4. Create silent video from image
                    if (slideDuration === 0) {
                        // If no audio script, default to a fixed duration
                        slideDuration = 5; // Default 5 seconds
                        console.log(`No audio script for slide ${slideId}. Defaulting silent video duration to ${slideDuration}s.`);
                    }
                    await videoGenerator.createSilentVideo(imagePath, slideDuration, silentVideoPath);
                    console.log(`Created silent video for slide ${slideId}`);
                    await uploadFileToR2(jobId, `0${slideId}__${slideTitle}.nosound.mp4`, await fs.readFile(silentVideoPath), 'video/mp4');

                    // 5. Merge audio and silent video
                    if (await fs.pathExists(audioPath) && await fs.pathExists(silentVideoPath)) {
                        await videoGenerator.mergeAudioVideo(silentVideoPath, audioPath, mergedVideoPath);
                        console.log(`Merged audio and video for slide ${slideId}`);
                        finalVideoPaths.push(mergedVideoPath);
                        await uploadFileToR2(jobId, `0${slideId}__${slideTitle}.mp4`, await fs.readFile(mergedVideoPath), 'video/mp4');
                    } else if (await fs.pathExists(silentVideoPath)) {
                        // If no audio, use silent video as final slide video
                        finalVideoPaths.push(silentVideoPath);
                        await uploadFileToR2(jobId, `0${slideId}__${slideTitle}.mp4`, await fs.readFile(silentVideoPath), 'video/mp4');
                    } else {
                        console.warn(`Skipping final video for slide ${slideId} due to missing silent video or audio.`);
                    }
                }

                // 6. Concatenate all final slide videos
                let finalPresentationPath = '';
                let finalPublicUrl: string | undefined = undefined;
                if (finalVideoPaths.length > 0) {
                    finalPresentationPath = path.join(outputDir, 'final_presentation.mp4');
                    await videoGenerator.concatVideos(finalVideoPaths, finalPresentationPath);
                    console.log('Concatenated all slide videos.');

                    // 7. Upload final presentation to R2
                    const fileContent = await fs.readFile(finalPresentationPath);
                    const key = `final_presentation.mp4`; // Key within the job folder
                    finalPublicUrl = await uploadFileToR2(jobId, key, fileContent, 'video/mp4');
                }

                // 8. Completed notification
                await updateJobStatus(jobId, 'completed', {
                    progress: 100,
                    message: 'Video generation completed',
                    videoUrl: typeof finalPublicUrl !== 'undefined' ? finalPublicUrl : (finalPresentationPath ? `${R2_PUBLIC_URL}/jobs/${jobId}/final_presentation.mp4` : undefined),
                });

            } catch (error: any) { // Catch for specific job failure
                console.error(`Job failed: ${jobId || 'unknown'}`, error);
                await updateJobStatus(jobId || 'unknown-job', 'failed', {
                    message: error.message || 'Unknown error',
                });
            } finally {
                // 9. Clean up temporary files
                if (tempDir) {
                    await fs.remove(tempDir).catch(e => console.error("Error cleaning temp dir:", e));
                }
                if (outputDir) {
                    await fs.remove(outputDir).catch(e => console.error("Error cleaning output dir:", e));
                }
            }

        } catch (error) { // Outer catch for worker loop errors (e.g., getJob failing)
            console.error('Worker loop error:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// メイン処理開始
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
