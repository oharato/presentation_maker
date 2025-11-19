import Queue from 'bull';
import Redis from 'ioredis';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

// Create Redis clients
const client = new Redis(redisConfig);
const subscriber = new Redis(redisConfig);

// Create Bull queue
export const videoQueue = new Queue('video-generation', {
    createClient: (type) => {
        switch (type) {
            case 'client':
                return client;
            case 'subscriber':
                return subscriber;
            default:
                return new Redis(redisConfig);
        }
    },
});

export interface VideoJobData {
    jobId: string;
    slides: Array<{
        id: string;
        markdown: string;
        script: string;
    }>;
}

export interface JobProgress {
    jobId: string;
    progress: number;
    message: string;
}
