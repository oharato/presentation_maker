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
        console.log(`Running FFmpeg: ${FFMPEG_PATH} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
        const process = spawn(FFMPEG_PATH, args);

        let stderr = '';

        process.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            // Stream stderr to console so runtime logs show ffmpeg progress/errors immediately
            console.error(text);
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
        // target resolution in WxH format (e.g. '1920x1080') used when re-encoding
        resolution?: string;
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
        // Add flags to regenerate PTS and avoid negative timestamps so concatenated files
        // align media streams correctly across segments.
        // If the caller specifically requests encoding, skip the copy path and run the
        // re-encode command directly to normalize timestamps and codecs.
        const { resolution = '1920x1080' } = options;

        // Prepare a video filter to scale while preserving aspect ratio and pad to target
        // resolution. This centers the scaled video within the target box.
        const [targetW, targetH] = resolution.split('x').map(s => parseInt(s, 10));
        // Use conditional scaling to fit while preserving aspect ratio, then pad and set SAR=1
        const scalePadFilter = `scale='if(gt(a,${targetW}/${targetH}),${targetW},-2)':'if(gt(a,${targetW}/${targetH}),-2,${targetH})',pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

        const reencodeArgs = [
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            '-f', 'concat',
            '-safe', '0',
            '-i', listFile,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-vf', scalePadFilter,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            outputPath
        ];

        if (codec === 'encode') {
            await runFFmpeg(reencodeArgs);
            return;
        }

        const args = [
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            '-f', 'concat',
            '-safe', '0',
            '-i', listFile,
            '-c', codec,
            '-y',
            outputPath
        ];

        try {
            await runFFmpeg(args);
        } catch (err) {
            // If copy-based concat fails, try re-encoding as a fallback
            console.warn(`concatMedia: copy-based concat failed, retrying with re-encode. Error: ${err}`);
            await runFFmpeg(reencodeArgs);
            return;
        }

        // After a successful concat, verify audio stream exists. If not, re-encode as a protective fallback.
        const hasAudio = await hasAudioStream(outputPath).catch(() => false);
        if (!hasAudio) {
            console.warn('concatMedia: output has no audio stream after concat; retrying with re-encode.');
            await runFFmpeg(reencodeArgs);
        }
    } finally {
        // クリーンアップ
        if (fs.existsSync(listFile)) {
            fs.unlinkSync(listFile);
        }
    }
}

/**
 * Check whether a media file contains an audio stream using ffprobe.
 */
