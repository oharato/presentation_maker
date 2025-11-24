/**
 * 動画生成サービス
 * 
 * FFmpeg共通ユーティリティを使用してリファクタリング
 */

import {
    imageToVideo,
    mergeAudioVideo,
    getMediaDuration,
    concatMedia
} from '../utils/ffmpeg';

export class VideoGenerator {
    /**
     * 画像から無音動画を作成
     */
    async createSilentVideo(imagePath: string, duration: number, outputPath: string): Promise<void> {
        await imageToVideo(imagePath, duration, outputPath);
        console.log(`Silent video generated: ${outputPath}`);
    }

    /**
     * 音声と動画を結合
     */
    async mergeAudioVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
        await mergeAudioVideo(videoPath, audioPath, outputPath);
        console.log(`Merged video generated: ${outputPath}`);
    }

    /**
     * 音声の長さを取得
     */
    async getAudioDuration(audioPath: string): Promise<number> {
        return await getMediaDuration(audioPath);
    }

    /**
     * 複数の動画を結合
     */
    async concatVideos(videoPaths: string[], outputPath: string): Promise<void> {
        if (videoPaths.length === 0) {
            return;
        }

        await concatMedia(videoPaths, outputPath);
        console.log(`Final merged video generated: ${outputPath}`);
    }
}
