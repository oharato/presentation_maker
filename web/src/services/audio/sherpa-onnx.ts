import type { AudioSynthesisService } from './types';

/**
 * Sherpa-onnx WASM 実装
 * 
 * 中国語・日本語対応のVITSモデルを使用
 * モデル: csukuangfj/vits-hf-zh-jp-zomehwh
 */
export class SherpaOnnxService implements AudioSynthesisService {
    private ready = false;
    private tts: any = null;
    private Module: any = null;

    async initialize(): Promise<void> {
        if (this.ready) return;

        console.log('[Sherpa-onnx] Initializing...');

        try {
            // WASMモジュールをロード
            const wasmModule = await this.loadWasmModule();
            this.Module = wasmModule;

            // TTSモデルを初期化
            await this.initializeTTS();

            this.ready = true;
            console.log('[Sherpa-onnx] Initialized successfully');
        } catch (error) {
            console.error('[Sherpa-onnx] Initialization failed:', error);
            throw error;
        }
    }

    private async loadWasmModule(): Promise<any> {
        console.log('[Sherpa-onnx] Loading WASM modules...');

        const wasmMainPath = '/models/sherpa-onnx/sherpa-onnx-wasm-main-tts.js';
        const ttsJsPath = '/models/sherpa-onnx/sherpa-onnx-tts.js';

        // Helper to load a script
        const loadScript = (src: string) => {
            return new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
                document.head.appendChild(script);
            });
        };

        try {
            // Load scripts sequentially
            // First load the main WASM loader which defines Module
            await loadScript(wasmMainPath);
            console.log('[Sherpa-onnx] Main WASM script loaded');

            // Then load the TTS helper script which uses Module
            await loadScript(ttsJsPath);
            console.log('[Sherpa-onnx] TTS helper script loaded');

            return new Promise((resolve, reject) => {
                // Moduleオブジェクトを取得
                const moduleObj = (window as any).Module;

                if (!moduleObj) {
                    reject(new Error('Module not found'));
                    return;
                }

                console.log('[Sherpa-onnx] Module found');

                // WASMの初期化を待つ
                if (moduleObj.calledRun) {
                    console.log('[Sherpa-onnx] WASM already initialized');
                    resolve(moduleObj);
                } else {
                    console.log('[Sherpa-onnx] Waiting for WASM initialization...');
                    // onRuntimeInitializedコールバックを設定
                    const originalCallback = moduleObj.onRuntimeInitialized;
                    moduleObj.onRuntimeInitialized = () => {
                        if (originalCallback) originalCallback();
                        console.log('[Sherpa-onnx] WASM initialized');
                        resolve(moduleObj);
                    };
                }
            });
        } catch (error) {
            console.error('[Sherpa-onnx] Script loading failed:', error);
            throw error;
        }
    }

    private async initializeTTS(): Promise<void> {
        console.log('[Sherpa-onnx] Initializing TTS model...');

        try {
            // createOfflineTts関数を探す（グローバル）
            const createOfflineTts = (window as any).createOfflineTts;

            if (!createOfflineTts) {
                console.error('[Sherpa-onnx] createOfflineTts not found in global scope');
                throw new Error('createOfflineTts function not found');
            }

            console.log('[Sherpa-onnx] createOfflineTts found, preparing files...');

            // モデルファイルをダウンロードしてWASMのファイルシステムに書き込む
            // デフォルトの .data ファイルに含まれるファイルと衝突しないように別名を使用
            const files = [
                { url: '/models/sherpa-onnx/vits-zh-jp/model.onnx', filename: 'vits-model.onnx' },
                { url: '/models/sherpa-onnx/vits-zh-jp/lexicon.txt', filename: 'vits-lexicon.txt' },
                { url: '/models/sherpa-onnx/vits-zh-jp/tokens.txt', filename: 'vits-tokens.txt' }
            ];

            if (!this.Module.FS_createDataFile) {
                throw new Error('WASM FS_createDataFile not available');
            }

            for (const file of files) {
                console.log(`[Sherpa-onnx] Downloading ${file.url}...`);
                const response = await fetch(file.url);
                if (!response.ok) {
                    throw new Error(`Failed to download ${file.url}: ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                const data = new Uint8Array(buffer);

                // 既存のファイルがある場合は削除してから書き込む（念のため）
                try {
                    if (this.Module.FS_unlink) {
                        this.Module.FS_unlink('/' + file.filename);
                    }
                } catch (e) {
                    // ファイルが存在しない場合は無視
                }

                this.Module.FS_createDataFile('/', file.filename, data, true, true, true);
                console.log(`[Sherpa-onnx] Wrote ${file.filename} to WASM FS (${data.length} bytes)`);
            }

            console.log('[Sherpa-onnx] Files prepared, creating TTS instance...');

            const myConfig = {
                offlineTtsModelConfig: {
                    offlineTtsVitsModelConfig: {
                        model: './vits-model.onnx',
                        lexicon: './vits-lexicon.txt',
                        tokens: './vits-tokens.txt',
                        dataDir: '',
                        noiseScale: 0.667,
                        noiseScaleW: 0.8,
                        lengthScale: 1.0,
                    },
                    numThreads: 1,
                    debug: 1,
                    provider: 'cpu',
                }
            };

            this.tts = createOfflineTts(this.Module, myConfig);

            if (!this.tts) {
                throw new Error('Failed to create TTS instance (returned null)');
            }

            console.log('[Sherpa-onnx] TTS model loaded successfully');
            console.log('[Sherpa-onnx] Sample rate:', this.tts.sampleRate);
            console.log('[Sherpa-onnx] Number of speakers:', this.tts.numSpeakers);
        } catch (error) {
            console.error('[Sherpa-onnx] TTS initialization error:', error);
            throw error;
        }
    }

    async generateAudio(text: string): Promise<Blob> {
        if (!this.ready || !this.tts) {
            throw new Error('Sherpa-onnx not initialized');
        }

        console.log('[Sherpa-onnx] Generating audio for:', text.substring(0, 50));

        try {
            // Hugging Faceのデモと同じ方法で音声を生成
            const audio = this.tts.generate({
                text: text,
                sid: 0,
                speed: 1.0
            });

            if (!audio || !audio.samples || audio.samples.length === 0) {
                console.warn('[Sherpa-onnx] Audio generation returned empty samples (possibly OOV words)');
                return this.generatePlaceholderAudio(text);
            }

            console.log('[Sherpa-onnx] Generated audio:', {
                samples: audio.samples.length,
                sampleRate: audio.sampleRate,
                duration: (audio.samples.length / (audio.sampleRate || 22050)).toFixed(2) + 's'
            });

            let sampleRate = audio.sampleRate;
            if (!sampleRate || sampleRate <= 0) {
                console.warn('[Sherpa-onnx] Invalid sample rate detected:', sampleRate, 'Falling back to 22050');
                sampleRate = 22050;
            }

            // WAVファイルを作成
            const wavBlob = this.createWavBlob(audio.samples, sampleRate);

            console.log('[Sherpa-onnx] WAV created, size:', (wavBlob.size / 1024).toFixed(2), 'KB');

            return wavBlob;
        } catch (error) {
            console.error('[Sherpa-onnx] Audio generation failed:', error);
            console.warn('[Sherpa-onnx] Falling back to placeholder audio');
            return this.generatePlaceholderAudio(text);
        }
    }

    private generatePlaceholderAudio(text: string): Blob {
        console.log('[Sherpa-onnx] Generating placeholder audio');

        const sampleRate = 22050;
        const duration = Math.max(text.length * 0.1, 2);
        const numSamples = Math.floor(sampleRate * duration);
        const frequency = 440;

        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const envelope = Math.max(0, 1 - t / duration);
            samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
        }

        return this.createWavBlob(samples, sampleRate);
    }

    private createWavBlob(samples: Float32Array, sampleRate: number): Blob {
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
        // ストリーミングは未実装
    }
}
