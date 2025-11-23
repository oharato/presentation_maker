/**
 * ジョブキュー (Upstash Redis)
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../src/types';

export class JobQueue {
    private redis: Redis | null = null;
    private env: Env;
    private useMock: boolean;

    constructor(env: Env) {
        this.env = env;
        this.useMock = env.MOCK_QUEUE === 'true';

        if (!this.useMock) {
            this.redis = new Redis({
                url: env.UPSTASH_REDIS_REST_URL,
                token: env.UPSTASH_REDIS_REST_TOKEN,
            });
        }
    }

    /**
     * ジョブを追加
     */
    async addJob(jobId: string, data: any): Promise<void> {
        const job = {
            jobId,
            data,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };

        if (this.useMock) {
            // Mock: KVを使用
            await this.env.CACHE.put(`job:${jobId}`, JSON.stringify(job));

            // Pendingリストを擬似的に管理 (カンマ区切り文字列)
            let pending = await this.env.CACHE.get('jobs:pending') || '';
            pending = pending ? `${pending},${jobId}` : jobId;
            await this.env.CACHE.put('jobs:pending', pending);

            console.log(`[Mock] Job added: ${jobId}`);
        } else {
            // Redis
            await this.redis!.hset(`job:${jobId}`, job);
            await this.redis!.lpush('jobs:pending', jobId);
            console.log(`Job added: ${jobId}`);
        }
    }

    /**
     * ジョブを取得
     */
    async getJob(): Promise<any | null> {
        if (this.useMock) {
            // Mock: KVを使用
            let pendingStr = await this.env.CACHE.get('jobs:pending');
            if (!pendingStr) return null;

            const pending = pendingStr.split(',');
            const jobId = pending.shift(); // 先頭を取得

            if (!jobId) return null;

            // リスト更新
            await this.env.CACHE.put('jobs:pending', pending.join(','));

            // ジョブデータ取得
            const jobStr = await this.env.CACHE.get(`job:${jobId}`);
            if (!jobStr) return null;

            const job = JSON.parse(jobStr);

            // 処理中リストに追加 (Mockでは省略可だが一応)
            // await this.env.CACHE.put('jobs:processing', ...);

            return job;
        } else {
            // Redis
            const jobId = await this.redis!.rpop('jobs:pending');
            if (!jobId) return null;

            const job = await this.redis!.hgetall(`job:${jobId}`);
            if (!job) {
                console.warn(`Job data not found: ${jobId}`);
                return null;
            }

            await this.redis!.lpush('jobs:processing', jobId);
            return job;
        }
    }

    /**
     * ジョブステータスを更新
     */
    async updateJobStatus(jobId: string, status: string, data?: any): Promise<void> {
        const update = {
            status,
            updatedAt: new Date().toISOString(),
            ...data,
        };

        if (this.useMock) {
            // Mock: KVを使用
            const jobStr = await this.env.CACHE.get(`job:${jobId}`);
            if (jobStr) {
                const job = JSON.parse(jobStr);
                const updatedJob = { ...job, ...update };
                await this.env.CACHE.put(`job:${jobId}`, JSON.stringify(updatedJob));
                console.log(`[Mock] Job status updated: ${jobId} -> ${status}`);
            }
        } else {
            // Redis
            await this.redis!.hset(`job:${jobId}`, update);

            if (status === 'completed' || status === 'failed') {
                await this.redis!.lrem('jobs:processing', 0, jobId);
                await this.redis!.lpush(`jobs:${status}`, jobId);
            }
            console.log(`Job status updated: ${jobId} -> ${status}`);
        }
    }

    /**
     * ジョブ情報を取得
     */
    async getJobInfo(jobId: string): Promise<any | null> {
        if (this.useMock) {
            const jobStr = await this.env.CACHE.get(`job:${jobId}`);
            return jobStr ? JSON.parse(jobStr) : null;
        } else {
            const job = await this.redis!.hgetall(`job:${jobId}`);
            return job || null;
        }
    }

    /**
     * ジョブを削除
     */
    async deleteJob(jobId: string): Promise<void> {
        if (this.useMock) {
            await this.env.CACHE.delete(`job:${jobId}`);
        } else {
            await this.redis!.del(`job:${jobId}`);
        }
        console.log(`Job deleted: ${jobId}`);
    }

    /**
     * 古いジョブをクリーンアップ
     */
    async cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
        // Mockモードでのクリーンアップは省略
        if (this.useMock) return;

        const now = Date.now();
        const queues = ['jobs:completed', 'jobs:failed'];

        for (const queue of queues) {
            const jobIds = await this.redis!.lrange(queue, 0, -1);

            for (const jobId of jobIds) {
                const job = await this.getJobInfo(jobId as string);

                if (job && job.updatedAt) {
                    const updatedAt = new Date(job.updatedAt).getTime();

                    if (now - updatedAt > maxAge) {
                        await this.deleteJob(jobId as string);
                        await this.redis!.lrem(queue, 0, jobId);
                        console.log(`Cleaned up old job: ${jobId}`);
                    }
                }
            }
        }
    }
}
