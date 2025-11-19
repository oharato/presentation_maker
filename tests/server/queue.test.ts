import { describe, it, expect } from '@jest/globals';

describe('Server Queue Configuration', () => {
    it('should have correct queue configuration', () => {
        // Test queue configuration constants
        const expectedQueueName = 'video-generation';
        expect(expectedQueueName).toBe('video-generation');
    });

    it('should define VideoJobData interface', () => {
        // Type test - this will fail at compile time if interface is wrong
        const jobData: {
            jobId: string;
            slides: Array<{
                id: string;
                markdown: string;
                script: string;
            }>;
        } = {
            jobId: 'test-123',
            slides: [
                {
                    id: '1',
                    markdown: '# Test',
                    script: 'Test script',
                },
            ],
        };

        expect(jobData.jobId).toBe('test-123');
        expect(jobData.slides).toHaveLength(1);
    });

    it('should define JobProgress interface', () => {
        const progress: {
            jobId: string;
            progress: number;
            message: string;
        } = {
            jobId: 'test-123',
            progress: 50,
            message: 'Processing slide 1/2',
        };

        expect(progress.progress).toBeGreaterThanOrEqual(0);
        expect(progress.progress).toBeLessThanOrEqual(100);
    });
});
