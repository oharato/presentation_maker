import { VideoGenerator } from '../../src/services/video_generator';
import ffmpeg from 'fluent-ffmpeg';

jest.mock('fluent-ffmpeg');

describe('VideoGenerator', () => {
    jest.setTimeout(10000);
    let generator: VideoGenerator;
    const mockedFfmpeg = ffmpeg as unknown as jest.Mock;

    beforeEach(() => {
        generator = new VideoGenerator();
        jest.clearAllMocks();

        // Mock ffmpeg chain
        mockedFfmpeg.mockImplementation(() => {
            const callbacks: { [key: string]: Function } = {};
            const mockCmd: any = {
                loop: jest.fn().mockReturnThis(),
                fps: jest.fn().mockReturnThis(),
                videoCodec: jest.fn().mockReturnThis(),
                format: jest.fn().mockReturnThis(),
                size: jest.fn().mockReturnThis(),
                outputOptions: jest.fn().mockReturnThis(),
                input: jest.fn().mockReturnThis(),
                inputFormat: jest.fn().mockReturnThis(),
                audioCodec: jest.fn().mockReturnThis(),
                audioChannels: jest.fn().mockReturnThis(),
                audioFrequency: jest.fn().mockReturnThis(),
                on: jest.fn().mockImplementation((event, callback) => {
                    callbacks[event] = callback;
                    return mockCmd;
                }),
                save: jest.fn().mockImplementation((path) => {
                    setTimeout(() => {
                        if (callbacks['end']) callbacks['end']();
                    }, 10);
                    return mockCmd;
                }),
                mergeToFile: jest.fn().mockImplementation((path, tmpDir) => {
                    setTimeout(() => {
                        if (callbacks['end']) callbacks['end']();
                    }, 10);
                    return mockCmd;
                }),
            };
            return mockCmd;
        });

        // Mock ffprobe
        (ffmpeg.ffprobe as unknown as jest.Mock) = jest.fn((path, callback) => {
            callback(null, { format: { duration: 10 } });
        });
    });

    it('should create silent video', async () => {
        await generator.createSilentVideo('input.png', 5, 'output.mp4');
        expect(mockedFfmpeg).toHaveBeenCalledWith('input.png');
    });

    it('should merge audio and video', async () => {
        await generator.mergeAudioVideo('video.mp4', 'audio.wav', 'output.mp4');
        expect(mockedFfmpeg).toHaveBeenCalled();
    });

    it('should get audio duration', async () => {
        const duration = await generator.getAudioDuration('audio.wav');
        expect(duration).toBe(10);
        expect(ffmpeg.ffprobe).toHaveBeenCalledWith('audio.wav', expect.any(Function));
    });

    it('should concat videos', async () => {
        await generator.concatVideos(['v1.mp4', 'v2.mp4'], 'output.mp4');
        expect(mockedFfmpeg).toHaveBeenCalled();
    });
});
