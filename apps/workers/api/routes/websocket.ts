/**
 * WebSocket ルート
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const ws = new Hono<{ Bindings: Env }>();

/**
 * WebSocket接続
 */
ws.get('/connect/:jobId', async (c) => {
    const upgradeHeader = c.req.header('Upgrade');

    if (upgradeHeader !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426);
    }

    // Global Queueインスタンスに接続
    // すべてのWebSocket接続を1つのDOで管理する
    const id = c.env.PRESENTATION_MAKER_JOB_MANAGER.idFromName('global-queue');
    const stub = c.env.PRESENTATION_MAKER_JOB_MANAGER.get(id);

    return stub.fetch(c.req.raw);
});

export { ws as wsRoutes };
