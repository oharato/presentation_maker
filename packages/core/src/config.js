"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env file
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env') });
exports.config = {
    voicevox: {
        // DockerコンテナのVOICEVOXに向け先を設定.
        // docker-compose.local.yml では `VOICEVOX_URL` を使っているため、こちらを優先して読みます。
        baseUrl: process.env.VOICEVOX_URL || process.env.VOICEVOX_BASE_URL || 'http://127.0.0.1:50021',
        speakerId: parseInt(process.env.VOICEVOX_SPEAKER_ID || '1', 10),
    },
};
