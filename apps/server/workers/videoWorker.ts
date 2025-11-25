import { videoQueue, VideoJobData, JobProgress } from '../queue';
import {
    VoicevoxService,
    SlideRenderer,
    VideoGenerator,
    config
} from '@presentation-maker/core';
import fs from 'fs-extra';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { Job } from 'bull';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'videos');

export function setupVideoWorker(io: SocketIOServer) {
    videoQueue.process(async (job: Job<VideoJobData>) => {
        const { jobId, slides }: VideoJobData = job.data;

        console.log(`Processing job ${jobId} with ${slides.length} slides`);

        await fs.ensureDir(OUTPUT_DIR);

        const voicevox = new VoicevoxService(config.voicevox.baseUrl, config.voicevox.speakerId);
        const slideRenderer = new SlideRenderer();
        const videoGenerator = new VideoGenerator();

        const generatedVideos: string[] = [];
        const totalSlides = slides.length;

        try {
            for (let i = 0; i < slides.length; i++) {
                const slide = slides[i];
                const slideNum = i + 1;

                // Update progress
                const progress = Math.floor((i / totalSlides) * 100);
                const progressData: JobProgress = {
                    jobId,
                    progress,
                    message: `Processing slide ${slideNum}/${totalSlides}`,
                };

                job.progress(progress);
                io.to(jobId).emit('job:progress', progressData);

                // Generate files
                const baseOutputName = `${jobId}_${slide.id}`;
                const audioPath = path.join(OUTPUT_DIR, `${baseOutputName}.wav`);
                const imagePath = path.join(OUTPUT_DIR, `${baseOutputName}.png`);
                const silentVideoPath = path.join(OUTPUT_DIR, `${baseOutputName}.nosound.mp4`);
                const finalVideoPath = path.join(OUTPUT_DIR, `${baseOutputName}.mp4`);

                // Generate audio
                let duration = 5;
                let audioExists = false;

                if (slide.script.trim()) {
                    console.log(`[Job ${jobId}] Generating audio for slide ${slideNum}...`);
                    await voicevox.generateAudio(slide.script, audioPath);
                    console.log(`[Job ${jobId}] Audio generated for slide ${slideNum}`);
                    duration = await videoGenerator.getAudioDuration(audioPath);
                    audioExists = true;
                }

                // Generate slide image
                console.log(`[Job ${jobId}] Rendering slide image for slide ${slideNum}...`);
                await slideRenderer.renderSlide(slide.markdown, imagePath);
                console.log(`[Job ${jobId}] Slide image rendered for slide ${slideNum}`);

                // Generate silent video
                console.log(`[Job ${jobId}] Creating silent video for slide ${slideNum}...`);
                await videoGenerator.createSilentVideo(imagePath, duration, silentVideoPath);
                console.log(`[Job ${jobId}] Silent video created for slide ${slideNum}`);

                // Merge audio and video
                if (audioExists) {
                    console.log(`[Job ${jobId}] Merging audio and video for slide ${slideNum}...`);
                    await videoGenerator.mergeAudioVideo(silentVideoPath, audioPath, finalVideoPath);
                    console.log(`[Job ${jobId}] Audio and video merged for slide ${slideNum}`);
                    generatedVideos.push(finalVideoPath);
                }
            }

            // Concatenate all videos
            if (generatedVideos.length > 0) {
                console.log(`[Job ${jobId}] Concatenating ${generatedVideos.length} videos...`);
                io.to(jobId).emit('job:progress', {
                    jobId,
                    progress: 95,
                    message: 'Concatenating videos...',
                });

                const finalPresentationPath = path.join(OUTPUT_DIR, `${jobId}_final.mp4`);
                await videoGenerator.concatVideos(generatedVideos, finalPresentationPath);
                console.log(`[Job ${jobId}] Final video created: ${finalPresentationPath}`);

                io.to(jobId).emit('job:completed', {
                    jobId,
                    videoUrl: `/videos/${jobId}_final.mp4`,
                });

                return { videoUrl: `/videos/${jobId}_final.mp4` };
            } else {
                throw new Error('No videos generated');
            }
        } catch (error) {
            console.error(`Job ${jobId} failed:`, error);
            io.to(jobId).emit('job:failed', {
                jobId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    });

    videoQueue.on('completed', (job: any, result: any) => {
        console.log(`Job ${job.id} completed:`, result);
    });

    videoQueue.on('failed', (job: any, err: Error) => {
        console.error(`Job ${job?.id} failed:`, err);
    });
}
