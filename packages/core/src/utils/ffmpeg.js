"use strict";
/**
 * FFmpeg実行ユーティリティ
 *
 * fluent-ffmpegの代わりに、child_process.spawnを使用した
 * シンプルで保守性の高い実装
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FFPROBE_PATH = exports.FFMPEG_PATH = void 0;
exports.runFFmpeg = runFFmpeg;
exports.getMediaDuration = getMediaDuration;
exports.generateSilence = generateSilence;
exports.concatMedia = concatMedia;
exports.imageToVideo = imageToVideo;
exports.mergeAudioVideo = mergeAudioVideo;
const child_process_1 = require("child_process");
const util_1 = require("util");
const child_process_2 = require("child_process");
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
const ffprobe_1 = __importDefault(require("@ffprobe-installer/ffprobe"));
const execAsync = (0, util_1.promisify)(child_process_2.exec);
exports.FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpeg_1.default.path;
exports.FFPROBE_PATH = process.env.FFPROBE_PATH || ffprobe_1.default.path;
/**
 * FFmpegコマンドを実行
 */
async function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        const process = (0, child_process_1.spawn)(exports.FFMPEG_PATH, args);
        let stderr = '';
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            }
            else {
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
async function getMediaDuration(filePath) {
    const { stdout } = await execAsync(`"${exports.FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return parseFloat(stdout.trim());
}
/**
 * 無音音声を生成
 */
async function generateSilence(duration, outputPath, options = {}) {
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
async function concatMedia(files, outputPath, options = {}) {
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
    }
    finally {
        // クリーンアップ
        if (fs.existsSync(listFile)) {
            fs.unlinkSync(listFile);
        }
    }
}
/**
 * 画像から動画を作成
 */
async function imageToVideo(imagePath, duration, outputPath, options = {}) {
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
async function mergeAudioVideo(videoPath, audioPath, outputPath) {
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
