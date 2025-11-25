/// <reference types="@cloudflare/workers-types" />
import type { Context as HonoContext } from 'hono';

export interface Env {
    ENVIRONMENT: string;
    PRESENTATION_MAKER_BUCKET: R2Bucket;
    PRESENTATION_MAKER_JOB_MANAGER: DurableObjectNamespace;
    PRESENTATION_MAKER_CACHE: KVNamespace;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    JWT_SECRET: string;
    ALLOWED_ORIGINS: string;
    CONTAINER_API_URL?: string;
    CONTAINER_API_TOKEN?: string;
    MOCK_QUEUE?: string; // ローカル開発用
}

export type Variables = {
    userId?: string;
    user?: any;
};

export type Context = HonoContext<{ Bindings: Env; Variables: Variables }>;
