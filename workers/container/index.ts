import { Container } from '@cloudflare/containers';

// Video Worker Container - v1.3

export class VideoWorkerV2 extends Container {
    defaultPort = 80;
    sleepAfter = '10m'; // 10分間アイドル状態が続いたらスリープ

    constructor(state: any, env: any) {
        super(state, env);
        // envから環境変数を取得してコンテナに渡す
        this.envVars = {
            CONTAINER_API_URL: env.CONTAINER_API_URL || 'https://presentation-maker.ohchans.com',
            R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'presentation-videos',
            R2_ACCOUNT_ID: env.R2_ACCOUNT_ID || '',
            R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || '',
            R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || '',
            VOICEVOX_URL: env.VOICEVOX_URL || 'http://voicevox:50021',
        };
    }

    // コンテナ起動時のフック
    override onStart() {
        console.log('Video Worker Container started');
    }

    // コンテナ停止時のフック
    override onStop() {
        console.log('Video Worker Container stopped');
    }

    // エラー時のフック
    override onError(error: unknown) {
        console.log('Video Worker Container error:', error);
    }
}

export default {
    async fetch(request: Request, env: any, _ctx: any) {
        // 固定のコンテナインスタンスを使用
        const container = env.VIDEO_WORKER.getByName("worker-instance");
        return await container.fetch(request);
    },
    async scheduled(_event: any, env: any, _ctx: any) {
        // Cronトリガーで定期的にコンテナを起動/維持する
        const container = env.VIDEO_WORKER.getByName("worker-instance");
        await container.fetch("http://internal/keepalive");
    }
};
