/**
 * ジョブキュー (Durable Objectsベース)
 * 
 * Redisの代わりにDurable Objectsを使用してジョブを管理する
 */

import type { Env } from '../api/types';

export class JobQueue {
    private stub: DurableObjectStub;

    constructor(env: Env) {
        // 全てのジョブを単一のDurable Objectインスタンスで管理する (Global Queue)
        const id = env.PRESENTATION_MAKER_JOB_MANAGER.idFromName('global-queue');
        this.stub = env.PRESENTATION_MAKER_JOB_MANAGER.get(id);
    }

    /**
     * ジョブを追加
     */
    async addJob(jobId: string, data: any): Promise<void> {
        const job = {
            jobId,
            data,
        };

        await this.stub.fetch('https://internal/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(job),
        });

        console.log(`Job added to DO queue: ${jobId}`);
    }

    /**
     * ジョブを取得
     */
    async getJob(): Promise<any | null> {
        const response = await this.stub.fetch('https://internal/queue/next');

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    }

    /**
     * ジョブステータスを更新
     */
    async updateJobStatus(jobId: string, status: string, data?: any): Promise<void> {
        const update = {
            status,
            ...data,
        };

        await this.stub.fetch(`https://internal/update/${jobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
        });

        console.log(`Job status updated in DO: ${jobId} -> ${status}`);
    }

    /**
     * ジョブ情報を取得
     */
    async getJobInfo(jobId: string): Promise<any | null> {
        const response = await this.stub.fetch(`https://internal/jobs/${jobId}`);

        if (!response.ok) {
            return null;
        }

        return await response.json();
    }

    /**
     * ジョブを削除 (未実装)
     */
    async deleteJob(jobId: string): Promise<void> {
        // DO側で実装が必要だが、今回は省略
        console.log(`Job deletion requested: ${jobId}`);
    }

    /**
     * 古いジョブをクリーンアップ
     */
    async cleanupOldJobs(_maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
        // DOのアラームで自動的に行われるため、ここでは何もしない
    }
}
