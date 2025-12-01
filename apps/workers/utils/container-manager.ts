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
        
        // Production環境では、コンテナはCronトリガーによって自動的に管理（ポーリング）されるため、
        // ここで明示的に起動リクエストを送る必要はない（むしろ送るとFrontendにルーティングされてしまう問題がある）。
        // 開発環境など、明示的にURLが指定されている場合のみ実行するロジックに変更するか、
        // もしくは完全に無効化する。ここではシンプルにログを出して終了する。
        console.log('Container start requested. (Skipping explicit start request as container is self-managed/cron-triggered in production)');
        return;
    }
}
