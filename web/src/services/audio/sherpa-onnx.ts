import type { AudioSynthesisService } from './types';

// Sherpa-onnx WASM 実装 (プレースホルダー)
// 注意: CORS/COEP制限のため、現在はプレースホルダー実装を使用しています
// 本番環境で使用する場合は、WASMファイルを自社サーバーでホストすることを検討してください
export class SherpaOnnxService implements AudioSynthesisService {
    private ready = false;

    async initialize(): Promise<void> {
        if (this.ready) return;

        console.log('[Sherpa-onnx] Initializing placeholder...');
        console.warn('[Sherpa-onnx] これはプレースホルダー実装です。');
        console.warn('[Sherpa-onnx] 本番環境では、Sherpa-onnx WASMファイルをサーバーでホストする必要があります。');

        // 初期化遅延をシミュレート
        await new Promise(r => setTimeout(r, 1000));

        this.ready = true;
        console.log('[Sherpa-onnx] Placeholder initialized');
    }

    async generateAudio(text: string): Promise<Blob> {
        if (!this.ready) {
            throw new Error('Sherpa-onnx not initialized');
        }

        console.log('[Sherpa-onnx] Generating placeholder audio for:', text.substring(0, 50));

        // プレースホルダーとして単純なビープ音を生成
        const sampleRate = 22050;
        const duration = Math.max(text.length * 0.1, 2); // 推定再生時間
        const numSamples = Math.floor(sampleRate * duration);
        const frequency = 440; // A4 note

        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            // フェードアウトする単純な正弦波を生成
            const t = i / sampleRate;
            const envelope = Math.max(0, 1 - t / duration);
            samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
        }

        const wavBlob = this.createWavBlob(samples, sampleRate);
        console.log('[Sherpa-onnx] Placeholder WAV created, size:', wavBlob.size, 'bytes');

        return wavBlob;
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
        // No stream to stop
    }
}
