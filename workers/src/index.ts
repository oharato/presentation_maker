/**
 * Cloudflare Workers エントリーポイント
 * 
 * HonoベースのAPIゲートウェイ
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { apiRoutes } from './routes/api';
import { wsRoutes } from './routes/websocket';
import { authenticate } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// ミドルウェア
app.use('*', logger());
app.use('*', cors({
    origin: (origin) => origin, // 本番では制限する
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// レート制限
app.use('/api/*', rateLimit);

// ヘルスチェック
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        environment: c.env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
    });
});

// ルートパス (案内)
app.get('/', (c) => {
    return c.json({
        message: 'Presentation Maker API',
        endpoints: {
            health: '/health',
            upload: '/api/upload-folder',
            generate: '/api/generate',
            status: '/api/jobs/:id',
            video: '/api/videos/:id'
        }
    });
});

// API ルート
app.route('/api', apiRoutes);

// WebSocket ルート
app.route('/ws', wsRoutes);

// 404 ハンドラー
app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
});

// エラーハンドラー
app.onError((err, c) => {
    console.error('Error:', err);
    return c.json({
        error: 'Internal server error',
        message: err.message,
    }, 500);
});

export default app;

// Durable Objects エクスポート
export { JobManager } from '../durable-objects/JobManager';
