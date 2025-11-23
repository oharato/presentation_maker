/**
 * Video Worker
 * 
 * Cloudflare Container内で動画生成処理を実行
 */

import { VideoGenerator } from '../../../src/services/VideoGenerator';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';

// 環境変数
const API_URL = process.env.CONTAINER_API_URL || 'http://host.docker.internal:8787';
const API_TOKEN = process.env.CONTAINER_API_TOKEN || 'dev-token';
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5分

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'presentation-videos';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://voicevox:50021';

// R2クライアント (S3互換)
const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

/**
 * ジョブを取得 (API経由)
 */
async function getJob() {
    try {
        const response = await fetch(`${API_URL}/api/internal/queue/next`, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
            },
        });

        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`Failed to get job: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error getting job:', error);
        return null;
    }
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
                if (Date.now() - lastActivityTime > IDLE_TIMEOUT) {
                    console.log('Idle timeout reached. Shutting down container...');
                    process.exit(0); // コンテナを終了
                }

                // ジョブがない場合は待機
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // アクティビティ時間を更新
            lastActivityTime = Date.now();

            const { jobId, slides } = job;
            console.log(`Processing job: ${jobId}`);

            await updateJobStatus(jobId, 'processing', { progress: 0, message: 'Starting video generation' });

            try {
                // 動画生成
                const generator = new VideoGenerator(
                    path.join(process.cwd(), 'temp'),
                    path.join(process.cwd(), 'output')
                );

                const outputPath = await generator.generate(slides, async (progress, message) => {
                    await updateJobStatus(jobId, 'processing', { progress, message });
                });

                // R2にアップロード
                const fileContent = await fs.readFile(outputPath);
                const key = `videos/${jobId}.mp4`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: key,
                    Body: fileContent,
                    ContentType: 'video/mp4',
                }));

                // 完了通知
                await updateJobStatus(jobId, 'completed', {
                    progress: 100,
                    message: 'Video generation completed',
                    videoUrl: `${R2_PUBLIC_URL}/${key}`,
                });

                // 一時ファイル削除
                await fs.remove(outputPath);

            } catch (error: any) {
                console.error(`Job failed: ${jobId}`, error);
                await updateJobStatus(jobId, 'failed', {
                    message: error.message || 'Unknown error',
                });
            }

        } catch (error) {
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
