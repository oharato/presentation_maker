/**
 * コンテナ管理ユーティリティ
 * 
 * 外部コンテナサービス（Fly.io, Google Cloud Run等）の起動を制御する
 */

import type { Env } from '../src/types';

export class ContainerManager {
    private env: Env;

    constructor(env: Env) {
        this.env = env;
    }

    /**
     * コンテナを起動する
     * 
     * ジョブが投入されたときに呼び出される
     */
    async startContainer(): Promise<void> {
        // コンテナAPIのURLが設定されていない場合はスキップ（開発環境など）
        if (!this.env.CONTAINER_API_URL) {
            console.log('Container API URL not set, skipping container start');
            return;
        }

        try {
            console.log('Starting container...');

            const response = await fetch(this.env.CONTAINER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.CONTAINER_API_TOKEN || ''}`,
                },
                body: JSON.stringify({
                    action: 'start',
                    timestamp: Date.now(),
                }),
            });

            if (!response.ok) {
                throw new Error(`Container start failed: ${response.status} ${response.statusText}`);
            }

            console.log('Container start request sent successfully');
        } catch (error) {
            console.error('Failed to start container:', error);
            // エラーを投げてもジョブ登録自体は成功させるべきなので、ログ出力のみ
        }
    }
}
