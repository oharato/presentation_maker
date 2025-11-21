<template>
  <div class="app">
    <header>
      <h1>🎬 プレゼンテーション動画制作</h1>
    </header>

    <main>
      <!-- File Upload Section -->
      <section class="upload-section">
        <h2>📁 ファイルアップロード</h2>
        <div class="upload-area">
          <input
            type="file"
            ref="fileInput"
            multiple
            accept=".md,.txt"
            @change="handleFileSelect"
            webkitdirectory
            directory
          />
          <button @click="triggerFileInput" class="btn-primary">
            フォルダを選択
          </button>
          <p v-if="selectedFiles.length > 0">
            {{ selectedFiles.length }} ファイルが選択されました
          </p>
        </div>
        <button
          @click="uploadFiles"
          :disabled="selectedFiles.length === 0 || isUploading"
          class="btn-success"
        >
          {{ isUploading ? 'アップロード中...' : 'アップロードして動画生成' }}
        </button>
      </section>

      <!-- Manual Input Section -->
      <section class="manual-section">
        <h2>✏️ 手動入力</h2>
        
        <div class="audio-settings">
            <h3>音声合成エンジン</h3>
            <div class="audio-engine-selector">
                <label>
                    <input type="radio" v-model="audioEngine" value="voicevox">
                    VOICEVOX (サーバー)
                </label>
                <label>
                    <input type="radio" v-model="audioEngine" value="transformers">
                    Transformers.js (ブラウザ)
                </label>
                <label>
                    <input type="radio" v-model="audioEngine" value="sherpa-onnx">
                    Sherpa-onnx (ブラウザWasm)
                </label>
            </div>
            
            <div v-if="audioEngine === 'sherpa-onnx'" class="sherpa-controls">
                <div class="status-row">
                    <button 
                        @click="loadSherpa" 
                        :disabled="isSherpaReady || isSherpaLoading"
                        class="btn-secondary"
                    >
                        {{ isSherpaReady ? 'Sherpa-onnx ロード済み' : (isSherpaLoading ? 'ロード中...' : 'Sherpa-onnx をロード') }}
                    </button>
                    <span v-if="isSherpaReady" class="status-success">✅ 準備完了</span>
                </div>
                <p v-if="sherpaError" class="status-error">{{ sherpaError }}</p>
                <p class="note">※ 初回ロード時にモデルのダウンロードが発生します (約50MB)</p>
            </div>

            <div v-if="audioEngine === 'transformers'" class="sherpa-controls">
                <div class="status-row">
                    <button 
                        @click="loadTransformers" 
                        :disabled="isTransformersReady || isTransformersLoading"
                        class="btn-secondary"
                    >
                        {{ isTransformersReady ? 'Transformers.js ロード済み' : (isTransformersLoading ? 'ロード中...' : 'Transformers.js をロード') }}
                    </button>
                    <span v-if="isTransformersReady" class="status-success">✅ 準備完了</span>
                </div>
                <p v-if="transformersError" class="status-error">{{ transformersError }}</p>
                <p class="note">※ 初回ロード時にモデルのダウンロードが発生します (約100-200MB)</p>
                <p class="note">※ 英語のみ対応 (SpeechT5モデル)</p>
            </div>
            
            <div v-if="audioEngine === 'transformers' || audioEngine === 'sherpa-onnx'" class="note-box">
                <p>※ ブラウザ生成モード: FFmpeg.wasmを使用してブラウザ上で動画を生成します。</p>
            </div>
        </div>

        <div class="slides-container">
          <div v-for="(slide, index) in slides" :key="slide.id" class="slide-row">
            <div class="slide-number">{{ index + 1 }}</div>
            <div class="slide-editors">
              <div class="editor-column">
                <label>スライド (Markdown)</label>
                <textarea
                  v-model="slide.markdown"
                  placeholder="# タイトル&#10;&#10;- ポイント1&#10;- ポイント2"
                  rows="10"
                ></textarea>
              </div>
              <div class="editor-column">
                <label>トークスクリプト</label>
                <textarea
                  v-model="slide.script"
                  placeholder="こんにちは。[pause:1.0]今日は..."
                  rows="10"
                ></textarea>
              </div>
            </div>
            <button @click="removeSlide(index)" class="btn-danger">削除</button>
          </div>
        </div>
        <div class="controls-row">
            <button @click="addSlide" class="btn-secondary">+ スライドを追加</button>
            <button @click="clearSlides" class="btn-danger">内容をクリア</button>
        </div>
        <button
          @click="generateVideo"
          :disabled="slides.length === 0 || isGenerating"
          class="btn-success"
        >
          {{ isGenerating ? '生成中...' : '動画を生成' }}
        </button>
      </section>

      <!-- Progress Section -->
      <section v-if="currentJob" class="progress-section">
        <h2>⏳ 生成進捗</h2>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: currentJob.progress + '%' }"></div>
        </div>
        <p>{{ currentJob.message }} ({{ currentJob.progress }}%)</p>
      </section>

      <!-- Video Player Section -->
      <section v-if="videoUrl" class="video-section">
        <h2>🎥 生成された動画</h2>
        <video :src="videoUrl" controls class="video-player"></video>
        <a :href="videoUrl" download class="btn-primary">ダウンロード</a>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { io, Socket } from 'socket.io-client';
