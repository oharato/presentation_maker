import { Container, getContainer } from "@cloudflare/containers";
import { Hono } from "hono";

interface Env {
    CONTAINER_API_URL: string;
    CONTAINER_API_TOKEN: string; // Secret
    R2_BUCKET_NAME: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    VOICEVOX_URL: string;
    // Durable Object binding for the container
    VIDEO_WORKER: DurableObjectNamespace;
}

// Video Worker Container - v2.0 (Using @cloudflare/containers)

export class VideoWorkerV2 extends Container<Env> {
    // Port the container listens on (default: 80)
    defaultPort = 80;
    // Time before container sleeps due to inactivity
    // Since we rely on cron to keep it alive/polling, we might set this high
    // or rely on the cron to re-wake it.
    sleepAfter = "10m";

    // Environment variables passed to the container
    // Initialized in constructor to ensure access to this.env
    envVars!: Record<string, string>;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.envVars = {
            CONTAINER_API_URL: env.CONTAINER_API_URL || 'https://presentation-maker.ohchans.com',
            CONTAINER_API_TOKEN: env.CONTAINER_API_TOKEN,
            R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'presentation-videos',
            R2_ACCOUNT_ID: env.R2_ACCOUNT_ID || '',
            R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || '',
            R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || '',
            VOICEVOX_URL: env.VOICEVOX_URL || 'http://voicevox:50021',
        };
    }

    override onStart() {
        console.log("Video Worker Container successfully started");
    }

    override onStop() {
        console.log("Video Worker Container successfully shut down");
    }

    override onError(error: unknown) {
        console.error("Video Worker Container error:", error);
    }
}

// Create Hono app with proper typing for Cloudflare Workers
const app = new Hono<{
    Bindings: Env;
}>();

// Route requests to the video worker
app.all("*", async (c) => {
    // We use a singleton pattern here (or specific ID)
    const container = getContainer(c.env.VIDEO_WORKER, "worker-instance");
    return await container.fetch(c.req.raw);
});

export default {
    fetch: app.fetch,
    async scheduled(_event: ScheduledEvent, env: Env, _ctx: DurableObjectExecutionContext) {
        // Cron triggers to keep the container alive/polling
        // We use the same ID "worker-instance"
        const container = getContainer(env.VIDEO_WORKER, "worker-instance");

        const maxRetries = 5;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Try to get debug info
                const res = await container.fetch("http://internal/debug");
                if (res.ok) {
                    const text = await res.text();
                    console.log("Container Status:", text);
                    return; // Success
                } else {
                    console.log(`Container Keepalive status: ${res.status}`);
                    // 502/503 indicates connectivity issues (starting up), so retry
                    if (res.status !== 502 && res.status !== 503) {
                        return;
                    }
                }
            } catch (e) {
                lastError = e;
                console.log(`Probe attempt ${attempt}/${maxRetries} failed: ${e instanceof Error ? e.message : e}`);
            }

            if (attempt < maxRetries) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
            }
        }
        
        console.error("Failed to probe container after retries:", lastError);
    }
};