import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransformersService } from '../transformers';

// Mock @xenova/transformers
const mockPipeline = vi.fn();
const mockEnv = {
    allowLocalModels: true,
    useBrowserCache: false,
    backends: {
        onnx: {
            wasm: {
                wasmPaths: ''
            }
        }
    }
};

vi.mock('@xenova/transformers', () => ({
    pipeline: (..._args: any[]) => Promise.resolve(mockPipeline),
    env: mockEnv
}));

describe('TransformersService', () => {
    let service: TransformersService;

    beforeEach(() => {
        service = new TransformersService();
        vi.clearAllMocks();
    });

    it('should initialize correctly', async () => {
        await service.initialize();
        expect(service.isReady()).toBe(true);
    });

    it('should generate audio', async () => {
        await service.initialize();

        // Mock pipeline output
        mockPipeline.mockResolvedValue({
            audio: new Float32Array([0.1, -0.1]),
            sampling_rate: 16000
        });

        const blob = await service.generateAudio('Hello');
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('audio/wav');
    });

    it('should throw error if not initialized', async () => {
        await expect(service.generateAudio('Hello')).rejects.toThrow('Transformers.js not initialized');
    });
});