import { sherpaService, transformersService, type AudioEngine } from './services/audio';
import { BrowserVideoGenerator } from './services/video';

interface Slide {
  id: string;
  markdown: string;
  script: string;
}

interface JobProgress {
  jobId: string;
  progress: number;
  message: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const STORAGE_KEY = 'presentation_maker_slides';

const slides = ref<Slide[]>([]);
const selectedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const isGenerating = ref(false);
const currentJob = ref<JobProgress | null>(null);
const videoUrl = ref<string | null>(null);

const audioEngine = ref<AudioEngine>('voicevox');
// サービスはシングルトンとしてインポート
const browserVideoGenerator = new BrowserVideoGenerator();

const isSherpaLoading = ref(false);
const isSherpaReady = ref(false);
const sherpaError = ref<string | null>(null);

const isTransformersLoading = ref(false);
const isTransformersReady = ref(false);
const transformersError = ref<string | null>(null);

let socket: Socket | null = null;

// データ永続化
watch(slides, (newSlides) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSlides));
}, { deep: true });

onMounted(() => {
  socket = io(SOCKET_URL);
  
  socket.on('job:progress', (data: JobProgress) => {
    currentJob.value = data;
  });
  
  socket.on('job:completed', (data: { jobId: string; videoUrl: string }) => {
    currentJob.value = null;
    isGenerating.value = false;
    isUploading.value = false;
    videoUrl.value = API_URL + data.videoUrl;
  });
  
  socket.on('job:failed', (data: { jobId: string; error: string }) => {
    currentJob.value = null;
    isGenerating.value = false;
    isUploading.value = false;
    alert(`エラー: ${data.error}`);
  });
  
  // ローカルストレージから読み込み、または初期スライドを追加
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
      try {
          slides.value = JSON.parse(saved);
      } catch (e) {
          console.error('Failed to load slides from storage', e);
          addSlide();
      }
  } else {
      addSlide();
  }

  // サービスのステータスを確認
  if (transformersService.isReady()) {
      isTransformersReady.value = true;
  }
  if (sherpaService.isReady()) {
      isSherpaReady.value = true;
  }
});

onUnmounted(() => {
  socket?.disconnect();
});

const loadSherpa = async () => {
    isSherpaLoading.value = true;
    sherpaError.value = null;
    try {
        await sherpaService.initialize();
        isSherpaReady.value = true;
    } catch (error) {
        console.error('Sherpa load error:', error);
        sherpaError.value = `ロード失敗: ${error}`;
    } finally {
        isSherpaLoading.value = false;
    }
};

const loadTransformers = async () => {
    isTransformersLoading.value = true;
    transformersError.value = null;
    try {
        await transformersService.initialize();
        isTransformersReady.value = true;
    } catch (error) {
        console.error('Transformers.js load error:', error);
        transformersError.value = `ロード失敗: ${error}`;
    } finally {
        isTransformersLoading.value = false;
    }
};

function addSlide() {
  slides.value.push({
    id: Date.now().toString(),
    markdown: '',
    script: '',
  });
}

function removeSlide(index: number) {
  slides.value.splice(index, 1);
}

function clearSlides() {
    if (confirm('入力内容をすべてクリアしますか？')) {
        slides.value = [];
        localStorage.removeItem(STORAGE_KEY);
        currentJob.value = null;
        videoUrl.value = null;
        addSlide(); // 空のスライドを1つ追加
    }
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    selectedFiles.value = Array.from(target.files);
  }
}

