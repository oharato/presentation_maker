import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import {
    VoicevoxService,
    SlideRenderer,
    VideoGenerator,
    config,
    getMediaDuration,
    hasAudioStream
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
    // Accept images where the number prefix matches, even if title differs.
    // baseOutputName is like "011__title copy"; extract the id prefix.
    const id = baseOutputName.split('__')[0];
    for (const ext of IMAGE_EXTENSIONS) {
        const pattern = path.join(INPUT_DIR, `${id}__*${ext}`);
        const matches = await glob(pattern);
        if (matches && matches.length > 0) {
            return matches[0];
        }
    }
    return null;
}

async function findExistingSilentVideo(baseOutputName: string): Promise<string | null> {
    // Check for existing silent video file
    // CLI supports placing pre-prepared silent videos or full mp4s in `input/`
    const id = baseOutputName.split('__')[0];

    // Prefer explicit .nosound.mp4 matching the id
    const nosoundPattern = path.join(INPUT_DIR, `${id}__*.nosound.mp4`);
    const nosoundMatches = await glob(nosoundPattern);
    if (nosoundMatches && nosoundMatches.length > 0) {
        return nosoundMatches[0];
    }

    // Accept any mp4 for this id (could contain audio)
    const mp4Pattern = path.join(INPUT_DIR, `${id}__*.mp4`);
    const mp4Matches = await glob(mp4Pattern);
    if (mp4Matches && mp4Matches.length > 0) {
        return mp4Matches[0];
    }
    return null;
}

