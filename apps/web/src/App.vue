<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          🎬 プレゼンテーション動画メーカー
        </h1>
        <p class="mt-2 text-gray-600">スライドとトークスクリプトから、自動で動画を生成します</p>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Audio Engine Selection -->
      <section class="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">🎙️ 音声合成エンジン</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <label class="relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md"
                 :class="audioEngine === 'voicevox' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'">
            <input type="radio" v-model="audioEngine" value="voicevox" class="mr-3">
            <div>
              <div class="font-semibold text-gray-800">VOICEVOX</div>
              <div class="text-sm text-gray-600">サーバー側で高品質な日本語音声を生成</div>
            </div>
          </label>
          
          <label class="relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md"
                 :class="audioEngine === 'transformers' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'">
            <input type="radio" v-model="audioEngine" value="transformers" class="mr-3">
            <div>
              <div class="font-semibold text-gray-800">Transformers.js</div>
              <div class="text-sm text-gray-600">ブラウザで英語音声を生成</div>
            </div>
          </label>
          
          <label class="relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md"
                 :class="audioEngine === 'sherpa-onnx' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'">
            <input type="radio" v-model="audioEngine" value="sherpa-onnx" class="mr-3">
            <div>
              <div class="font-semibold text-gray-800">Sherpa-onnx</div>
              <div class="text-sm text-gray-600">ブラウザで日本語音声を生成（WASM）</div>
            </div>
          </label>
        </div>

        <!-- Voicevox Speaker Selection -->
        <div class="mt-4">
          <label class="block text-sm font-semibold text-gray-700 mb-2">VOICEVOX の声</label>
          <select v-model="voicevoxSpeaker" class="px-4 py-2 border rounded-lg">
            <option :value="1">1 — default</option>
            <option :value="2">2 — voice 2</option>
            <option :value="3">3 — voice 3</option>
            <option :value="4">4 — voice 4</option>
            <option :value="10">10 — voice 10</option>
          </select>
          <p class="mt-2 text-sm text-gray-500">開発環境では Voicevox の speaker ID を選択してください。</p>
        </div>

        <!-- Sherpa-onnx Controls -->
        <div v-if="audioEngine === 'sherpa-onnx'" class="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div class="flex items-center gap-4">
            <button 
              @click="loadSherpa" 
              :disabled="isSherpaReady || isSherpaLoading"
              :class="isSherpaReady ? 'bg-gray-400' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg'"
              class="px-6 py-3 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isSherpaReady ? '✅ ロード完了' : (isSherpaLoading ? '⏳ ロード中...' : '📥 Sherpa-onnx をロード') }}
            </button>
            <span v-if="isSherpaReady" class="text-green-600 font-semibold">準備完了</span>
          </div>
          <p v-if="sherpaError" class="mt-3 text-red-600 bg-red-50 p-3 rounded-lg">{{ sherpaError }}</p>
          <p class="mt-3 text-sm text-gray-600">※ 初回ロード時にモデルをダウンロードします（約50MB）</p>
        </div>

        <!-- Transformers.js Controls -->
        <div v-if="audioEngine === 'transformers'" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-center gap-4">
            <button 
              @click="loadTransformers" 
              :disabled="isTransformersReady || isTransformersLoading"
              :class="isTransformersReady ? 'bg-gray-400' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg'"
              class="px-6 py-3 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isTransformersReady ? '✅ ロード完了' : (isTransformersLoading ? '⏳ ロード中...' : '📥 Transformers.js をロード') }}
            </button>
            <span v-if="isTransformersReady" class="text-green-600 font-semibold">準備完了</span>
          </div>
          <p v-if="transformersError" class="mt-3 text-red-600 bg-red-50 p-3 rounded-lg">{{ transformersError }}</p>
          <p class="mt-3 text-sm text-gray-600">※ 初回ロード時にモデルをダウンロードします（約100-200MB）</p>
          <p class="mt-1 text-sm text-gray-600">※ 英語のみ対応（SpeechT5モデル）</p>
        </div>

        <div v-if="audioEngine === 'transformers' || audioEngine === 'sherpa-onnx'" class="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p class="text-sm text-yellow-800">💡 ブラウザ生成モード: FFmpeg.wasmを使用してブラウザ上で動画を生成します</p>
        </div>
      </section>

      <!-- Slides Editor -->
      <section class="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">✏️ スライド編集</h2>
        
        <div class="space-y-4">
          <div v-for="(slide, index) in slides" :key="slide.id" 
               class="bg-gray-50 rounded-lg p-5 border border-gray-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-3">
              <span class="text-lg font-bold text-blue-600">スライド {{ index + 1 }}</span>
              <button @click="removeSlide(index)" 
                      class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                🗑️ 削除
              </button>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">スライド内容（Markdown）</label>
                <textarea
                  v-model="slide.markdown"
                  placeholder="# タイトル&#10;&#10;- ポイント1&#10;- ポイント2"
                  rows="10"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                ></textarea>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">トークスクリプト</label>
                <textarea
                  v-model="slide.script"
                  placeholder="こんにちは。[pause:1.0]今日は..."
                  rows="10"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button @click="addSlide" 
                  class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors shadow-md">
            ➕ スライドを追加
          </button>
          <button @click="clearSlides" 
                  class="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors">
            🗑️ すべてクリア
          </button>
        </div>

        <button
          @click="generateVideo"
          :disabled="slides.length === 0 || isGenerating"
          class="mt-6 w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {{ isGenerating ? '⏳ 生成中...' : '🎬 動画を生成' }}
        </button>
      </section>

      <!-- Progress Section -->
      <section v-if="currentJob" class="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">⏳ 生成進捗</h2>
        <div class="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div class="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all duration-300" 
               :style="{ width: currentJob.progress + '%' }"></div>
        </div>
        <p class="mt-3 text-gray-700 font-medium">{{ currentJob.message }} ({{ currentJob.progress }}%)</p>
      </section>

      <!-- Video Player Section -->
      <section v-if="videoUrl" class="bg-white rounded-xl shadow-md p-6 border border-gray-200" ref="videoSection">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">🎥 生成された動画</h2>
        <video :src="videoUrl" controls class="w-full max-w-4xl mx-auto rounded-lg shadow-lg"></video>
        <div class="mt-6 text-center">
          <a :href="videoUrl" download 
             class="inline-block px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors shadow-md">
            📥 ダウンロード
          </a>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="mt-12 py-6 text-center text-gray-600 text-sm">
      <p>プレゼンテーション動画メーカー - Powered by VOICEVOX, Sherpa-onnx, Transformers.js</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
