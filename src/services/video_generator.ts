import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class VideoGenerator {
    // Create silent video from image
    async createSilentVideo(imagePath: string, duration: number, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg(imagePath)
                .loop(duration)
                .fps(30)
                .videoCodec('libx264')
                .format('mp4')
                .size('1920x1080')
                .outputOptions([
                    '-pix_fmt yuv420p', // Ensure compatibility
                    '-t', duration.toString()
                ])
                .save(outputPath)
                .on('end', () => {
                    console.log(`Silent video generated: ${outputPath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Error generating silent video:', err);
                    reject(err);
                });
        });
    }

    // Merge audio and video
    async mergeAudioVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoPath)
                .input(audioPath)
                .videoCodec('copy')
                .audioCodec('aac')
                .outputOptions(['-shortest'])
                .save(outputPath)
                .on('end', () => {
                    console.log(`Merged video generated: ${outputPath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Error merging video:', err);
                    reject(err);
                });
        });
    }

    // Helper to get audio duration
    async getAudioDuration(audioPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata.format.duration || 0);
            });
        });
    }

    // Concatenate multiple videos
    async concatVideos(videoPaths: string[], outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (videoPaths.length === 0) {
                return resolve();
            }

            const command = ffmpeg();

            videoPaths.forEach(path => {
                command.input(path);
            });

            command
                .on('end', () => {
                    console.log(`Final merged video generated: ${outputPath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Error concatenating videos:', err);
                    reject(err);
                })
                .mergeToFile(outputPath, require('os').tmpdir());
        });
    }
}
