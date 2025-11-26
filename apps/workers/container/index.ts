interface Env {
    CONTAINER_API_URL: string;
    R2_BUCKET_NAME: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    VOICEVOX_URL: string;
    // Durable Object binding for the container
    VIDEO_WORKER: DurableObjectNamespace;
}

// Video Worker Container - v1.3

export class VideoWorkerV2 implements DurableObject {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;

        this.state.blockConcurrencyWhile(async () => {
            if (this.state.container) {
                console.log('Video Worker Container starting...');
                // You can pass environment variables to the container here
                await this.state.container.start({
                    env: {
                        CONTAINER_API_URL: env.CONTAINER_API_URL || 'https://presentation-maker.ohchans.com',
                        R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'presentation-videos',
                        R2_ACCOUNT_ID: env.R2_ACCOUNT_ID || '',
                        R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || '',
                        R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || '',
                        VOICEVOX_URL: env.VOICEVOX_URL || 'http://voicevox:50021',
                    },
                    defaultPort: 80,
                    // sleepAfter: '10m', // 10分間アイドル状態が続いたらスリープ (This is not a direct container option, handle via DO logic)
                });
                console.log('Video Worker Container started.');
            }
        });
    }

    async fetch(request: Request): Promise<Response> {
        if (!this.state.container) {
            return new Response("No container associated with this Durable Object.", { status: 400 });
        }
        // Forward the request directly to the managed container
        // Use getTcpPort(80) to access the container's HTTP service
        // @ts-ignore - types might be missing getTcpPort
        return this.state.container.getTcpPort(80).fetch(request);
    }
}

export default {
    async fetch(request: Request, env: Env, _ctx: DurableObjectExecutionContext) {
        // Each Durable Object has a globally unique ID
        const id = env.VIDEO_WORKER.idFromName("worker-instance");
        const stub = env.VIDEO_WORKER.get(id);
        // Forward the request to the Durable Object
        return stub.fetch(request);
    },
    async scheduled(_event: ScheduledEvent, env: Env, _ctx: DurableObjectExecutionContext) {
        // Cronトリガーで定期的にコンテナを起動/維持する
        const id = env.VIDEO_WORKER.idFromName("worker-instance");
        const stub = env.VIDEO_WORKER.get(id);
        await stub.fetch("http://internal/keepalive"); // This request will be handled by the Durable Object's fetch method
    }
};
