/**
 * VideoGenerator のテスト (Vitest)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoGenerator } from '../../src/services/video_generator';
import * as ffmpegUtils from '../../src/utils/ffmpeg';

// FFmpegユーティリティをモック
vi.mock('../../src/utils/ffmpeg');

describe('VideoGenerator', () => {
    let generator: VideoGenerator;

    beforeEach(() => {
        generator = new VideoGenerator();
        vi.clearAllMocks();
    });

    describe('createSilentVideo', () => {
        it('should create silent video from image', async () => {
            const mockImageToVideo = vi.spyOn(ffmpegUtils, 'imageToVideo').mockResolvedValue();

            await generator.createSilentVideo('input.png', 5, 'output.mp4');

            expect(mockImageToVideo).toHaveBeenCalledWith('input.png', 5, 'output.mp4');
        });
    });

    describe('mergeAudioVideo', () => {
        it('should merge audio and video files', async () => {
            const mockMerge = vi.spyOn(ffmpegUtils, 'mergeAudioVideo').mockResolvedValue();

            await generator.mergeAudioVideo('video.mp4', 'audio.wav', 'output.mp4');

            expect(mockMerge).toHaveBeenCalledWith('video.mp4', 'audio.wav', 'output.mp4');
        });
    });

    describe('getAudioDuration', () => {
        it('should return audio duration', async () => {
            const mockGetDuration = vi.spyOn(ffmpegUtils, 'getMediaDuration').mockResolvedValue(10.5);

            const duration = await generator.getAudioDuration('audio.wav');

            expect(duration).toBe(10.5);
            expect(mockGetDuration).toHaveBeenCalledWith('audio.wav');
        });
    });

    describe('concatVideos', () => {
        it('should concatenate multiple videos', async () => {
            const mockConcat = vi.spyOn(ffmpegUtils, 'concatMedia').mockResolvedValue();

            await generator.concatVideos(['v1.mp4', 'v2.mp4'], 'output.mp4');

            expect(mockConcat).toHaveBeenCalledWith(['v1.mp4', 'v2.mp4'], 'output.mp4');
        });

        it('should handle empty video list', async () => {
            const mockConcat = vi.spyOn(ffmpegUtils, 'concatMedia');

            await generator.concatVideos([], 'output.mp4');

            expect(mockConcat).not.toHaveBeenCalled();
        });
    });
});
