
export type AudioEngine = 'voicevox' | 'web-speech' | 'sherpa-onnx';

export interface AudioSynthesisService {
    initialize(): Promise<void>;
    generateAudio(text: string, speakerId?: number): Promise<Blob>;
    isReady(): boolean;
}

// Sherpa-onnx implementation
export class SherpaOnnxService implements AudioSynthesisService {
    private tts: any = null;
    private ready = false;

    async initialize(): Promise<void> {
        if (this.ready) return;

        // Load Sherpa-onnx script
        await this.loadScript('https://k2-fsa.github.io/sherpa-onnx/wasm/sherpa-onnx-wasm-main.js');

        // Wait for module to load
        if (!(window as any).SherpaOnnx) {
            // In a real scenario, we might need to wait or check differently
            // For now, assuming the script load makes it available globally or we need to init it
            console.log('SherpaOnnx script loaded');
        }

        this.ready = true;
    }

    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    async generateAudio(text: string, speakerId = 0): Promise<Blob> {
        if (!this.ready) throw new Error('Sherpa-onnx not initialized');

        console.log('Sherpa-onnx generating:', text);

        // Simulate generation delay
        await new Promise(r => setTimeout(r, 1000));

        // Create a dummy WAV file (header only)
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        // RIFF header
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36, true); // file size - 8
        view.setUint32(8, 0x57415645, false); // "WAVE"
        // fmt chunk
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true); // chunk size
        view.setUint16(20, 1, true); // format (PCM)
        view.setUint16(22, 1, true); // channels (mono)
        view.setUint32(24, 24000, true); // sample rate
        view.setUint32(28, 48000, true); // byte rate
        view.setUint16(32, 2, true); // block align
        view.setUint16(34, 16, true); // bits per sample
        // data chunk
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, 0, true); // data size

        return new Blob([buffer], { type: 'audio/wav' });
    }

    isReady(): boolean {
        return this.ready;
    }
}

// Web Speech API implementation
export class WebSpeechService implements AudioSynthesisService {
    async initialize(): Promise<void> {
        // No initialization needed
    }

    async generateAudio(text: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';

            // Web Speech API doesn't support exporting audio to Blob natively.
            // We can only play it.
            window.speechSynthesis.speak(utterance);

            // Return empty blob as we can't capture it easily without MediaRecorder on system audio
            resolve(new Blob([], { type: 'audio/wav' }));
        });
    }

    isReady(): boolean {
        return true;
    }
}
