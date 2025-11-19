import { VoicevoxService } from '../../src/services/voicevox';
import axios from 'axios';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';

jest.mock('axios');
jest.mock('fs-extra');
jest.mock('fluent-ffmpeg');

describe('VoicevoxService', () => {
    jest.setTimeout(10000);
    let service: VoicevoxService;
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    const mockedFs = fs as jest.Mocked<typeof fs>;
    const mockedFfmpeg = ffmpeg as unknown as jest.Mock;

    beforeEach(() => {
        service = new VoicevoxService();
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
                    }, 10); // Small delay to simulate async
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
    });

    it('should generate audio for simple text', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: 'query_data' }); // audio_query
        mockedAxios.post.mockResolvedValueOnce({ data: Buffer.from('audio_data') }); // synthesis
        (mockedFs.outputFile as jest.Mock).mockResolvedValue(undefined);

        await service.generateAudio('Hello', 'output.wav');

        expect(mockedAxios.post).toHaveBeenCalledTimes(2);
        expect(mockedFs.outputFile).toHaveBeenCalledWith('output.wav', expect.any(Buffer));
    });

    it('should handle pauses correctly', async () => {
        // Mock for "Hello"
        mockedAxios.post.mockResolvedValueOnce({ data: 'query1' });
        mockedAxios.post.mockResolvedValueOnce({ data: Buffer.from('audio1') });

        // Mock for "World"
        mockedAxios.post.mockResolvedValueOnce({ data: 'query2' });
        mockedAxios.post.mockResolvedValueOnce({ data: Buffer.from('audio2') });

        (mockedFs.outputFile as jest.Mock).mockResolvedValue(undefined);
        (mockedFs.remove as jest.Mock).mockResolvedValue(undefined);
        (mockedFs.pathExists as jest.Mock).mockResolvedValue(false); // No cache hit initially

        await service.generateAudio('Hello[pause:1.0]World', 'output.wav');

        // 2 text parts = 4 axios calls
        expect(mockedAxios.post).toHaveBeenCalledTimes(4);
        // Should have called ffmpeg to generate silence and merge
        expect(mockedFfmpeg).toHaveBeenCalled();
    });
});
