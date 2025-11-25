import { VoicevoxService } from '../../src/services/voicevox';
import axios from 'axios';
import fs from 'fs-extra';
import * as ffmpegUtils from '../../src/utils/ffmpeg';

jest.mock('axios');
jest.mock('fs-extra');
jest.mock('../../src/utils/ffmpeg');

describe('VoicevoxService', () => {
    jest.setTimeout(10000);
    let service: VoicevoxService;
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    const mockedFs = fs as jest.Mocked<typeof fs>;
    // const mockedFfmpeg = ffmpeg as unknown as jest.Mock; // Removed

    beforeEach(() => {
        service = new VoicevoxService();
        jest.clearAllMocks();
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
        (mockedFs.copy as jest.Mock).mockResolvedValue(undefined); // handle silence copy if needed (though concat uses ffmpeg)

        // Mock ffmpeg utils
        (ffmpegUtils.generateSilence as jest.Mock).mockResolvedValue(undefined);
        (ffmpegUtils.concatMedia as jest.Mock).mockResolvedValue(undefined);

        await service.generateAudio('Hello[pause:1.0]World', 'output.wav');

        // 2 text parts = 4 axios calls
        expect(mockedAxios.post).toHaveBeenCalledTimes(4);
        
        // Should have generated silence
        expect(ffmpegUtils.generateSilence).toHaveBeenCalledWith(1.0, expect.stringContaining('silence'), expect.any(Object));
        
        // Should have concatenated
        expect(ffmpegUtils.concatMedia).toHaveBeenCalledWith(expect.any(Array), 'output.wav');
    });
});
