/**
 * レート制限ミドルウェア
 */

import type { Context, Next } from 'hono';
import type { Env } from '../api/types';

export async function rateLimit(c: Context<{ Bindings: Env }>, next: Next) {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `rate_limit:${ip}`;

    try {
        // Workers KVから現在のカウントを取得
        const countStr = await c.env.PRESENTATION_MAKER_CACHE.get(key);
        const count = countStr ? parseInt(countStr) : 0;

        // レート制限チェック (100リクエスト/分)
        if (count >= 100) {
            return c.json({
                error: 'Too many requests',
                message: 'Please try again later',
            }, 429);
        }

        // カウントを増加
        await c.env.PRESENTATION_MAKER_CACHE.put(key, (count + 1).toString(), {
            expirationTtl: 60, // 60秒後に期限切れ
        });

        return await next();
    } catch (error) {
        console.error('Rate limit error:', error);
        // エラー時はレート制限をスキップ
        return await next();
    }
}
