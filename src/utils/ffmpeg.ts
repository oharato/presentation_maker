/**
 * FFmpeg実行ユーティリティ
 * 
 * fluent-ffmpegの代わりに、child_process.spawnを使用した
 * シンプルで保守性の高い実装
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const execAsync = promisify(exec);

export const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegInstaller.path;
export const FFPROBE_PATH = process.env.FFPROBE_PATH || ffprobeInstaller.path;

/**
 * FFmpegコマンドを実行
 */
export async function runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(FFMPEG_PATH, args);

        let stderr = '';

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
            }
        });

        process.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * FFprobeでメディアファイルの情報を取得
 */
export async function getMediaDuration(filePath: string): Promise<number> {
    const { stdout } = await execAsync(
        `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );

    return parseFloat(stdout.trim());
}

/**
 * 無音音声を生成
 */
export async function generateSilence(
    duration: number,
    outputPath: string,
    options: {
        sampleRate?: number;
        channels?: number;
    } = {}
): Promise<void> {
    const { sampleRate = 24000, channels = 1 } = options;

    const args = [
        '-f', 'lavfi',
        '-i', 'anullsrc',
        '-ac', channels.toString(),
        '-ar', sampleRate.toString(),
        '-t', duration.toString(),
        '-acodec', 'pcm_s16le',
        '-y',
        outputPath
    ];

    await runFFmpeg(args);
}

/**
 * 複数のメディアファイルを結合
 */
export async function concatMedia(
    files: string[],
    outputPath: string,
    options: {
        codec?: 'copy' | 'encode';
        tmpDir?: string;
    } = {}
): Promise<void> {
    if (files.length === 0) {
        throw new Error('No files to concatenate');
    }

    const { codec = 'copy', tmpDir = require('os').tmpdir() } = options;
    const fs = require('fs');
    const path = require('path');

    // 一時的なファイルリストを作成
    const listFile = path.join(tmpDir, `concat_${Date.now()}.txt`);
    const fileList = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFile, fileList);

    try {
        const args = [
            '-f', 'concat',
            '-safe', '0',
            '-i', listFile,
            '-c', codec,
            '-y',
            outputPath
        ];

        await runFFmpeg(args);
    } finally {
        // クリーンアップ
        if (fs.existsSync(listFile)) {
            fs.unlinkSync(listFile);
        }
    }
}

/**
 * 画像から動画を作成
 */
export async function imageToVideo(
    imagePath: string,
    duration: number,
    outputPath: string,
    options: {
        fps?: number;
        resolution?: string;
    } = {}
): Promise<void> {
    const { fps = 30, resolution = '1920x1080' } = options;

    const args = [
        '-loop', '1',
        '-i', imagePath,
        '-c:v', 'libx264',
        '-t', duration.toString(),
        '-pix_fmt', 'yuv420p',
        '-vf', `scale=${resolution}`,
        '-r', fps.toString(),
        '-y',
        outputPath
    ];

    await runFFmpeg(args);
}

/**
 * 音声と動画を結合
 */
export async function mergeAudioVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string
): Promise<void> {
    const args = [
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-y',
        outputPath
    ];

    await runFFmpeg(args);
}
