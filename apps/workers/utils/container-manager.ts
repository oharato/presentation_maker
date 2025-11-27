/**
 * コンテナ管理ユーティリティ
 * 
 * 外部コンテナサービス（Fly.io, Google Cloud Run等）の起動を制御する
 */

import type { Env } from '../api/types';

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
        // 本来は Cloudflare Worker の Bindings (c.env) を参照するが、
        // wrangler dev 環境や Docker 内で実行する場合はプロセス環境変数に設定していることがある。
        const containerApiUrl = (this.env && (this.env as any).CONTAINER_API_URL) || (typeof process !== 'undefined' ? process.env.CONTAINER_API_URL : undefined);
        const containerApiToken = (this.env && (this.env as any).CONTAINER_API_TOKEN) || (typeof process !== 'undefined' ? process.env.CONTAINER_API_TOKEN : undefined);

        // 開発環境であれば docker-compose のサービス名を使ったフォールバックを許容する
        const envName = (this.env && (this.env as any).ENVIRONMENT) || (typeof process !== 'undefined' ? process.env.ENVIRONMENT : undefined);
        let resolvedContainerApiUrl = containerApiUrl;
        if (!resolvedContainerApiUrl && envName === 'development') {
            resolvedContainerApiUrl = 'http://video-worker:80';
            console.log('Container API URL not provided in bindings; using development fallback:', resolvedContainerApiUrl);
        }

        if (!resolvedContainerApiUrl) {
            console.log('Container API URL not set, skipping container start');
            return;
        }

        try {
            console.log('Starting container...');

            const response = await fetch(resolvedContainerApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${containerApiToken || ''}`,
                },
                body: JSON.stringify({
                    action: 'start',
                    timestamp: Date.now(),
                }),
            });

            // Log status and body for easier debugging (405 / 4xx responses)
            const respText = await response.text().catch(() => '<no-body>');
            console.log(`Container start response: ${response.status} ${response.statusText} - ${respText}`);

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
