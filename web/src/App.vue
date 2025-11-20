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
            <div class="radio-group">
                <label>
                    <input type="radio" v-model="audioEngine" value="voicevox">
                    VOICEVOX (サーバー)
                </label>
                <label>
                    <input type="radio" v-model="audioEngine" value="web-speech">
                    Web Speech API (プレビューのみ)
                </label>
                <label>
                    <input type="radio" v-model="audioEngine" value="sherpa-onnx">
                    Sherpa-onnx (Wasm)
                </label>
            </div>
            
            <div v-if="audioEngine === 'sherpa-onnx'" class="sherpa-controls">
                <button 
                    @click="loadSherpa" 
                    :disabled="isSherpaReady || isSherpaLoading"
                    class="btn-secondary"
                >
                    {{ isSherpaReady ? 'Sherpa-onnx ロード済み' : (isSherpaLoading ? 'ロード中...' : 'Sherpa-onnx をロード') }}
                </button>
                <p class="note">※ 初回ロード時にモデルのダウンロードが発生します</p>
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
        <button @click="addSlide" class="btn-secondary">+ スライドを追加</button>
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
        <a href="#" @click.prevent="downloadVideo" class="btn-primary">ダウンロード</a>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

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

const slides = ref<Slide[]>([]);
const selectedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const isGenerating = ref(false);
const currentJob = ref<JobProgress | null>(null);
const videoUrl = ref<string | null>(null);

let socket: Socket | null = null;

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
  
  // Add initial slide
  addSlide();
});

onUnmounted(() => {
  socket?.disconnect();
});

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

// Audio Engine Logic
import { SherpaOnnxService, WebSpeechService, type AudioEngine } from './services/audio-synthesis';

const audioEngine = ref<AudioEngine>('voicevox');
const sherpaService = new SherpaOnnxService();
const webSpeechService = new WebSpeechService();
const isSherpaReady = ref(false);
const isSherpaLoading = ref(false);

async function loadSherpa() {
  isSherpaLoading.value = true;
  try {
    await sherpaService.initialize();
    isSherpaReady.value = true;
    alert('Sherpa-onnx (Wasm) のロードが完了しました');
  } catch (error) {
    console.error('Sherpa load error:', error);
    alert('Sherpa-onnx のロードに失敗しました');
  } finally {
    isSherpaLoading.value = false;
  }
}

async function generateVideo() {
  if (slides.value.length === 0) return;
  
  isGenerating.value = true;
  videoUrl.value = null;
  
  try {
    const formData = new FormData();
    formData.append('slides', JSON.stringify(slides.value));

    // Handle client-side audio generation if needed
    if (audioEngine.value === 'sherpa-onnx') {
        if (!isSherpaReady.value) {
            throw new Error('Sherpa-onnx がロードされていません。ロードボタンを押してください。');
        }
        
        currentJob.value = { jobId: 'client-gen', progress: 0, message: 'クライアントで音声を生成中...' };
        
        for (let i = 0; i < slides.value.length; i++) {
            const slide = slides.value[i];
            if (slide.script) {
                const blob = await sherpaService.generateAudio(slide.script);
                formData.append(`audio_${slide.id}`, blob, `${slide.id}.wav`);
            }
        }
    } else if (audioEngine.value === 'web-speech') {
        // Web Speech API is preview only, but we can send the request to server
        // The server will use VOICEVOX as fallback or we can warn user
        // For now, we'll just warn and proceed (server uses VOICEVOX if no audio sent)
        if (!confirm('Web Speech API は動画生成には使用できません（プレビューのみ）。\nサーバー側の VOICEVOX で音声を生成しますか？')) {
            isGenerating.value = false;
            currentJob.value = null;
            return;
        }
    }

    const response = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      body: formData, // Send as FormData
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
  }
}

async function downloadVideo() {
  if (!videoUrl.value) return;
  
  try {
    const response = await fetch(videoUrl.value);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = videoUrl.value.split('/').pop() || 'video.mp4';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Download failed:', error);
    alert('ダウンロードに失敗しました。右クリックで保存してください。');
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

.note {
    font-size: 0.9rem;
    color: #666;
    margin-top: 8px;
}
</style>
