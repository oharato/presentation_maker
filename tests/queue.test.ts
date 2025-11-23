/**
 * JobQueue のテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobQueue } from '../workers/utils/queue';
import type { Env } from '../workers/src/types';

describe('JobQueue', () => {
    let mockEnv: Env;
    let mockStub: any;

    beforeEach(() => {
        // Durable Object Stub のモック
        mockStub = {
            fetch: vi.fn(),
        };

        // Env のモック
        mockEnv = {
            ENVIRONMENT: 'test',
            PRESENTATION_MAKER_JOB_MANAGER: {
                idFromName: vi.fn().mockReturnValue('test-id'),
                get: vi.fn().mockReturnValue(mockStub),
            } as any,
        } as Env;
    });

    describe('addJob', () => {
        it('should add a job to the queue', async () => {
            mockStub.fetch.mockResolvedValue(new Response(null, { status: 200 }));

            const queue = new JobQueue(mockEnv);
            await queue.addJob('job-123', { foo: 'bar' });

            expect(mockStub.fetch).toHaveBeenCalledWith(
                'https://internal/queue/add',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jobId: 'job-123',
                        data: { foo: 'bar' },
                    }),
                })
            );
        });
    });

    describe('getJob', () => {
        it('should return null when queue is empty', async () => {
            mockStub.fetch.mockResolvedValue(new Response(null, { status: 204 }));

            const queue = new JobQueue(mockEnv);
            const job = await queue.getJob();

            expect(job).toBeNull();
        });

        it('should return a job when available', async () => {
            const mockJob = { jobId: 'job-123', data: { foo: 'bar' } };
            mockStub.fetch.mockResolvedValue(
                new Response(JSON.stringify(mockJob), { status: 200 })
            );

            const queue = new JobQueue(mockEnv);
            const job = await queue.getJob();

            expect(job).toEqual(mockJob);
        });
    });

    describe('updateJobStatus', () => {
        it('should update job status', async () => {
            mockStub.fetch.mockResolvedValue(new Response(null, { status: 200 }));

            const queue = new JobQueue(mockEnv);
            await queue.updateJobStatus('job-123', 'completed', { result: 'success' });

            expect(mockStub.fetch).toHaveBeenCalledWith(
                'https://internal/update/job-123',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        status: 'completed',
                        result: 'success',
                    }),
                })
            );
        });
    });

    describe('getJobInfo', () => {
        it('should return null for non-existent job', async () => {
            mockStub.fetch.mockResolvedValue(new Response(null, { status: 404 }));

            const queue = new JobQueue(mockEnv);
            const info = await queue.getJobInfo('job-999');

            expect(info).toBeNull();
        });

        it('should return job info when exists', async () => {
            const mockInfo = { jobId: 'job-123', status: 'completed' };
            mockStub.fetch.mockResolvedValue(
                new Response(JSON.stringify(mockInfo), { status: 200 })
            );

            const queue = new JobQueue(mockEnv);
            const info = await queue.getJobInfo('job-123');

            expect(info).toEqual(mockInfo);
        });
    });
});
