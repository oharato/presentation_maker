import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { SlideRenderer } from './slide-renderer';

export class BrowserVideoGenerator {
    private ffmpeg: FFmpeg;
    private loaded = false;
    private slideRenderer: SlideRenderer;

    constructor() {
        this.ffmpeg = new FFmpeg();
        this.slideRenderer = new SlideRenderer();

        // ログを有効化
        this.ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });

        this.ffmpeg.on('progress', ({ progress, time }) => {
            console.log('[FFmpeg Progress]', `${Math.round(progress * 100)}%`, `time: ${time}`);
        });
    }

    async load() {
        if (this.loaded) return;

        console.log('[FFmpeg] Loading...');
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.loaded = true;
        console.log('[FFmpeg] Loaded successfully');
    }

    async generateVideo(
        slides: Array<{ id: string; markdown: string }>,
        audioBlobs: Record<string, Blob>,
        progressCallback: (progress: number, message: string) => void
    ): Promise<Blob> {
        if (!this.loaded) await this.load();

        const videoFiles: string[] = [];

        for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            if (!slide) continue;

            const audioBlob = audioBlobs[slide.id];

            progressCallback(
                Math.floor((i / slides.length) * 50),
                `Processing slide ${i + 1}/${slides.length}`
            );

            // 1. スライドを画像にレンダリング
            const imageBlob = await this.slideRenderer.render(slide.markdown);
            const imageFile = `${slide.id}.png`;
            await this.ffmpeg.writeFile(imageFile, await fetchFile(imageBlob));

            // 2. 音声を処理
            let audioFile = '';

            if (audioBlob) {
                console.log('[Audio] Processing audio blob, type:', audioBlob.type, 'size:', audioBlob.size);
                // 音声タイプを検出
                const ext = audioBlob.type.includes('webm') ? 'webm' : 'wav';
                audioFile = `${slide.id}.${ext}`;
                await this.ffmpeg.writeFile(audioFile, await fetchFile(audioBlob));
            }

            // 3. このスライドの動画を作成
            const videoFile = `${slide.id}.mp4`;

            const args = [
                '-loop', '1',
                '-i', imageFile,
            ];

            if (audioFile) {
                args.push('-i', audioFile);
                args.push('-c:a', 'aac');
                args.push('-shortest'); // 音声の長さに合わせて動画をカット
            } else {
                args.push('-t', '5'); // デフォルト5秒
            }

            args.push(
                '-c:v', 'libx264',
                '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p',
                videoFile
            );

            console.log('[FFmpeg] Executing:', args.join(' '));
            await this.ffmpeg.exec(args);
            videoFiles.push(videoFile);
        }

        // 4. 動画を結合
        progressCallback(90, '動画を結合中...');

        const listFile = 'list.txt';
        const fileListContent = videoFiles.map(f => `file '${f}'`).join('\n');
        await this.ffmpeg.writeFile(listFile, fileListContent);

        const finalFile = 'output.mp4';
        try {
            await this.ffmpeg.exec([
                '-f', 'concat',
                '-safe', '0',
                '-i', listFile,
                '-c', 'copy',
                finalFile
            ]);
        } catch (e) {
            console.warn('[FFmpeg] Exec error (might be false positive Aborted):', e);
        }

        // 5. 結果を読み込み
        try {
            const data = await this.ffmpeg.readFile(finalFile);
            return new Blob([data as any], { type: 'video/mp4' });
        } catch (e) {
            console.error('[FFmpeg] Failed to read output file:', e);
            throw new Error('動画ファイルの生成に失敗しました。');
        }
    }
}
