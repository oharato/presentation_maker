"use strict";
/**
 * VOICEVOX音声合成サービス
 *
 * FFmpeg共通ユーティリティを使用してリファクタリング
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoicevoxService = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const ffmpeg_1 = require("../utils/ffmpeg");
const PAUSE_PATTERN = /\[pause:(\d+(?:\.\d+)?)\]/;
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;
class VoicevoxService {
    constructor(baseUrl = 'http://127.0.0.1:50021', speakerId = 1) {
        this.silenceCache = new Map();
        this.baseUrl = baseUrl;
        this.speakerId = speakerId;
    }
    async generateAudio(text, outputPath) {
        const parts = text.split(PAUSE_PATTERN);
        if (parts.length === 1) {
            await this.generateVoice(text, outputPath);
            return;
        }
        await this.generateAudioWithPauses(parts, outputPath);
    }
    async generateAudioWithPauses(parts, outputPath) {
        const filesToConcat = [];
        const tempFilesToDelete = [];
        const tempDir = os_1.default.tmpdir();
        try {
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!part)
                    continue;
                if (i % 2 === 1) {
                    // Odd indices are pause durations
                    await this.addPauseSegment(part, filesToConcat);
                }
                else {
                    // Even indices are text segments
                    await this.addVoiceSegment(part, filesToConcat, tempFilesToDelete, tempDir, i);
                }
            }
            await this.finalizeAudio(filesToConcat, outputPath);
        }
        catch (error) {
            console.error(`Error processing audio with pauses:`, error);
            throw error;
        }
        finally {
            await this.cleanupTempFiles(tempFilesToDelete);
        }
    }
    async addPauseSegment(durationStr, filesToConcat) {
        const duration = parseFloat(durationStr);
        if (!isNaN(duration) && duration > 0) {
            const silencePath = await this.getSilenceFile(duration);
            filesToConcat.push(silencePath);
        }
    }
    async addVoiceSegment(text, filesToConcat, tempFilesToDelete, tempDir, index) {
        if (text.trim()) {
            const tempFile = path_1.default.join(tempDir, `voicevox_${Date.now()}_${index}.wav`);
            await this.generateVoice(text, tempFile);
            filesToConcat.push(tempFile);
            tempFilesToDelete.push(tempFile);
        }
    }
    async finalizeAudio(filesToConcat, outputPath) {
        if (filesToConcat.length > 0) {
            await (0, ffmpeg_1.concatMedia)(filesToConcat, outputPath);
            console.log(`Concatenated audio generated: ${outputPath}`);
        }
        else {
            const silencePath = await this.getSilenceFile(1);
            await fs_extra_1.default.copy(silencePath, outputPath);
        }
    }
    async cleanupTempFiles(tempFiles) {
        for (const file of tempFiles) {
            await fs_extra_1.default.remove(file).catch(() => { });
        }
    }
    async getSilenceFile(duration) {
        if (this.silenceCache.has(duration)) {
            const cachedPath = this.silenceCache.get(duration);
            if (await fs_extra_1.default.pathExists(cachedPath)) {
                console.log(`Using cached silence for ${duration}s: ${cachedPath}`);
                return cachedPath;
            }
        }
        const tempDir = os_1.default.tmpdir();
        const silencePath = path_1.default.join(tempDir, `silence_${duration}s_${Date.now()}.wav`);
        await (0, ffmpeg_1.generateSilence)(duration, silencePath, {
            sampleRate: DEFAULT_SAMPLE_RATE,
            channels: DEFAULT_CHANNELS
        });
        console.log(`Silence generated: ${silencePath} (${duration}s)`);
        this.silenceCache.set(duration, silencePath);
        return silencePath;
    }
    async generateVoice(text, outputPath) {
        try {
            const queryData = await this.createAudioQuery(text);
            const audioData = await this.synthesizeAudio(queryData);
            await fs_extra_1.default.outputFile(outputPath, audioData);
            console.log(`Voice segment generated: ${outputPath}`);
        }
        catch (error) {
            console.error(`Error generating voice for text: "${text.substring(0, 20)}..."`, error);
            throw error;
        }
    }
    async createAudioQuery(text) {
        const response = await axios_1.default.post(`${this.baseUrl}/audio_query`, null, {
            params: {
                text: text,
                speaker: this.speakerId,
            },
        });
        return response.data;
    }
    async synthesizeAudio(queryData) {
        const response = await axios_1.default.post(`${this.baseUrl}/synthesis`, queryData, {
            params: {
                speaker: this.speakerId,
            },
            responseType: 'arraybuffer',
        });
        return response.data;
    }
}
exports.VoicevoxService = VoicevoxService;
