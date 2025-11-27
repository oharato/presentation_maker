import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import {
    VoicevoxService,
    SlideRenderer,
    VideoGenerator,
    config
} from '@presentation-maker/core';

// Assume running from apps/cli, project root is two levels up
const PROJECT_ROOT = path.resolve(process.cwd(), '../../');
const INPUT_DIR = path.join(PROJECT_ROOT, 'input');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const FILE_PATTERN = /^(\d+)__(.*)\.(md|txt)$/;
const DEFAULT_DURATION = 5;

interface SlideGroup {
    md?: string;
    txt?: string;
    title: string;
}

type SlideGroups = Map<string, SlideGroup>;

// Supported image extensions for pre-prepared slides
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

async function findInputFiles(): Promise<string[]> {
    // Search in the absolute path of input directory
    return await glob(path.join(INPUT_DIR, '*'));
}

async function findExistingImage(baseOutputName: string): Promise<string | null> {
    // Check for existing image files (png, jpg, jpeg)
    for (const ext of IMAGE_EXTENSIONS) {
        const imagePath = path.join(OUTPUT_DIR, `${baseOutputName}${ext}`);
        if (await fs.pathExists(imagePath)) {
            return imagePath;
        }
    }
    return null;
}

async function findExistingSilentVideo(baseOutputName: string): Promise<string | null> {
    // Check for existing silent video file
    const silentVideoPath = path.join(OUTPUT_DIR, `${baseOutputName}.nosound.mp4`);
    if (await fs.pathExists(silentVideoPath)) {
        return silentVideoPath;
    }
    return null;
}

function groupFilesBySlideId(files: string[]): SlideGroups {
    const groups: SlideGroups = new Map();

    for (const file of files) {
        const basename = path.basename(file);
        const match = basename.match(FILE_PATTERN);

        if (match) {
            const [, id, title, ext] = match;

            if (!groups.has(id)) {
                groups.set(id, { title });
            }

            const group = groups.get(id)!;
            if (ext === 'md') group.md = file;
            if (ext === 'txt') group.txt = file;
        }
    }

    return groups;
}

async function generateAudioForSlide(
    id: string,
    group: SlideGroup,
    voicevox: VoicevoxService,
    videoGenerator: VideoGenerator,
    audioPath: string
): Promise<{ duration: number; audioExists: boolean }> {
    let duration = DEFAULT_DURATION;
    let audioExists = false;

    if (group.txt) {
        const text = await fs.readFile(group.txt, 'utf-8');
        if (text.trim()) {
            console.log(`Generating audio for ${id}...`);
            await voicevox.generateAudio(text, audioPath);
            duration = await videoGenerator.getAudioDuration(audioPath);
            audioExists = true;
        } else {
            console.log(`Skipping audio for ${id}: Empty text file.`);
        }
    } else {
        console.log(`Skipping audio for ${id}: No text file.`);
    }

    return { duration, audioExists };
}

async function generateVideoForSlide(
    id: string,
    group: SlideGroup,
    slideRenderer: SlideRenderer,
    videoGenerator: VideoGenerator,
    imagePath: string,
    silentVideoPath: string,
    finalVideoPath: string,
    audioPath: string,
    duration: number,
    audioExists: boolean,
    baseOutputName: string
): Promise<string | null> {
    // Check for existing image file (png, jpg, jpeg)
    let actualImagePath = await findExistingImage(baseOutputName);
    
    if (actualImagePath) {
        console.log(`Using existing image for ${id}: ${actualImagePath}`);
    } else if (group.md) {
        console.log(`Rendering slide for ${id}...`);
        const markdown = await fs.readFile(group.md, 'utf-8');
        await slideRenderer.renderSlide(markdown, imagePath);
        actualImagePath = imagePath;
    } else {
        console.log(`Skipping video for ${id}: No markdown file and no existing image.`);
        return null;
    }

    // Check for existing silent video file
    const existingSilentVideo = await findExistingSilentVideo(baseOutputName);
    let actualSilentVideoPath: string;
    
    if (existingSilentVideo) {
        console.log(`Using existing silent video for ${id}: ${existingSilentVideo}`);
        actualSilentVideoPath = existingSilentVideo;
    } else {
        console.log(`Generating silent video for ${id} (Duration: ${duration}s)...`);
        await videoGenerator.createSilentVideo(actualImagePath, duration, silentVideoPath);
        actualSilentVideoPath = silentVideoPath;
    }

    if (audioExists) {
        console.log(`Merging video and audio for ${id}...`);
        await videoGenerator.mergeAudioVideo(actualSilentVideoPath, audioPath, finalVideoPath);
        return finalVideoPath;
    } else {
        console.log(`Skipping merge for ${id}: No audio generated.`);
        return null;
    }
}

async function processSlide(
    id: string,
    group: SlideGroup,
    voicevox: VoicevoxService,
    slideRenderer: SlideRenderer,
    videoGenerator: VideoGenerator
): Promise<string | null> {
    console.log(`Processing ID: ${id}, Title: ${group.title}`);

    const baseOutputName = `${id}__${group.title}`;
    const audioPath = path.join(OUTPUT_DIR, `${baseOutputName}.wav`);
    const imagePath = path.join(OUTPUT_DIR, `${baseOutputName}.png`);
    const silentVideoPath = path.join(OUTPUT_DIR, `${baseOutputName}.nosound.mp4`);
    const finalVideoPath = path.join(OUTPUT_DIR, `${baseOutputName}.mp4`);

    try {
        const { duration, audioExists } = await generateAudioForSlide(
            id,
            group,
            voicevox,
            videoGenerator,
            audioPath
        );

        return await generateVideoForSlide(
            id,
            group,
            slideRenderer,
            videoGenerator,
            imagePath,
            silentVideoPath,
            finalVideoPath,
            audioPath,
            duration,
            audioExists,
            baseOutputName
        );
    } catch (err) {
        console.error(`Failed to process ${id}:`, err);
        return null;
    }
}

async function concatenateVideos(
    videoPaths: string[],
    videoGenerator: VideoGenerator
): Promise<void> {
    if (videoPaths.length === 0) {
        console.log('No videos generated to concatenate.');
        return;
    }

    console.log('Concatenating all videos...');
    const finalPresentationPath = path.join(OUTPUT_DIR, 'final_presentation.mp4');

    try {
        await videoGenerator.concatVideos(videoPaths, finalPresentationPath);
        console.log('Final presentation created successfully!');
    } catch (err) {
        console.error('Failed to concatenate videos:', err);
    }
}

async function main() {
    console.log('Starting Presentation Maker...');
    console.log(`VOICEVOX URL: ${config.voicevox.baseUrl}`);
    console.log(`VOICEVOX Speaker ID: ${config.voicevox.speakerId}`);

    await fs.ensureDir(OUTPUT_DIR);

    const voicevox = new VoicevoxService(config.voicevox.baseUrl, config.voicevox.speakerId);
    const slideRenderer = new SlideRenderer();
    const videoGenerator = new VideoGenerator();

    const files = await findInputFiles();
    const groups = groupFilesBySlideId(files);
    const sortedIds = Array.from(groups.keys()).sort();

    const generatedVideos: string[] = [];

    for (const id of sortedIds) {
        const group = groups.get(id)!;
        const videoPath = await processSlide(id, group, voicevox, slideRenderer, videoGenerator);

        if (videoPath) {
            generatedVideos.push(videoPath);
        }
    }

    await concatenateVideos(generatedVideos, videoGenerator);

    console.log('All tasks completed.');
}

main().catch(console.error);
