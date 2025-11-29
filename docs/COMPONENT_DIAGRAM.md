# コンポーネント図

## 1. CLIモードのコンポーネント構成

CLIモードでのローカル実行時のコンポーネント構成と処理フローです。

```mermaid
graph TD
    subgraph "CLI Application"
        CLI_Main["Main (index.ts)"]
        CLI_Scanner["File Scanner"]
        CLI_Grouper["File Grouper"]
    end

    subgraph "Core Services"
        Voicevox["VoicevoxService"]
        SlideRenderer["SlideRenderer"]
        VideoGen["VideoGenerator"]
    end

    subgraph "External Tools"
        VOICEVOX_API["VOICEVOX API"]
        Puppeteer["Puppeteer"]
        FFmpeg["FFmpeg"]
    end

    subgraph "File System"
        InputDir["input/"]
        OutputDir["output/"]
    end

    CLI_Main --> CLI_Scanner
    CLI_Scanner --> InputDir
    CLI_Scanner --> CLI_Grouper
    CLI_Grouper --> CLI_Main

    CLI_Main --> Voicevox
    CLI_Main --> SlideRenderer
    CLI_Main --> VideoGen

    Voicevox --> VOICEVOX_API
    SlideRenderer --> Puppeteer
    VideoGen --> FFmpeg

    Voicevox --> OutputDir
    SlideRenderer --> OutputDir
    VideoGen --> OutputDir

    style InputDir fill:#e3f2fd
    style OutputDir fill:#e8f5e9
```

### CLIモード処理フロー

```mermaid
sequenceDiagram
    participant Main as CLI Main
    participant FS as File System
    participant Check as File Checker
    participant Voicevox as VoicevoxService
    participant Renderer as SlideRenderer
    participant VideoGen as VideoGenerator

    Main->>FS: Scan input/ directory
    FS-->>Main: File list (.md, .txt)
    Main->>Main: Group files by slide ID

    loop Each Slide
        %% Audio Generation
        Main->>Voicevox: Generate audio from .txt
        Voicevox-->>Main: Save .wav to output/

        %% Image Check & Generation
        Main->>Check: Check existing image (.png/.jpg/.jpeg)
        alt Image exists
            Check-->>Main: Use existing image
        else No existing image
            Main->>Renderer: Render .md to image
            Renderer-->>Main: Save .png to output/
        end

        %% Silent Video Check & Generation
        Main->>Check: Check existing .nosound.mp4
        alt Silent video exists
            Check-->>Main: Use existing silent video
        else No existing silent video
            Main->>VideoGen: Create silent video from image
            VideoGen-->>Main: Save .nosound.mp4 to output/
        end

        %% Merge Audio & Video
        Main->>VideoGen: Merge audio and silent video
        VideoGen-->>Main: Save .mp4 to output/
    end

    Main->>VideoGen: Concatenate all videos
    VideoGen-->>Main: Save final_presentation.mp4
```

### CLIモード ファイル構成

```
project_root/
├── input/
│   ├── {番号}__{タイトル}.md    # スライド（Markdown）
│   └── {番号}__{タイトル}.txt   # 台本（テキスト）
│
└── output/
    ├── {番号}__{タイトル}.wav           # 生成: 音声
    ├── {番号}__{タイトル}.png           # 生成: スライド画像
    ├── {番号}__{タイトル}.jpg           # または事前準備済み画像
    ├── {番号}__{タイトル}.nosound.mp4   # 生成または事前準備済み: 無音動画
    ├── {番号}__{タイトル}.mp4           # 生成: 結合動画
    └── final_presentation.mp4           # 生成: 最終成果物
```

---