async function uploadFiles() {
  if (selectedFiles.value.length === 0) return;
  
  isUploading.value = true;
  videoUrl.value = null;
  
  const formData = new FormData();
  selectedFiles.value.forEach((file) => {
    formData.append('files', file);
  });
  
  try {
    const response = await fetch(`${API_URL}/api/upload-folder`, {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    
    if (response.ok) {
      socket?.emit('join:job', { jobId: data.jobId });
      currentJob.value = {
        jobId: data.jobId,
        progress: 0,
        message: 'キューに追加されました',
      };
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    isUploading.value = false;
    alert(`アップロードエラー: ${error}`);
  }
}

async function generateVideo() {
  if (slides.value.length === 0) return;
  
  isGenerating.value = true;
  videoUrl.value = null;
  
  try {
    // Transformers と Sherpa のブラウザ側生成
    if (audioEngine.value === 'transformers' || audioEngine.value === 'sherpa-onnx') {
        const audioBlobs: Record<string, Blob> = {};
        
        if (audioEngine.value === 'sherpa-onnx') {
            if (!isSherpaReady.value) {
                throw new Error('Sherpa-onnx がロードされていません。ロードボタンを押してください。');
            }
            currentJob.value = { jobId: 'browser-gen', progress: 0, message: '音声を生成中 (Sherpa-onnx)...' };
            
            for (let i = 0; i < slides.value.length; i++) {
                const slide = slides.value[i];
                if (slide && slide.script) {
                    currentJob.value = { 
                        jobId: 'browser-gen', 
                        progress: Math.floor((i / slides.value.length) * 30), 
                        message: `スライド ${i + 1}/${slides.value.length} の音声を生成中...` 
                    };
                    audioBlobs[slide.id] = await sherpaService.generateAudio(slide.script);
                }
            }
        } else {
            if (!isTransformersReady.value) {
                throw new Error('Transformers.js がロードされていません。ロードボタンを押してください。');
            }
            currentJob.value = { jobId: 'browser-gen', progress: 0, message: '音声を生成中 (Transformers.js)...' };
            
            for (let i = 0; i < slides.value.length; i++) {
                const slide = slides.value[i];
                if (slide && slide.script) {
                    currentJob.value = { 
                        jobId: 'browser-gen', 
                        progress: Math.floor((i / slides.value.length) * 30), 
                        message: `スライド ${i + 1}/${slides.value.length} の音声を生成中...` 
                    };
                    audioBlobs[slide.id] = await transformersService.generateAudio(slide.script);
                }
            }
        }

        // FFmpeg生成を開始
        currentJob.value = { jobId: 'browser-gen', progress: 30, message: 'ブラウザで動画を生成中 (FFmpeg.wasm)...' };
        
        const videoBlob = await browserVideoGenerator.generateVideo(
            slides.value,
            audioBlobs,
            (progress, message) => {
                currentJob.value = {
                    jobId: 'browser-gen',
                    progress: 30 + Math.floor(progress * 0.7),
                    message
                };
            }
        );
        
        videoUrl.value = window.URL.createObjectURL(videoBlob);
        currentJob.value = null;
        isGenerating.value = false;
        return;
    }

    // サーバー側生成 (VOICEVOX)
    const response = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slides: slides.value }),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      socket?.emit('join:job', { jobId: data.jobId });
      currentJob.value = {
        jobId: data.jobId,
        progress: 0,
        message: 'キューに追加されました',
      };
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    isGenerating.value = false;
    currentJob.value = null;
    alert(`生成エラー: ${error}`);
    console.error(error);
  }
}
</script>

<style scoped>
.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

header {
  text-align: center;
  margin-bottom: 40px;
}

h1 {
  color: #333;
  font-size: 2.5rem;
}

h2 {
  color: #555;
  margin-bottom: 20px;
}

section {
  background: #f9f9f9;
  padding: 30px;
  border-radius: 8px;
  margin-bottom: 30px;
}

.upload-area {
  margin-bottom: 20px;
}

.upload-area input[type="file"] {
  display: none;
}

.slides-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 20px;
}

.controls-row {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.slide-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 15px;
  align-items: start;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.slide-number {
  font-size: 1.5rem;
  font-weight: bold;
  color: #666;
  padding-top: 10px;
}

.slide-editors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.editor-column {
  display: flex;
  flex-direction: column;
}

.editor-column label {
  font-weight: bold;
  margin-bottom: 8px;
  color: #555;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  resize: vertical;
}

textarea:focus {
  outline: none;
  border-color: #4CAF50;
}

button {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #2196F3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #1976D2;
}

.btn-secondary {
  background-color: #9E9E9E;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #757575;
}

.btn-success {
  background-color: #4CAF50;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: #45a049;
}

.btn-danger {
  background-color: #f44336;
  color: white;
  padding: 8px 16px;
  font-size: 14px;
}

.btn-danger:hover:not(:disabled) {
  background-color: #da190b;
}

.progress-bar {
  width: 100%;
  height: 30px;
  background-color: #e0e0e0;
  border-radius: 15px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.3s ease;
}

.video-player {
  width: 100%;
  max-width: 800px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.audio-settings {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.audio-settings h3 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.1rem;
    color: #444;
}

.radio-group {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
}

.radio-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.sherpa-controls {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #eee;
}

.note-box {
    margin-top: 15px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 4px solid #42b983;
}

.note-box p {
    margin: 0;
    font-size: 0.9rem;
    color: #666;
}

.note {
    font-size: 0.9rem;
    color: #666;
    margin-top: 8px;
}

.status-row {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 8px;
}

.status-success {
    color: #4CAF50;
    font-weight: bold;
    font-size: 1.1rem;
}

.status-error {
    color: #f44336;
    font-weight: bold;
    margin-top: 8px;
    padding: 8px;
    background-color: #ffebee;
    border-radius: 4px;
}
</style>
