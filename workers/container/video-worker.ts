/**
 * Video Worker
 * 
 * Cloudflare Container内で動画生成処理を実行
 */

import { JobQueue } from '../../utils/queue';
import { VideoGenerator } from '../../../src/services/VideoGenerator';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// 環境変数
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL!;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'presentation-videos';
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://voicevox:50021';

// R2クライアント (S3互換)
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

/**
 * R2にファイルをアップロード
 */
async function uploadToR2(key: string, data: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: contentType,
    });

    await r2Client.send(command);
    console.log(`Uploaded to R2: ${key}`);
}

/**
 * Durable Objectsにジョブステータスを更新
 */
async function updateJobStatus(jobId: string, status: string, data?: any): Promise<void> {
    // Durable Objects APIにリクエスト
    // 注: Container内からWorkers APIを呼び出す
    const url = `https://api.your-domain.com/internal/jobs/${jobId}/status`;

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...data }),
    });
}

/**
 * ジョブ処理メインループ
 */
async function processJobs() {
    console.log('Video Worker started');

    const env = {
        UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN,
    } as any;

    const queue = new JobQueue(env);

    // アイドルタイムアウト設定 (5分)
    const IDLE_TIMEOUT = 5 * 60 * 1000;
    let lastActivityTime = Date.now();

    while (true) {
        try {
            // ジョブを取得
            const job = await queue.getJob();

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

            console.log(`Processing job: ${job.jobId}`);

            // ステータスを更新
            await queue.updateJobStatus(job.jobId, 'processing', {
                progress: 0,
                message: 'Starting video generation',
            });

            await updateJobStatus(job.jobId, 'processing', {
                progress: 0,
                message: 'Starting video generation',
            });

            // 動画生成
            const generator = new VideoGenerator({
                voicevoxUrl: VOICEVOX_URL,
            });

            const slides = JSON.parse(job.data).slides;
            const totalSlides = slides.length;

            for (let i = 0; i < slides.length; i++) {
                const slide = slides[i];
                const progress = Math.round(((i + 1) / totalSlides) * 100);

                console.log(`Processing slide ${i + 1}/${totalSlides}: ${slide.id}`);

                // 進捗更新
                await queue.updateJobStatus(job.jobId, 'processing', {
                    progress,
                    message: `Processing slide ${i + 1}/${totalSlides}`,
                });

                await updateJobStatus(job.jobId, 'processing', {
                    progress,
                    message: `Processing slide ${i + 1}/${totalSlides}`,
                });

                // スライド処理
                const result = await generator.generateSlide(slide);

                // R2にアップロード
                if (result.audio) {
                    await uploadToR2(
                        `jobs/${job.jobId}/audio/${slide.id}.wav`,
                        result.audio,
                        'audio/wav'
                    );
                }

                if (result.image) {
                    await uploadToR2(
                        `jobs/${job.jobId}/slides/${slide.id}.png`,
                        result.image,
                        'image/png'
                    );
                }

                if (result.video) {
                    await uploadToR2(
                        `jobs/${job.jobId}/videos/${slide.id}.mp4`,
                        result.video,
                        'video/mp4'
                    );
                }
            }

            // 全スライドを結合
            console.log('Combining all slides...');
            await queue.updateJobStatus(job.jobId, 'processing', {
                progress: 95,
                message: 'Combining all slides',
            });

            const finalVideo = await generator.combineVideos(slides);

            // 最終動画をR2にアップロード
            await uploadToR2(
                `jobs/${job.jobId}/final_presentation.mp4`,
                finalVideo,
                'video/mp4'
            );

            // 完了
            await queue.updateJobStatus(job.jobId, 'completed', {
                progress: 100,
                message: 'Video generation completed',
                videoUrl: `jobs/${job.jobId}/final_presentation.mp4`,
            });

            await updateJobStatus(job.jobId, 'completed', {
                progress: 100,
                message: 'Video generation completed',
                videoUrl: `jobs/${job.jobId}/final_presentation.mp4`,
            });

            console.log(`Job completed: ${job.jobId}`);
        } catch (error) {
            console.error('Job processing error:', error);

            // エラー時のステータス更新
            // await queue.updateJobStatus(job.jobId, 'failed', {
            //   error: error.message,
            // });
        }
    }
}

// メイン処理開始
processJobs().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
