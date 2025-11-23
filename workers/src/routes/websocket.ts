/**
 * WebSocket ルート
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const ws = new Hono<{ Bindings: Env }>();

/**
 * WebSocket接続
 */
ws.get('/', async (c) => {
    const upgradeHeader = c.req.header('Upgrade');

    if (upgradeHeader !== 'websocket') {
        return c.json({ error: 'Expected WebSocket' }, 400);
    }

    // Durable ObjectsにWebSocket接続を委譲
    const jobId = c.req.query('jobId') || 'default';
    const doId = c.env.JOB_MANAGER.idFromName(jobId);
    const doStub = c.env.JOB_MANAGER.get(doId);

    return doStub.fetch(c.req.raw);
});

export { ws as wsRoutes };
