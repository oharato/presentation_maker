import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

export const config = {
    voicevox: {
        // DockerコンテナのVOICEVOXに向け先を設定 (デフォルト: http://127.0.0.1:50021)
        baseUrl: process.env.VOICEVOX_BASE_URL || 'http://127.0.0.1:50021',
        speakerId: parseInt(process.env.VOICEVOX_SPEAKER_ID || '1', 10),
    },
};
