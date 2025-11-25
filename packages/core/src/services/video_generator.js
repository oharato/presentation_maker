"use strict";
/**
 * 動画生成サービス
 *
 * FFmpeg共通ユーティリティを使用してリファクタリング
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoGenerator = void 0;
const ffmpeg_1 = require("../utils/ffmpeg");
class VideoGenerator {
    /**
     * 画像から無音動画を作成
     */
    async createSilentVideo(imagePath, duration, outputPath) {
        await (0, ffmpeg_1.imageToVideo)(imagePath, duration, outputPath);
        console.log(`Silent video generated: ${outputPath}`);
    }
    /**
     * 音声と動画を結合
     */
    async mergeAudioVideo(videoPath, audioPath, outputPath) {
        await (0, ffmpeg_1.mergeAudioVideo)(videoPath, audioPath, outputPath);
        console.log(`Merged video generated: ${outputPath}`);
    }
    /**
     * 音声の長さを取得
     */
    async getAudioDuration(audioPath) {
        return await (0, ffmpeg_1.getMediaDuration)(audioPath);
    }
    /**
     * 複数の動画を結合
     */
    async concatVideos(videoPaths, outputPath) {
        if (videoPaths.length === 0) {
            return;
        }
        await (0, ffmpeg_1.concatMedia)(videoPaths, outputPath);
        console.log(`Final merged video generated: ${outputPath}`);
    }
}
exports.VideoGenerator = VideoGenerator;
