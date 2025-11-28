import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
// pdfkit has no bundled TypeScript types in this project; import via require to avoid compiler error
const PDFDocument: any = require('pdfkit');
import { runFFmpeg, FFMPEG_PATH } from '@presentation-maker/core';
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);

// This script finds all `output/*/*.processed.mp4` (actually output/*.processed.mp4),
// extracts the first video frame as PNG for each, and combines them into a single PDF.

const PROJECT_ROOT = path.resolve(process.cwd(), '../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

async function findProcessedVideos(): Promise<string[]> {
    const pattern = path.join(OUTPUT_DIR, '*.processed.mp4');
    const files = await glob(pattern);
    return files.sort();
}

async function extractFirstFrame(videoPath: string, outImage: string): Promise<void> {
    // Extract frame at 0 second. Use reasonable quality.
    const args = [
        '-ss', '0',
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        outImage
    ];
    await runFFmpeg(args);
}

async function createPdfFromImages(images: string[], outPdf: string): Promise<void> {
    if (images.length === 0) throw new Error('No images to write');

    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outPdf);
    doc.pipe(stream);

    for (const img of images) {
        const stats = await fs.stat(img);
        if (!stats || stats.size === 0) continue;

        // Use sharp or image-size would be better to get pixel dims; to avoid extra deps
        // we'll read image via native Image size extraction using an inline probe with ffprobe.
        // But pdfkit can scale images automatically to page size. We'll add a page sized to image
        // using a conservative default if size probe fails.
        let width = 1920;
        let height = 1080;
        try {
            const { stdout } = await execAsync(`"${FFMPEG_PATH.replace(/"/g,'')}" -v error -select_streams v:0 -show_entries stream=width,height -of default=noprint_wrappers=1:nokey=1 "${img}"`);
            const lines = (stdout || '').trim().split('\n').map((l: string) => l.trim()).filter(Boolean);
            if (lines.length >= 2) {
                width = parseInt(lines[0], 10) || width;
                height = parseInt(lines[1], 10) || height;
            }
        } catch (e) {
            // ignore; fallback dims used
        }

        doc.addPage({ size: [width, height] });
        doc.image(img, 0, 0, { width, height });
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
    });
}

async function main() {
    await fs.ensureDir(OUTPUT_DIR);

    const videos = await findProcessedVideos();
    if (videos.length === 0) {
        console.log('No processed videos found in output/*.processed.mp4');
        return;
    }

    console.log(`Found ${videos.length} processed video(s). Extracting first frames...`);
    const tmpDir = path.join(OUTPUT_DIR, 'thumbnails_tmp');
    await fs.remove(tmpDir);
    await fs.ensureDir(tmpDir);

    const images: string[] = [];
    for (const v of videos) {
        const base = path.basename(v).replace(/\.processed\.mp4$/i, '');
        const imgPath = path.join(tmpDir, `${base}.png`);
        try {
            await extractFirstFrame(v, imgPath);
            images.push(imgPath);
            console.log(`Extracted: ${imgPath}`);
        } catch (e) {
            console.warn(`Failed to extract frame from ${v}:`, e);
        }
    }

    if (images.length === 0) {
        console.log('No thumbnails created; aborting PDF creation.');
        return;
    }

    const outPdf = path.join(OUTPUT_DIR, 'presentation_thumbnails.pdf');
    console.log(`Creating PDF: ${outPdf}`);
    await createPdfFromImages(images, outPdf);

    // Cleanup
    await fs.remove(tmpDir);

    console.log('Done.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
