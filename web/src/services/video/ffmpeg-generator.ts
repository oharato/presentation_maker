import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { SlideRenderer } from './slide-renderer';

export class BrowserVideoGenerator {
    private ffmpeg: FFmpeg;
    private loaded = false;
    private slideRenderer: SlideRenderer;
    private logs: string[] = [];

    constructor() {
        this.ffmpeg = new FFmpeg();
        this.slideRenderer = new SlideRenderer();

        // ログを有効化
        this.ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
            this.logs.push(message);
            if (this.logs.length > 100) this.logs.shift(); // Keep last 100 lines
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
        this.logs = []; // Reset logs for new generation

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

                // WAVヘッダーのみ（44バイト）または空の場合は無視する
                if (audioBlob.size <= 44) {
                    console.warn('[Audio] Audio blob is too small (likely header only), ignoring.');
                } else {
                    // 音声タイプを検出
                    const ext = audioBlob.type.includes('webm') ? 'webm' : 'wav';
                    audioFile = `${slide.id}.${ext}`;
                    await this.ffmpeg.writeFile(audioFile, await fetchFile(audioBlob));
                }
            }

            // 3. このスライドの動画を作成
            const videoFile = `${slide.id}.mp4`;

            const args = [
                '-loop', '1',
                '-i', imageFile,
            ];

            if (audioFile) {
                args.push('-i', audioFile);
                // 音声エンコーディング設定を統一
                args.push('-c:a', 'aac');
                args.push('-ac', '1'); // モノラル
                args.push('-ar', '44100'); // 44.1kHz
                args.push('-shortest'); // 音声の長さに合わせて動画をカット
            } else {
                // 音声がない場合は無音を追加してストリーム構成を統一する
                // anullsrcを使用して無音を生成
                args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=44100');
                args.push('-c:a', 'aac');
                args.push('-ac', '1');
                args.push('-ar', '44100');
                args.push('-t', '5'); // デフォルト5秒
                args.push('-shortest'); // 最短のストリーム（この場合は指定した時間）に合わせる
            }

            args.push(
                '-c:v', 'libx264',
                '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p',
                // 解像度を偶数にする（libx264の要件）
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                videoFile
            );

            console.log('[FFmpeg] Executing:', args.join(' '));
            const ret = await this.ffmpeg.exec(args);
            if (ret !== 0) {
                console.error(`[FFmpeg] Failed to generate video for slide ${slide.id}, return code: ${ret}`);
                console.error('[FFmpeg Logs]:\n' + this.logs.slice(-20).join('\n'));
                throw new Error(`スライド ${i + 1} の動画生成に失敗しました。\nFFmpeg Error:\n${this.logs.slice(-5).join('\n')}`);
            }

            // ファイルが生成されたか確認
            try {
                await this.ffmpeg.readFile(videoFile);
            } catch (e) {
                console.error(`[FFmpeg] Output file ${videoFile} was not created.`);
                throw new Error(`スライド ${i + 1} の動画ファイル生成に失敗しました。`);
            }

            videoFiles.push(videoFile);
        }

        if (videoFiles.length === 0) {
            throw new Error('生成された動画ファイルがありません。');
        }

        // 4. 動画を結合
        progressCallback(90, '動画を結合中...');

        const listFile = 'list.txt';
        const fileListContent = videoFiles.map(f => `file '${f}'`).join('\n');
        await this.ffmpeg.writeFile(listFile, fileListContent);

        const finalFile = 'output.mp4';
        console.log('[FFmpeg] Concatenating files...');

        const concatRet = await this.ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', listFile,
            '-c', 'copy',
            finalFile
        ]);

        if (concatRet !== 0) {
            console.error(`[FFmpeg] Concatenation failed with return code: ${concatRet}`);
            console.error('[FFmpeg Logs]:\n' + this.logs.slice(-20).join('\n'));
            throw new Error(`動画の結合に失敗しました。\nFFmpeg Error:\n${this.logs.slice(-5).join('\n')}`);
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
