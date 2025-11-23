import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            '!tests/server/**/*.test.ts', // 古いJestテストを除外
            '!tests/services/voicevox.test.ts', // 古いJestテストを除外
            '!tests/services/slide_renderer.test.ts', // 古いJestテストを除外
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: [
                'workers/**/*.ts',
                'src/services/**/*.ts',
                'src/utils/**/*.ts',
            ],
            exclude: [
                'workers/**/*.test.ts',
                'workers/durable-objects/**',
                'workers/container/**',
                'src/**/*.test.ts',
                'tests/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './workers'),
        },
    },
});
