"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const voicevox_1 = require("./services/voicevox");
const slide_renderer_1 = require("./services/slide_renderer");
const video_generator_1 = require("./services/video_generator");
const config_1 = require("./config");
const OUTPUT_DIR = path_1.default.join(process.cwd(), 'output');
const FILE_PATTERN = /^(\d+)__(.*)\.(md|txt)$/;
const DEFAULT_DURATION = 5;
async function findInputFiles() {
    return await (0, glob_1.glob)('input/*');
}
function groupFilesBySlideId(files) {
    const groups = new Map();
    for (const file of files) {
        const basename = path_1.default.basename(file);
        const match = basename.match(FILE_PATTERN);
        if (match) {
            const [, id, title, ext] = match;
            if (!groups.has(id)) {
                groups.set(id, { title });
            }
            const group = groups.get(id);
            if (ext === 'md')
                group.md = file;
            if (ext === 'txt')
                group.txt = file;
        }
    }
    return groups;
}
async function generateAudioForSlide(id, group, voicevox, videoGenerator, audioPath) {
    let duration = DEFAULT_DURATION;
    let audioExists = false;
    if (group.txt) {
        const text = await fs_extra_1.default.readFile(group.txt, 'utf-8');
        if (text.trim()) {
            console.log(`Generating audio for ${id}...`);
            await voicevox.generateAudio(text, audioPath);
            duration = await videoGenerator.getAudioDuration(audioPath);
            audioExists = true;
        }
        else {
            console.log(`Skipping audio for ${id}: Empty text file.`);
        }
    }
    else {
        console.log(`Skipping audio for ${id}: No text file.`);
    }
    return { duration, audioExists };
}
async function generateVideoForSlide(id, group, slideRenderer, videoGenerator, imagePath, silentVideoPath, finalVideoPath, audioPath, duration, audioExists) {
    if (!group.md) {
        console.log(`Skipping video for ${id}: No markdown file.`);
        return null;
    }
    console.log(`Rendering slide for ${id}...`);
    const markdown = await fs_extra_1.default.readFile(group.md, 'utf-8');
    await slideRenderer.renderSlide(markdown, imagePath);
    console.log(`Generating silent video for ${id} (Duration: ${duration}s)...`);
    await videoGenerator.createSilentVideo(imagePath, duration, silentVideoPath);
    if (audioExists) {
        console.log(`Merging video and audio for ${id}...`);
        await videoGenerator.mergeAudioVideo(silentVideoPath, audioPath, finalVideoPath);
        return finalVideoPath;
    }
    else {
        console.log(`Skipping merge for ${id}: No audio generated.`);
        return null;
    }
}
async function processSlide(id, group, voicevox, slideRenderer, videoGenerator) {
    console.log(`Processing ID: ${id}, Title: ${group.title}`);
    const baseOutputName = `${id}__${group.title}`;
    const audioPath = path_1.default.join(OUTPUT_DIR, `${baseOutputName}.wav`);
    const imagePath = path_1.default.join(OUTPUT_DIR, `${baseOutputName}.png`);
    const silentVideoPath = path_1.default.join(OUTPUT_DIR, `${baseOutputName}.nosound.mp4`);
    const finalVideoPath = path_1.default.join(OUTPUT_DIR, `${baseOutputName}.mp4`);
    try {
        const { duration, audioExists } = await generateAudioForSlide(id, group, voicevox, videoGenerator, audioPath);
        return await generateVideoForSlide(id, group, slideRenderer, videoGenerator, imagePath, silentVideoPath, finalVideoPath, audioPath, duration, audioExists);
    }
    catch (err) {
        console.error(`Failed to process ${id}:`, err);
        return null;
    }
}
async function concatenateVideos(videoPaths, videoGenerator) {
    if (videoPaths.length === 0) {
        console.log('No videos generated to concatenate.');
        return;
    }
    console.log('Concatenating all videos...');
    const finalPresentationPath = path_1.default.join(OUTPUT_DIR, 'final_presentation.mp4');
    try {
        await videoGenerator.concatVideos(videoPaths, finalPresentationPath);
        console.log('Final presentation created successfully!');
    }
    catch (err) {
        console.error('Failed to concatenate videos:', err);
    }
}
async function main() {
    console.log('Starting Presentation Maker...');
    console.log(`VOICEVOX URL: ${config_1.config.voicevox.baseUrl}`);
    console.log(`VOICEVOX Speaker ID: ${config_1.config.voicevox.speakerId}`);
    await fs_extra_1.default.ensureDir(OUTPUT_DIR);
    const voicevox = new voicevox_1.VoicevoxService(config_1.config.voicevox.baseUrl, config_1.config.voicevox.speakerId);
    const slideRenderer = new slide_renderer_1.SlideRenderer();
    const videoGenerator = new video_generator_1.VideoGenerator();
    const files = await findInputFiles();
    const groups = groupFilesBySlideId(files);
    const sortedIds = Array.from(groups.keys()).sort();
    const generatedVideos = [];
    for (const id of sortedIds) {
        const group = groups.get(id);
        const videoPath = await processSlide(id, group, voicevox, slideRenderer, videoGenerator);
        if (videoPath) {
            generatedVideos.push(videoPath);
        }
    }
    await concatenateVideos(generatedVideos, videoGenerator);
    console.log('All tasks completed.');
}
main().catch(console.error);
