import { Container } from '@cloudflare/containers';

export class VideoWorkerV2 extends Container {
    defaultPort = 80;
    sleepAfter = '10m'; // 10分間アイドル状態が続いたらスリープ

    // コンテナに渡す環境変数
    envVars = {
        CONTAINER_API_URL: 'https://presentation-maker.ohchans.com',
        R2_BUCKET_NAME: 'presentation-videos',
        // R2認証情報は別途secretsで設定する必要があります
    };

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
    async fetch(request: Request, env: any, ctx: any) {
        // 固定のコンテナインスタンスを使用
        const container = env.VIDEO_WORKER.getByName("worker-instance");
        return await container.fetch(request);
    },
    async scheduled(event: any, env: any, ctx: any) {
        // Cronトリガーで定期的にコンテナを起動/維持する
        const container = env.VIDEO_WORKER.getByName("worker-instance");
        await container.fetch("http://internal/keepalive");
    }
};