function groupFilesBySlideId(files: string[]): SlideGroups {
    const groups: SlideGroups = new Map();

    // Accept not only .md/.txt but also preprepared assets placed in input/ (images, nosound videos)
    // Supported patterns:
    //  - 010__title.md
    //  - 010__title.txt
    //  - 010__title.png/jpg/jpeg
    //  - 010__title.nosound.mp4
    //  - 010__title.mp4  <-- accept plain mp4 placed in input/
    const assetRegex = /^(\d+)__(.*?)(?:\.(md|txt|png|jpg|jpeg|mp4)|\.nosound\.mp4)$/i;

    for (const file of files) {
        const basename = path.basename(file);
        const match = basename.match(assetRegex);

        if (match) {
            const [, id, title, ext] = match as unknown as [string, string, string, string];

            if (!groups.has(id)) {
                groups.set(id, { title });
            }

            const group = groups.get(id)!;

            // Mark md/txt if present so rendering logic can prefer markdown over images
            const lower = basename.toLowerCase();
            if (lower.endsWith('.md')) group.md = file;
            if (lower.endsWith('.txt')) group.txt = file;
            // Note: images and nosound files don't need separate fields; presence in input/ is enough
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
    // Shared variables for chosen assets. Declare once to avoid redeclarations.
    let actualImagePath: string | null = null;
    let actualSilentVideoPath: string | null = null;

    // First, check if a pre-prepared silent/full video exists in input/ for this id.
    const existingSilentVideo = await findExistingSilentVideo(baseOutputName);
    if (existingSilentVideo) {
        console.log(`Using existing silent/full video for ${id}: ${existingSilentVideo}`);

        const lowerPath = existingSilentVideo.toLowerCase();
        if (lowerPath.endsWith('.mp4')) {
            // If the full mp4 already contains audio and we have no need to merge, copy it to final output
            const containsAudio = await hasAudioStream(existingSilentVideo).catch(() => false);
            if (containsAudio) {
                console.log(`Existing input video contains audio; copying to final output for ${id}`);
                await fs.copy(existingSilentVideo, finalVideoPath);
                return finalVideoPath;
            }

            // Otherwise treat it as the silent video to be merged with generated audio
            actualImagePath = null;
            actualSilentVideoPath = existingSilentVideo;

            if (audioExists) {
                console.log(`Merging existing silent video and audio for ${id}...`);
                await videoGenerator.mergeAudioVideo(actualSilentVideoPath, audioPath, finalVideoPath);
                return finalVideoPath;
            } else {
                // No audio to merge; copy silent video as final output
                await fs.copy(actualSilentVideoPath, finalVideoPath);
                return finalVideoPath;
            }
        }
    }

    // Check for existing image file (png, jpg, jpeg)
    actualImagePath = await findExistingImage(baseOutputName);
    
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

    // Check for existing silent video file (second pass) only if we didn't use a preprepared video above
    if (!actualSilentVideoPath) {
        const existingSilentVideo2 = await findExistingSilentVideo(baseOutputName);
        if (existingSilentVideo2) {
            console.log(`Using existing silent video for ${id}: ${existingSilentVideo2}`);
            actualSilentVideoPath = existingSilentVideo2;

            // If the existing video is a full .mp4 that already includes audio, use it as the final video
            // (copy it to the output final path and skip merging)
            try {
                const lowerPath = actualSilentVideoPath.toLowerCase();
                if (lowerPath.endsWith('.mp4')) {
                    const hasAudio = await hasAudioStream(actualSilentVideoPath).catch(() => false);
                    if (hasAudio) {
                        console.log(`Existing input video contains audio; copying to final output for ${id}`);
                        await fs.copy(actualSilentVideoPath, finalVideoPath);
                        return finalVideoPath;
                    }
                }
            } catch (e) {
                console.warn('Could not inspect existing video audio streams:', e);
            }
        } else {
            console.log(`Generating silent video for ${id} (Duration: ${duration}s)...`);
            await videoGenerator.createSilentVideo(actualImagePath, duration, silentVideoPath);
            actualSilentVideoPath = silentVideoPath;
        }
    }

    if (audioExists) {
        console.log(`Merging video and audio for ${id}...`);
        try {
            // Log sizes and durations before merge to help debugging
            try {
                const svStat = await fs.stat(actualSilentVideoPath);
                const aStat = await fs.stat(audioPath);
                const svDur = await getMediaDuration(actualSilentVideoPath).catch(() => -1);
                const aDur = await getMediaDuration(audioPath).catch(() => -1);
                console.log(`Before merge - silentVideo: size=${svStat.size} bytes, duration=${svDur}s; audio: size=${aStat.size} bytes, duration=${aDur}s`);
            } catch (infoErr) {
                console.warn('Could not stat/duration before merge:', infoErr);
            }

            await videoGenerator.mergeAudioVideo(actualSilentVideoPath, audioPath, finalVideoPath);

            // Log sizes and durations after merge
            try {
                const outStat = await fs.stat(finalVideoPath);
                const outDur = await getMediaDuration(finalVideoPath).catch(() => -1);
                console.log(`After merge - output: size=${outStat.size} bytes, duration=${outDur}s`);
            } catch (outErr) {
                console.warn('Could not stat/duration after merge:', outErr);
            }
        } catch (mergeErr) {
            console.error(`Error during merge for ${id}:`, mergeErr);
            throw mergeErr;
        }
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

        const finalVideo = await generateVideoForSlide(
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

        if (!finalVideo) return null;

        // New requirement: create a processed file
        // If there is a corresponding audio file in output/, merge it with the video to create
        // `xxx.processed.mp4`. If no audio file exists, duplicate the video to create the processed file.
        const processedPath = finalVideo.replace(/\.mp4$/i, '.processed.mp4');
        const correspondingAudio = audioPath; // audio path already points to output/{base}.wav

        try {
            const hasCorrespondingAudio = await fs.pathExists(correspondingAudio);
            if (hasCorrespondingAudio) {
                console.log(`Found audio for ${id}; merging into processed file: ${processedPath}`);
                await videoGenerator.mergeAudioVideo(finalVideo, correspondingAudio, processedPath);
            } else {
                console.log(`No audio for ${id}; copying video to processed file: ${processedPath}`);
                await fs.copy(finalVideo, processedPath);
            }
        } catch (procErr) {
            console.error(`Failed to create processed video for ${id}:`, procErr);
            // As a fallback, ensure at least the original finalVideo is returned
            return finalVideo;
        }

        return processedPath;
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
        // The CLI now produces `.processed.mp4` files for each slide; ensure we use those
        const toConcat = videoPaths.map(p => {
            if (p.toLowerCase().endsWith('.processed.mp4')) return p;
            if (p.toLowerCase().endsWith('.mp4')) return p.replace(/\.mp4$/i, '.processed.mp4');
            return p;
        });
        await videoGenerator.concatVideos(toConcat, finalPresentationPath);
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

    // Allow optional numeric slide id(s) to be passed as CLI args to process only those slides.
    // Example: `pnpm --filter @presentation-maker/cli dev 010` will process only the slide with id '010'.
    const cliArgs = process.argv.slice(2).map(a => a.trim()).filter(a => a.length > 0);
    const requestedIds = cliArgs.filter(a => /^\d+$/.test(a));
    let idsToProcess: string[] | undefined = undefined;
    if (requestedIds.length > 0) {
        // Keep only ids that actually exist in groups; warn on missing ones.
        const available = new Set(sortedIds);
        const missing = requestedIds.filter(r => !available.has(r));
        if (missing.length > 0) {
            console.warn(`Requested slide id(s) not found in input/: ${missing.join(', ')}`);
        }
        // Filter sortedIds to only requested & existing ids, preserving sort order
        const requestedSet = new Set(requestedIds);
        const filtered = sortedIds.filter(id => requestedSet.has(id));
        if (filtered.length === 0) {
            console.log('No requested slide IDs found; nothing to process.');
            return;
        }
        // Use filtered ids for processing
        idsToProcess = filtered;
    }

    // If user passed the special 'final' argument, only run the concatenation step
    // using already-created `output/*.processed.mp4` files and exit.
    const finalRequested = cliArgs.map(a => a.toLowerCase()).includes('final');
    if (finalRequested) {
        console.log('Final-only mode requested: concatenating existing processed videos...');
        const procPattern = path.join(OUTPUT_DIR, '*.processed.mp4');
        const processedFiles = await glob(procPattern);
        if (!processedFiles || processedFiles.length === 0) {
            console.log('No processed videos found in output/*.processed.mp4 to concatenate.');
            return;
        }

        // Use the existing concatenate helper to build final_presentation.mp4
        await concatenateVideos(processedFiles.sort(), videoGenerator);
        console.log('Final-only concatenation completed.');
        return;
    }

    const generatedVideos: string[] = [];

    // Use idsToProcess when set (requested via CLI), otherwise process all sortedIds
    const iterateIds: string[] = (typeof idsToProcess !== 'undefined') ? idsToProcess : sortedIds;

    for (const id of iterateIds) {
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
