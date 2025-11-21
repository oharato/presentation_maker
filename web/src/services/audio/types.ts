export type AudioEngine = 'voicevox' | 'sherpa-onnx' | 'transformers';

export interface AudioSynthesisService {
    initialize(): Promise<void>;
    generateAudio(text: string, speakerId?: number): Promise<Blob>;
    isReady(): boolean;
    stopStream?(): void;
}
