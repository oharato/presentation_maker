import type { AudioSynthesisService } from './types';

// Transformers.js 実装
export class TransformersService implements AudioSynthesisService {
    private pipeline: any = null;
    private ready = false;

    async initialize(): Promise<void> {
        if (this.ready) return;

        console.log('[Transformers] Initializing...');

        try {
            // transformers.jsを動的にインポート
            const { pipeline, env } = await import('@xenova/transformers');

            // 環境設定
            env.allowLocalModels = false;
            env.useBrowserCache = true; // キャッシュの使用を試みる

            // WASMパスをCDNに強制
            if (env.backends && env.backends.onnx) {
                env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
            }

            console.log('[Transformers] Loading TTS model...');

            try {
                this.pipeline = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
                    local_files_only: false
                });
            } catch (e: any) {
                // キャッシュが破損している場合（例: 404 HTMLがJSONとしてキャッシュされた）、クリアして再試行
                if (e.name === 'SyntaxError' || e.message.includes('Unexpected token')) {
                    console.warn('[Transformers] キャッシュが破損している可能性があります。キャッシュをクリアして再試行します...');
                    if ('caches' in window) {
                        await caches.delete('transformers-cache');
                    }
                    // キャッシュを有効にして再試行（正しいデータを取得できることを期待）
                    env.useBrowserCache = true;
                    this.pipeline = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
                        local_files_only: false
                    });
                } else {
                    throw e;
                }
            }

            this.ready = true;
            console.log('[Transformers] Initialized successfully');
        } catch (error) {
            console.error('[Transformers] Initialization error:', error);
            throw new Error(`Transformers.js初期化エラー: ${error}`);
        }
    }

    async generateAudio(text: string): Promise<Blob> {
        if (!this.ready || !this.pipeline) {
            throw new Error('Transformers.js not initialized');
        }

        console.log('[Transformers] Generating audio for:', text.substring(0, 50));

        try {
            // 音声生成
            const output = await this.pipeline(text, {
                speaker_embeddings: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin'
            });

            console.log('[Transformers] Audio generated:', output);

            // 出力をWAV Blobに変換
            const wavBlob = this.createWavBlobFromOutput(output);
            console.log('[Transformers] WAV blob created, size:', wavBlob.size, 'bytes, type:', wavBlob.type);
            if (wavBlob.size < 1000) {
                console.warn('[Transformers] Generated audio seems too small!');
            }

            return wavBlob;
        } catch (error) {
            console.error('[Transformers] Generation error:', error);
            throw new Error(`音声生成エラー: ${error}`);
        }
    }

    private createWavBlobFromOutput(output: any): Blob {
        // Transformers.jsは音声データをoutput.audioで返す
        const samples = output.audio;
        const sampleRate = output.sampling_rate || 16000;

        const numChannels = 1;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = samples.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // WAVヘッダー
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // 浮動小数点サンプルを16ビットPCMに変換
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i] || 0));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    private writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    isReady(): boolean {
        return this.ready;
    }

    stopStream() {
        // No stream to stop
    }
}
