import type { Context as HonoContext } from 'hono';

export interface Env {
    ENVIRONMENT: string;
    VIDEO_BUCKET: R2Bucket;
    JOB_MANAGER: DurableObjectNamespace;
    CACHE: KVNamespace;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    JWT_SECRET: string;
    ALLOWED_ORIGINS: string;
    CONTAINER_API_URL?: string;
    CONTAINER_API_TOKEN?: string;
    MOCK_QUEUE?: string; // ローカル開発用
}

export interface Variables {
    userId?: string;
    user?: any;
}

export type Context = HonoContext<{ Bindings: Env; Variables: Variables }>;
