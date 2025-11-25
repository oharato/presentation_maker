import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env from current directory, then from project root (2 levels up)
const currentEnvPath = path.join(process.cwd(), '.env');
const rootEnvPath = path.join(process.cwd(), '../../.env');

if (fs.existsSync(currentEnvPath)) {
    dotenv.config({ path: currentEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
}

export const config = {
    voicevox: {
        // DockerコンテナのVOICEVOXに向け先を設定 (デフォルト: http://127.0.0.1:50021)
        baseUrl: process.env.VOICEVOX_BASE_URL || 'http://127.0.0.1:50021',
        speakerId: parseInt(process.env.VOICEVOX_SPEAKER_ID || '1', 10),
    },
};