```mermaid
graph TD
    subgraph "Web App (Browser)"
        Web_UI["Vue.js UI (App.vue)"]
        Browser_SlideRenderer["BrowserSlideRenderer"]
        HTML_To_Image["html-to-image"]
        Marked_Browser["Marked (Browser)"]
    end

    Web_UI --> Browser_SlideRenderer
    Browser_SlideRenderer --> Marked_Browser
    Browser_SlideRenderer --> HTML_To_Image

    subgraph "Server-Side (Cloudflare Workers)"
        API_Gateway["API Gateway (api.ts)"]
        JobManager["JobManager (Durable Object)"]
        VideoWorker["Video Worker (Container)"]
        R2_Storage["R2 Storage"]
    end

    Web_UI -- API Calls / WebSockets --> API_Gateway
    API_Gateway -- Manages --> JobManager
    JobManager -- Queues Jobs --> VideoWorker
    VideoWorker -- Reads/Writes --> R2_Storage

    style Web_UI fill:#e0f2f7
    style Browser_SlideRenderer fill:#e0f7fa
    style HTML_To_Image fill:#e0f7fa
    style Marked_Browser fill:#e0f7fa
    style API_Gateway fill:#fff3e0
    style JobManager fill:#fff3e0
    style VideoWorker fill:#ffe0b2
    style R2_Storage fill:#ffecb3
```

### Webアプリモード処理フロー (ライブプレビュー含む)

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as Web UI (App.vue)
    participant BSR as BrowserSlideRenderer
    participant Marked as Marked (Browser)
    participant H2I as html-to-image

    User->>UI: Markdown入力
    UI->>BSR: render(markdown)
    BSR->>Marked: parse(markdown)
    Marked-->>BSR: HTMLコンテンツ
    BSR->>H2I: toPng(containerElement)
    H2I-->>BSR: PNG Blob
    BSR-->>UI: Blob URL
    UI->>User: ライブプレビュー表示

    User->>UI: 動画生成ボタンクリック
    UI->>UI: (ブラウザ側TTS/FFmpeg.wasm または サーバーAPI)
    UI->>User: 動画生成進捗表示
    UI->>User: 完成動画表示
```

## 3. 動画生成詳細シーケンス (Container Internal)

Video Workerコンテナ内部での処理フローとファイル操作の詳細です。

```mermaid
sequenceDiagram
    participant Poller as Job Poller
    participant Proc as Processor
    participant R2 as R2 Storage

    Proc->>Voicevox: Generate Audio
    Voicevox-->>Proc: Save "audio_01.wav"
    
    Proc->>FFmpeg: Create Silent Video (Image + Duration)
    FFmpeg-->>Proc: Save "video_01_silent.mp4"
    
    Proc->>FFmpeg: Merge Audio & Video
    FFmpeg-->>Proc: Save "video_01.mp4"
    
    %% Concatenation
    Proc->>FFmpeg: Concat All Videos
    FFmpeg-->>Proc: Save "final.mp4"
    
    %% Upload & Cleanup
    Proc->>R2: Upload "final.mp4"
    Proc->>Proc: Remove Temp Dir
    Proc-->>Poller: Job Completed
```

## 4. データモデル (Durable Object State)

JobManagerが保持する状態データの構造です。

```typescript
// Job State stored in Durable Object
interface JobState {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  createdAt: number;
  updatedAt: number;
  resultUrl?: string; // R2 Public URL or Signed URL
  error?: string;
}

// Queue Structure
type JobQueue = string[]; // List of Job IDs
```

## 5. ファイルパス構成 (R2 & Container)

### R2 Storage Structure
```
bucket/
  ├── jobs/
  │   └── {jobId}/
  │       ├── uploads/
  │       │   ├── {slideId}__{title}.md
  │       │   └── {slideId}__{title}.txt
  │       │
  │       ├── 0{slideId}__{title}.nosound.mp4
  │       ├── 0{slideId}__{title}.mp4
  │       └── final_presentation.mp4
```

### Container Temp Directory
```
/app/
  ├── temp/
  │   └── {jobId}/
  │       ├── {slideId}__{title}.md
  │       ├── {slideId}__{title}.txt
  │       └── {slideId}__{title}.png
  │
  └── output/
      └── {jobId}/
          ├── {slideId}__{title}.wav
          ├── {slideId}__{title}.nosound.mp4
          ├── {slideId}__{title}.mp4
          └── final_presentation.mp4
```
