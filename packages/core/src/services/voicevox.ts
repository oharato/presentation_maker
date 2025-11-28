/**
 * VOICEVOX音声合成サービス
 * 
 * FFmpeg共通ユーティリティを使用してリファクタリング
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { generateSilence, concatMedia } from '../utils/ffmpeg';

const PAUSE_PATTERN = /\[pause:(\d+(?:\.\d+)?)\]/;
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;

export class VoicevoxService {
    private baseUrl: string;
    private speakerId: number;
    private silenceCache: Map<number, string> = new Map();

    constructor(baseUrl: string = 'http://127.0.0.1:50021', speakerId: number = 1) {
        this.baseUrl = baseUrl;
        this.speakerId = speakerId;
    }

    async generateAudio(text: string, outputPath: string): Promise<void> {
        const parts = text.split(PAUSE_PATTERN);

        if (parts.length === 1) {
            await this.generateVoice(text, outputPath);
            return;
        }

        await this.generateAudioWithPauses(parts, outputPath);
    }

    private async generateAudioWithPauses(parts: string[], outputPath: string): Promise<void> {
        const filesToConcat: string[] = [];
        const tempFilesToDelete: string[] = [];
        const tempDir = os.tmpdir();

        try {
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!part) continue;

                if (i % 2 === 1) {
                    // Odd indices are pause durations
                    await this.addPauseSegment(part, filesToConcat);
                } else {
                    // Even indices are text segments
                    await this.addVoiceSegment(part, filesToConcat, tempFilesToDelete, tempDir, i);
                }
            }

            await this.finalizeAudio(filesToConcat, outputPath);
        } catch (error) {
            console.error(`Error processing audio with pauses:`, error);
            throw error;
        } finally {
            await this.cleanupTempFiles(tempFilesToDelete);
        }
    }

    private async addPauseSegment(durationStr: string, filesToConcat: string[]): Promise<void> {
        const duration = parseFloat(durationStr);
        if (!isNaN(duration) && duration > 0) {
            const silencePath = await this.getSilenceFile(duration);
            filesToConcat.push(silencePath);
        }
    }

    private async addVoiceSegment(
        text: string,
        filesToConcat: string[],
        tempFilesToDelete: string[],
        tempDir: string,
        index: number
    ): Promise<void> {
        if (text.trim()) {
            const tempFile = path.join(tempDir, `voicevox_${Date.now()}_${index}.wav`);
            await this.generateVoice(text, tempFile);
            filesToConcat.push(tempFile);
            tempFilesToDelete.push(tempFile);
        }
    }

    private async finalizeAudio(filesToConcat: string[], outputPath: string): Promise<void> {
        if (filesToConcat.length > 0) {
            await concatMedia(filesToConcat, outputPath);
            console.log(`Concatenated audio generated: ${outputPath}`);
        } else {
            const silencePath = await this.getSilenceFile(1);
            await fs.copy(silencePath, outputPath);
        }
    }

    private async cleanupTempFiles(tempFiles: string[]): Promise<void> {
        for (const file of tempFiles) {
            await fs.remove(file).catch(() => { });
        }
    }

    private async getSilenceFile(duration: number): Promise<string> {
        if (this.silenceCache.has(duration)) {
            const cachedPath = this.silenceCache.get(duration)!;
            if (await fs.pathExists(cachedPath)) {
                console.log(`Using cached silence for ${duration}s: ${cachedPath}`);
                return cachedPath;
            }
        }

        const tempDir = os.tmpdir();
        const silencePath = path.join(tempDir, `silence_${duration}s_${Date.now()}.wav`);

        await generateSilence(duration, silencePath, {
            sampleRate: DEFAULT_SAMPLE_RATE,
            channels: DEFAULT_CHANNELS
        });

        console.log(`Silence generated: ${silencePath} (${duration}s)`);
        this.silenceCache.set(duration, silencePath);
        return silencePath;
    }

    private async generateVoice(text: string, outputPath: string): Promise<void> {
        try {
            // Log base URL and check connectivity to help debugging when running in CLI or containers
            try {
                const healthRes = await axios.get(this.baseUrl, { timeout: 2000 });
                console.log(`VOICEVOX base URL reachable: ${this.baseUrl} (status: ${healthRes.status})`);
            } catch (err: any) {
                console.warn(`VOICEVOX base URL may be unreachable: ${this.baseUrl} (${err && err.message ? err.message : err})`);
            }
            const queryData = await this.createAudioQuery(text);
            const audioData = await this.synthesizeAudio(queryData);
            await fs.outputFile(outputPath, audioData);
            console.log(`Voice segment generated: ${outputPath}`);
        } catch (error) {
            console.error(`Error generating voice for text: "${text.substring(0, 20)}..."`, error);
            throw error;
        }
    }

    private async createAudioQuery(text: string): Promise<any> {
        const response = await axios.post(
            `${this.baseUrl}/audio_query`,
            null,
            {
                params: {
                    text: text,
                    speaker: this.speakerId,
                },
            }
        );
        return response.data;
    }

    private async synthesizeAudio(queryData: any): Promise<Buffer> {
        const response = await axios.post(
            `${this.baseUrl}/synthesis`,
            queryData,
            {
                params: {
                    speaker: this.speakerId,
                },
                responseType: 'arraybuffer',
            }
        );
        return response.data;
    }
}
