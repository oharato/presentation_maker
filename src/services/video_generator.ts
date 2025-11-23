import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const execAsync = promisify(exec);

const FFMPEG_PATH = ffmpegInstaller.path;
const FFPROBE_PATH = ffprobeInstaller.path;

export class VideoGenerator {
    /**
     * FFmpegコマンドを実行するヘルパー
     */
    private async runFFmpeg(args: string[]): Promise<void> {
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
     * 画像から無音動画を作成
     */
    async createSilentVideo(imagePath: string, duration: number, outputPath: string): Promise<void> {
        const args = [
            '-loop', '1',
            '-i', imagePath,
            '-c:v', 'libx264',
            '-t', duration.toString(),
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=1920:1080',
            '-r', '30',
            '-y', // Overwrite output file
            outputPath
        ];

        await this.runFFmpeg(args);
        console.log(`Silent video generated: ${outputPath}`);
    }

    /**
     * 音声と動画を結合
     */
    async mergeAudioVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
        const args = [
            '-i', videoPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
            '-y',
            outputPath
        ];

        await this.runFFmpeg(args);
        console.log(`Merged video generated: ${outputPath}`);
    }

    /**
     * 音声の長さを取得
     */
    async getAudioDuration(audioPath: string): Promise<number> {
        const { stdout } = await execAsync(
            `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
        );

        return parseFloat(stdout.trim());
    }

    /**
     * 複数の動画を結合
     */
    async concatVideos(videoPaths: string[], outputPath: string): Promise<void> {
        if (videoPaths.length === 0) {
            return;
        }

        // 一時的なファイルリストを作成
        const fs = require('fs');
        const path = require('path');
        const tmpDir = require('os').tmpdir();
        const listFile = path.join(tmpDir, `concat_${Date.now()}.txt`);

        const fileList = videoPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
        fs.writeFileSync(listFile, fileList);

        try {
            const args = [
                '-f', 'concat',
                '-safe', '0',
                '-i', listFile,
                '-c', 'copy',
                '-y',
                outputPath
            ];

            await this.runFFmpeg(args);
            console.log(`Final merged video generated: ${outputPath}`);
        } finally {
            // クリーンアップ
            if (fs.existsSync(listFile)) {
                fs.unlinkSync(listFile);
            }
        }
    }
}