export async function hasAudioStream(filePath: string): Promise<boolean> {
    try {
        const { stdout } = await execAsync(
            `"${FFPROBE_PATH}" -v error -select_streams a -show_entries stream=index -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
        );
        return stdout.trim().length > 0;
    } catch (err) {
        return false;
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

    const [targetW, targetH] = resolution.split('x').map(s => parseInt(s, 10));
    // scale to fit while preserving aspect ratio, then pad to target resolution and set SAR=1
    const scalePadFilter = `scale='if(gt(a,${targetW}/${targetH}),${targetW},-2)':'if(gt(a,${targetW}/${targetH}),-2,${targetH})',pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

    const args = [
        '-loop', '1',
        '-i', imagePath,
        '-c:v', 'libx264',
        '-t', duration.toString(),
        '-pix_fmt', 'yuv420p',
        '-vf', scalePadFilter,
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
    // Ensure final duration equals the longer of video/audio.
    // Get durations first.
    let videoDur = -1;
    let audioDur = -1;
    try {
        videoDur = await getMediaDuration(videoPath);
    } catch (e) {
        console.warn('mergeAudioVideo: could not read video duration', e);
    }
    try {
        audioDur = await getMediaDuration(audioPath);
    } catch (e) {
        console.warn('mergeAudioVideo: could not read audio duration', e);
    }

    const preferDur = Math.max(videoDur > 0 ? videoDur : 0, audioDur > 0 ? audioDur : 0);

    // If audio is shorter, we'll pad audio with silence using apad and then trim/pad to preferDur.
    // If video is shorter, we'll extend video last frame using tpad.

    // Try a copy-based workflow first where possible (less CPU): copy video stream, encode audio to aac,
    // but add filters as necessary to match durations. Add flags to regenerate PTS and avoid
    // negative timestamps on output so segments start at 0.
    const copyArgs: string[] = ['-fflags', '+genpts', '-avoid_negative_ts', 'make_zero', '-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0'];

    // If video is shorter and we know preferDur, add tpad filter to extend video. This requires re-encoding video.
    const needVideoExtend = videoDur > 0 && audioDur > videoDur;
    const needAudioPad = audioDur > 0 && videoDur > audioDur;

    if (needVideoExtend) {
        // Re-encode video to extend last frame by (audioDur - videoDur)
        const padSec = (audioDur - videoDur).toFixed(3);
        copyArgs.push('-vf', `tpad=stop_duration=${padSec}`);
        copyArgs.push('-c:v', 'libx264');
    } else {
        copyArgs.push('-c:v', 'copy');
    }

    // If audio is shorter, use apad filter to pad audio, then we'll set output duration explicitly to preferDur
    if (needAudioPad) {
        // Reset audio PTS to start at 0 and pad audio when needed. Use apad without pad_dur
        // for compatibility; duration is controlled with -t.
        copyArgs.push('-af', 'asetpts=PTS-STARTPTS,apad');
        copyArgs.push('-c:a', 'aac');
    } else {
        // Ensure audio timestamps start at 0 even when not padding
        copyArgs.push('-af', 'asetpts=PTS-STARTPTS');
        copyArgs.push('-c:a', 'aac');
    }

    // If preferDur is known, set it as output duration to ensure longer side is kept
    if (preferDur > 0) {
        copyArgs.push('-t', preferDur.toString());
    }

    copyArgs.push('-y', outputPath);

    // Prepare re-encode args ahead of time so we can invoke them if we detect
    // negative audio PTS after the copy path or if the copy path fails.
    const reencodeArgs: string[] = ['-fflags', '+genpts', '-avoid_negative_ts', 'make_zero', '-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0'];
    if (videoDur > 0 && audioDur > videoDur) {
        const padSec = (audioDur - videoDur).toFixed(3);
        reencodeArgs.push('-vf', `tpad=stop_duration=${padSec}`);
    }
    if (audioDur > 0 && videoDur > audioDur) {
        reencodeArgs.push('-af', 'asetpts=PTS-STARTPTS,apad');
    } else {
        reencodeArgs.push('-af', 'asetpts=PTS-STARTPTS');
    }
    const finalDur = preferDur > 0 ? preferDur.toString() : undefined;
    reencodeArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac');
    if (finalDur) reencodeArgs.push('-t', finalDur);
    reencodeArgs.push('-y', outputPath);

    try {
        await runFFmpeg(copyArgs);

        // After a successful copy-based merge, check whether the audio stream contains
        // negative start timestamps. Some inputs produce negative audio PTS which can
        // cause misalignment after concatenation. If we detect negative PTS, re-encode
        // the file with filters to normalize timestamps.
        try {
            const { stdout } = await execAsync(
                `"${FFPROBE_PATH}" -v error -select_streams a -show_entries packet=pts_time -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
            );
            const firstLine = (stdout || '').split('\n').find(l => l.trim().length > 0);
            const firstPts = firstLine ? parseFloat(firstLine.trim()) : NaN;
            if (!isNaN(firstPts) && firstPts < -0.0001) {
                console.warn('mergeAudioVideo: detected negative audio PTS in output; re-encoding to normalize timestamps.');
                await runFFmpeg(reencodeArgs);
            } else {
                return;
            }
        } catch (e) {
            // If ffprobe check fails for any reason, don't block - keep the copy output.
            return;
        }
    } catch (err) {
        console.warn(`mergeAudioVideo: copy-based merge failed, will retry with re-encode. Error: ${err}`);
    }

    // Re-encode path (prepared earlier) — run it now as the fallback.
    await runFFmpeg(reencodeArgs);
}
