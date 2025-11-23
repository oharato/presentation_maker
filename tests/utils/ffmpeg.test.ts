/**
 * FFmpegユーティリティのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as ffmpegUtils from '../../src/utils/ffmpeg';

// child_processをモック
vi.mock('child_process');

describe('FFmpeg Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('runFFmpeg', () => {
        it('should execute FFmpeg command successfully', async () => {
            const mockProcess = {
                stderr: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            // シミュレート: stderrデータ
                        }
                    }),
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') {
                        // 成功を simulate
                        setTimeout(() => callback(0), 10);
                    }
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await expect(ffmpegUtils.runFFmpeg(['-version'])).resolves.toBeUndefined();
        });

        it('should reject on FFmpeg error', async () => {
            const mockProcess = {
                stderr: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('Error message'));
                        }
                    }),
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') {
                        // エラーを simulate
                        setTimeout(() => callback(1), 10);
                    }
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await expect(ffmpegUtils.runFFmpeg(['-invalid'])).rejects.toThrow();
        });
    });

    describe('generateSilence', () => {
        it('should generate silence with default options', async () => {
            const mockProcess = {
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await ffmpegUtils.generateSilence(5, 'silence.wav');

            expect(spawn).toHaveBeenCalled();
            const args = vi.mocked(spawn).mock.calls[0][1];
            expect(args).toContain('-t');
            expect(args).toContain('5');
        });

        it('should generate silence with custom options', async () => {
            const mockProcess = {
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await ffmpegUtils.generateSilence(3, 'silence.wav', {
                sampleRate: 48000,
                channels: 2
            });

            const args = vi.mocked(spawn).mock.calls[0][1];
            expect(args).toContain('48000');
            expect(args).toContain('2');
        });
    });

    describe('imageToVideo', () => {
        it('should convert image to video', async () => {
            const mockProcess = {
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await ffmpegUtils.imageToVideo('image.png', 10, 'video.mp4');

            const args = vi.mocked(spawn).mock.calls[0][1];
            expect(args).toContain('image.png');
            expect(args).toContain('10');
            expect(args).toContain('video.mp4');
        });
    });

    describe('mergeAudioVideo', () => {
        it('should merge audio and video', async () => {
            const mockProcess = {
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                }),
            };

            vi.mocked(spawn).mockReturnValue(mockProcess as any);

            await ffmpegUtils.mergeAudioVideo('video.mp4', 'audio.wav', 'output.mp4');

            const args = vi.mocked(spawn).mock.calls[0][1];
            expect(args).toContain('video.mp4');
            expect(args).toContain('audio.wav');
            expect(args).toContain('output.mp4');
        });
    });
});