// WebSocket URLの構築: API_URLのプロトコルとホストをベースにする
const getWsUrl = () => {
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
    
    // API_URLから自動判定
    try {
        const url = new URL(API_URL);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}/ws/connect/global`;
    } catch (e) {
        return 'ws://localhost:8787/ws/connect/global';
    }
};

const STORAGE_KEY = 'presentation_maker_slides';

const slides = ref<Slide[]>([]);
const isGenerating = ref(false);
const currentJob = ref<JobProgress | null>(null);
const videoUrl = ref<string | null>(null);

const audioEngine = ref<AudioEngine>('voicevox');
// Selected VOICEVOX speaker id (number)
const voicevoxSpeaker = ref<number>(1);
const browserVideoGenerator = new BrowserVideoGenerator();

const isSherpaLoading = ref(false);
const isSherpaReady = ref(false);
const sherpaError = ref<string | null>(null);

const isTransformersLoading = ref(false);
const isTransformersReady = ref(false);
const transformersError = ref<string | null>(null);

const videoSection = ref<HTMLElement | null>(null);

let socket: WebSocket | null = null;
let pingInterval: number | undefined;
let reconnectTimeout: number | undefined;

// データ永続化
watch(slides, (newSlides) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSlides));
}, { deep: true });

function connectWebSocket() {
    if (socket?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl();
    console.log('Connecting to WebSocket:', wsUrl);
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket Connected');
        startHeartbeat();
        
        // 再接続時に進行中のジョブがあれば再参加
        if (currentJob.value?.jobId) {
            sendJson({
                type: 'join:job',
                payload: { jobId: currentJob.value.jobId }
            });
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (e) {
            console.error('Failed to parse WS message:', e);
        }
    };

    socket.onclose = () => {
        console.log('WebSocket Closed');
        stopHeartbeat();
        // 3秒後に再接続
        reconnectTimeout = window.setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        socket?.close();
    };
}

function sendJson(data: any) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function startHeartbeat() {
    stopHeartbeat();
    pingInterval = window.setInterval(() => {
        sendJson({ type: 'ping' });
    }, 30000);
}

function stopHeartbeat() {
    if (pingInterval) clearInterval(pingInterval);
}

function handleWsMessage(data: any) {
    const { type, payload } = data;

    switch (type) {
        case 'job:progress':
            currentJob.value = payload;
            break;
        
        case 'job:completed':
          currentJob.value = null;
          isGenerating.value = false;
          // Prefer API proxy download URL for recorded jobs to avoid CORS/ACL
          // problems when objects are stored in local MinIO/R2. If the jobId
          // is present, always use the API download proxy which handles
          // authentication/streaming and avoids direct public access issues.
          if (payload?.jobId) {
            videoUrl.value = `${API_URL}/api/videos/${payload.jobId}/download`;
          } else if (payload.videoUrl && /^https?:\/\//.test(payload.videoUrl)) {
            // If worker returned a direct MinIO/R2 URL, try to extract a jobId
            // from the path (jobs/<jobId>/final_presentation.mp4). If we can
            // extract it, prefer the API proxy; otherwise fall back to the
            // absolute URL.
            try {
              const parsed = new URL(payload.videoUrl);
              const jobsMatch = parsed.pathname.match(/jobs\/([-0-9a-fA-F]+)\//);
              if (jobsMatch && jobsMatch[1]) {
                const extractedJobId = jobsMatch[1];
                videoUrl.value = `${API_URL}/api/videos/${extractedJobId}/download`;
              } else {
                videoUrl.value = payload.videoUrl;
              }
            } catch (e) {
              videoUrl.value = payload.videoUrl;
            }
          } else {
            // Last-resort: prefix with API_URL so relative paths still work.
            videoUrl.value = API_URL + (payload.videoUrl || '');
          }

          setTimeout(() => {
            videoSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
          break;
            
        case 'job:failed':
            currentJob.value = null;
            isGenerating.value = false;
            alert(`エラー: ${payload.error || '不明なエラーが発生しました'}`);
            break;
            
        case 'pong':
            // console.log('pong');
            break;
    }
}

onMounted(() => {
  connectWebSocket();
  
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

  if (transformersService.isReady()) {
      isTransformersReady.value = true;
  }
  if (sherpaService.isReady()) {
      isSherpaReady.value = true;
  }
  
  updateBrowserMode();
});

watch(audioEngine, () => {
  updateBrowserMode();
});

function updateBrowserMode() {
  const isBrowserMode = audioEngine.value === 'sherpa-onnx' || audioEngine.value === 'transformers';
  const url = new URL(window.location.href);
  
  if (isBrowserMode) {
    url.searchParams.set('browserMode', 'true');
  } else {
    url.searchParams.delete('browserMode');
  }
  
  window.history.replaceState({}, '', url.toString());
}

onUnmounted(() => {
  stopHeartbeat();
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  socket?.close();
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
        addSlide();
    }
}

async function generateVideo() {
  if (slides.value.length === 0) return;
  
  isGenerating.value = true;
  videoUrl.value = null;
  
  try {
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
        
        setTimeout(() => {
          videoSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        return;
    }

    const response = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slides: slides.value, voicevoxSpeaker: voicevoxSpeaker.value }),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // WebSocket経由でジョブルームに参加
      sendJson({
          type: 'join:job',
          payload: { jobId: data.jobId }
      });

      currentJob.value = {
        jobId: data.jobId,
        progress: 0,
        message: 'キューに追加されました (待機中...)',
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
