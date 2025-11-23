/**
 * Rate Limit Middleware のテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimit } from '../workers/middleware/rate-limit';
import type { Context, Next } from 'hono';
import type { Env } from '../workers/src/types';

describe('rateLimit middleware', () => {
    let mockContext: any;
    let mockNext: Next;
    let mockCache: any;

    beforeEach(() => {
        mockCache = {
            get: vi.fn(),
            put: vi.fn(),
        };

        mockContext = {
            req: {
                header: vi.fn().mockReturnValue('192.168.1.1'),
            },
            env: {
                PRESENTATION_MAKER_CACHE: mockCache,
            } as Env,
            json: vi.fn((data, status) => ({ data, status })),
        } as unknown as Context<{ Bindings: Env }>;

        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should allow request when under rate limit', async () => {
        mockCache.get.mockResolvedValue('50'); // 50 requests so far

        const result = await rateLimit(mockContext, mockNext);

        expect(mockCache.put).toHaveBeenCalledWith(
            'rate_limit:192.168.1.1',
            '51',
            { expirationTtl: 60 }
        );
        expect(mockNext).toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('should block request when over rate limit', async () => {
        mockCache.get.mockResolvedValue('100'); // Already at limit

        const result = await rateLimit(mockContext, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(mockContext.json).toHaveBeenCalledWith(
            {
                error: 'Too many requests',
                message: 'Please try again later',
            },
            429
        );
    });

    it('should initialize counter for new IP', async () => {
        mockCache.get.mockResolvedValue(null); // No previous requests

        await rateLimit(mockContext, mockNext);

        expect(mockCache.put).toHaveBeenCalledWith(
            'rate_limit:192.168.1.1',
            '1',
            { expirationTtl: 60 }
        );
        expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
        mockCache.get.mockRejectedValue(new Error('Cache error'));

        await rateLimit(mockContext, mockNext);

        // Should still call next() on error
        expect(mockNext).toHaveBeenCalled();
    });

    it('should use "unknown" IP when header is missing', async () => {
        mockContext.req.header.mockReturnValue(undefined);
        mockCache.get.mockResolvedValue(null);

        await rateLimit(mockContext, mockNext);

        expect(mockCache.put).toHaveBeenCalledWith(
            'rate_limit:unknown',
            '1',
            { expirationTtl: 60 }
        );
    });
});
