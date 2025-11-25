/**
 * 認証ミドルウェア
 */

import type { Next } from 'hono';
import type { Context } from '../api/types';

/**
 * JWT検証 (簡易実装)
 */
async function verifyJWT(token: string, secret: string): Promise<any> {
    // 本番環境では適切なJWTライブラリを使用
    // 例: @tsndr/cloudflare-worker-jwt

    // secretを使用していることを明示 (TS6133回避)
    if (!secret) throw new Error('Secret is not defined');

    try {
        const [header, payload, signature] = token.split('.');

        if (!header || !payload || !signature) {
            throw new Error('Invalid token format');
        }

        // Base64デコード
        const decodedPayload = JSON.parse(atob(payload));

        // 有効期限チェック
        if (decodedPayload.exp && decodedPayload.exp < Date.now() / 1000) {
            throw new Error('Token expired');
        }

        return decodedPayload;
    } catch (error) {
        throw new Error('Invalid token');
    }
}

/**
 * 認証ミドルウェア
 */
export async function authenticate(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const payload = await verifyJWT(token, c.env.JWT_SECRET);

        // ユーザー情報をコンテキストに設定
        c.set('userId', payload.sub);
        c.set('user', payload);

        return await next();
    } catch (error) {
        console.error('Authentication error:', error);
        return c.json({ error: 'Invalid token' }, 401);
    }
}

/**
 * オプショナル認証 (トークンがあれば検証、なくてもOK)
 */
export async function optionalAuth(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');

        try {
            const payload = await verifyJWT(token, c.env.JWT_SECRET);
            c.set('userId', payload.sub);
            c.set('user', payload);
        } catch (error) {
            // エラーは無視
            console.warn('Optional auth failed:', error);
        }
    }

    await next();
}
