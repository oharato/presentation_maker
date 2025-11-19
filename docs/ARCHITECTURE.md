# アーキテクチャ概要

## システム全体図

```mermaid
graph TB
    subgraph "クライアント"
        Browser[ブラウザ]
    end

    subgraph "フロントエンド (Vue.js)"
        VueApp[Vue Application<br/>localhost:5173]
        Components[Components<br/>- SlideEditor<br/>- ScriptEditor<br/>- VideoPlayer<br/>- ProgressBar]
    end

    subgraph "バックエンド"
        subgraph "Honoサーバー (localhost:3000)"
            HonoAPI[REST API<br/>- /api/upload-folder<br/>- /api/generate<br/>- /api/jobs/:id]
            StaticFiles[静的ファイル配信<br/>- /videos/*<br/>- Vue dist]
        end

        subgraph "Socket.IOサーバー (localhost:3001)"
            SocketIO[Socket.IO<br/>リアルタイム通信]
        end

        subgraph "ジョブキュー"
            Bull[Bull Queue<br/>ジョブ管理]
            Worker[Video Worker<br/>動画生成処理]
        end

        subgraph "サービス層"
            Voicevox[VoicevoxService<br/>音声生成]
            SlideRender[SlideRenderer<br/>スライド画像生成]
            VideoGen[VideoGenerator<br/>動画生成・結合]
        end
    end

    subgraph "外部サービス"
        Redis[(Redis<br/>Docker Container<br/>localhost:6379)]
        VoicevoxAPI[VOICEVOX API<br/>localhost:50021]
        FFmpeg[FFmpeg<br/>動画処理]
    end

    Browser -->|HTTP/WebSocket| VueApp
    VueApp --> Components
    VueApp -->|HTTP Request| HonoAPI
    VueApp -->|WebSocket| SocketIO
    
    HonoAPI -->|ジョブ追加| Bull
    SocketIO -->|進捗通知| VueApp
    
    Bull -->|ジョブ取得| Worker
    Worker -->|進捗送信| SocketIO
    Worker --> Voicevox
    Worker --> SlideRender
    Worker --> VideoGen
    
    Bull -.->|保存| Redis
    Voicevox -->|API呼び出し| VoicevoxAPI
    VideoGen -->|実行| FFmpeg
    
    HonoAPI -->|配信| StaticFiles

    style Browser fill:#e1f5ff
    style VueApp fill:#42b983
    style HonoAPI fill:#ff6b6b
    style SocketIO fill:#4ecdc4
    style Bull fill:#ffe66d
    style Worker fill:#ffd93d
    style Redis fill:#dc143c,color:#fff
    style VoicevoxAPI fill:#95e1d3
    style FFmpeg fill:#a8dadc
```

## データフロー図

### 1. ファイルアップロードフロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Vue as Vue App
    participant Hono as Hono API
    participant Bull as Bull Queue
    participant Worker as Video Worker
    participant Socket as Socket.IO
    participant Redis as Redis

    User->>Vue: フォルダ選択
    Vue->>Hono: POST /api/upload-folder<br/>(FormData)
    Hono->>Hono: ファイル解析<br/>スライドグループ化
    Hono->>Bull: ジョブ追加
    Bull->>Redis: ジョブ保存
    Hono-->>Vue: jobId返却
    Vue->>Socket: join:job (jobId)
    
    Worker->>Bull: ジョブ取得
    Worker->>Worker: スライド1処理
    Worker->>Socket: job:progress (33%)
    Socket-->>Vue: 進捗表示
    
    Worker->>Worker: スライド2処理
    Worker->>Socket: job:progress (66%)
    Socket-->>Vue: 進捗表示
    
    Worker->>Worker: スライド3処理
    Worker->>Socket: job:progress (100%)
    Socket-->>Vue: 進捗表示
    
    Worker->>Worker: 動画結合
    Worker->>Socket: job:completed<br/>(videoUrl)
    Socket-->>Vue: 完了通知
    Vue-->>User: 動画表示
```

### 2. 手動入力フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Vue as Vue App
    participant Hono as Hono API
    participant Bull as Bull Queue
    participant Worker as Video Worker
    participant Socket as Socket.IO

    User->>Vue: スライド入力
    User->>Vue: 動画生成ボタン
    Vue->>Hono: POST /api/generate<br/>(JSON)
    Hono->>Bull: ジョブ追加
    Hono-->>Vue: jobId返却
    Vue->>Socket: join:job (jobId)
    
    loop 各スライド
        Worker->>Worker: 音声生成
        Worker->>Worker: 画像生成
        Worker->>Worker: 動画生成
        Worker->>Socket: job:progress
        Socket-->>Vue: 進捗更新
    end
    
    Worker->>Worker: 最終動画結合
    Worker->>Socket: job:completed
    Socket-->>Vue: 完了通知
    Vue-->>User: 動画プレビュー
```

## コンポーネント詳細図

```mermaid
graph LR
    subgraph "Video Worker 処理フロー"
        Start([ジョブ開始]) --> ParseSlides[スライド解析]
        ParseSlides --> Loop{全スライド<br/>処理完了?}
        
        Loop -->|No| GenAudio[音声生成<br/>VoicevoxService]
        GenAudio --> GenImage[画像生成<br/>SlideRenderer]
        GenImage --> GenVideo[動画生成<br/>VideoGenerator]
        GenVideo --> Progress[進捗通知<br/>Socket.IO]
        Progress --> Loop
        
        Loop -->|Yes| Concat[動画結合<br/>VideoGenerator]
        Concat --> Complete([完了通知])
    end

    style Start fill:#90ee90
    style Complete fill:#87ceeb
    style GenAudio fill:#ffd700
    style GenImage fill:#ffa07a
    style GenVideo fill:#dda0dd
```

## 技術スタック

```mermaid
graph LR
    subgraph Frontend["フロントエンド"]
        Vue["Vue.js 3"]
        Vite["Vite"]
        SocketClient["Socket.IO Client"]
    end

    subgraph Backend["バックエンド"]
        Hono["Hono"]
        SocketServer["Socket.IO Server"]
        Bull["Bull Queue"]
    end

    subgraph Data["データストア"]
        Redis["Redis 7"]
    end

    subgraph External["外部サービス"]
        VOICEVOX["VOICEVOX API"]
        FFmpeg["FFmpeg"]
        Puppeteer["Puppeteer"]
    end

    Vue --> SocketClient
    Hono --> SocketServer
    Hono --> Bull
    Bull --> Redis
    SocketServer -.-> SocketClient
    Hono --> VOICEVOX
    Hono --> FFmpeg
    Hono --> Puppeteer

    style Vue fill:#42b983
    style Hono fill:#ff6b6b
    style Redis fill:#dc143c,color:#fff
    style VOICEVOX fill:#95e1d3
    style FFmpeg fill:#a8dadc
```

**使用技術一覧:**

### フロントエンド
- **Vue.js 3** - UIフレームワーク
- **TypeScript** - 型安全な開発
- **Vite** - 高速ビルドツール
- **Socket.IO Client** - リアルタイム通信

### バックエンド
- **Hono** - 軽量Webフレームワーク
- **TypeScript** - 型安全な開発
- **Socket.IO Server** - リアルタイム通信
- **Bull** - ジョブキュー
- **@hono/node-server** - Node.jsサーバー

### データストア
- **Redis 7** - インメモリデータストア

### 外部サービス・ツール
- **VOICEVOX** - 音声合成エンジン
- **FFmpeg** - 動画処理
- **Puppeteer** - ブラウザ自動化

### ライブラリ
- **Marked** - Markdown処理
- **Axios** - HTTPクライアント
- **IORedis** - Redisクライアント
- **Multer** - ファイルアップロード
- **fs-extra** - ファイルシステム操作
- **glob** - ファイル検索


## デプロイメント構成

```mermaid
graph TB
    subgraph "開発環境"
        DevVue[Vue Dev Server<br/>:5173]
        DevHono[Hono Server<br/>:3000]
        DevSocket[Socket.IO<br/>:3001]
        DevRedis[Redis Docker<br/>:6379]
    end

    subgraph "本番環境"
        ProdHono[Hono Server<br/>:3000]
        ProdSocket[Socket.IO<br/>:3001]
        ProdStatic[静的ファイル<br/>Vue dist]
        ProdRedis[Redis<br/>:6379]
    end

    DevVue -.->|ビルド| ProdStatic
    DevHono -.->|ビルド| ProdHono
    DevSocket -.->|ビルド| ProdSocket
    DevRedis -.->|同じ| ProdRedis

    style DevVue fill:#e3f2fd
    style DevHono fill:#fff3e0
    style DevSocket fill:#e0f2f1
    style DevRedis fill:#fce4ec
    
    style ProdHono fill:#ff6b6b
    style ProdSocket fill:#4ecdc4
    style ProdStatic fill:#42b983
    style ProdRedis fill:#dc143c,color:#fff
```

## ディレクトリ構造

```
presentation_maker/
├── src/                      # CLIモード (既存)
│   ├── services/
│   │   ├── voicevox.ts      # 音声生成サービス
│   │   ├── slide_renderer.ts # スライド画像生成
│   │   └── video_generator.ts # 動画生成・結合
│   ├── config.ts            # 環境変数設定
│   └── index.ts             # CLIエントリーポイント
│
├── server/                   # Webアプリバックエンド
│   ├── routes/
│   │   └── api.ts           # REST APIルート
│   ├── workers/
│   │   └── videoWorker.ts   # ジョブワーカー
│   ├── queue.ts             # Bullキュー設定
│   └── server.ts            # サーバーエントリーポイント
│
├── web/                      # Webアプリフロントエンド
│   ├── src/
│   │   ├── App.vue          # メインコンポーネント
│   │   └── main.ts          # エントリーポイント
│   ├── public/
│   └── dist/                # ビルド出力
│
├── docs/                     # ドキュメント
│   ├── API.md
│   ├── ARCHITECTURE.md      # このファイル
│   ├── CHANGELOG.md
│   ├── COMPONENT_DIAGRAM.md
│   ├── DEVELOPMENT.md
│   ├── REQUIREMENTS.md
│   ├── SPECIFICATIONS.md
│   ├── WEB_APP_SETUP.md
│   └── WSL2_DOCKER_REDIS.md
│
├── tests/                    # テスト
│   └── services/
│
├── input/                    # 入力ファイル (CLI)
├── output/                   # 出力ファイル (CLI)
├── public/                   # 公開ファイル (Web)
│   └── videos/              # 生成動画
│
├── docker-compose.yml        # Redis環境
├── start-redis.bat          # Redis起動 (Windows)
├── stop-redis.bat           # Redis停止 (Windows)
└── package.json             # 依存関係・スクリプト
```

## セキュリティ考慮事項

```mermaid
graph LR
    subgraph "入力検証"
        FileValidation[ファイル検証<br/>- サイズ制限<br/>- 拡張子チェック]
        DataValidation[データ検証<br/>- スライド数制限<br/>- 文字列長制限]
    end

    subgraph "認証・認可"
        Future[将来実装予定<br/>- ユーザー認証<br/>- セッション管理]
    end

    subgraph "データ保護"
        TempCleanup[一時ファイル削除<br/>- アップロード後<br/>- 生成後]
        VideoExpiry[動画有効期限<br/>将来実装予定]
    end

    subgraph "レート制限"
        JobLimit[ジョブ制限<br/>将来実装予定]
    end

    style FileValidation fill:#90ee90
    style DataValidation fill:#90ee90
    style TempCleanup fill:#87ceeb
    style Future fill:#d3d3d3
    style JobLimit fill:#d3d3d3
    style VideoExpiry fill:#d3d3d3
```

## パフォーマンス最適化

### キャッシング戦略

```mermaid
graph TB
    Request[リクエスト] --> CheckCache{キャッシュ<br/>存在?}
    CheckCache -->|Yes| ReturnCache[キャッシュ返却]
    CheckCache -->|No| Generate[生成処理]
    Generate --> SaveCache[キャッシュ保存]
    SaveCache --> Return[結果返却]
    
    subgraph "キャッシュ対象"
        SilenceCache[無音音声<br/>VoicevoxService]
        SlideCache[スライド画像<br/>将来実装予定]
    end

    style CheckCache fill:#ffe66d
    style ReturnCache fill:#90ee90
    style SaveCache fill:#87ceeb
```

### ジョブキュー設定

- **並列処理**: 複数ワーカーで同時処理可能
- **優先度**: 将来的にユーザーごとの優先度設定
- **リトライ**: 失敗時の自動リトライ (Bull設定)
- **タイムアウト**: 長時間ジョブの自動キャンセル

## スケーラビリティ

```mermaid
graph TB
    subgraph "現在 (シングルサーバー)"
        SingleHono[Hono Server]
        SingleWorker[Worker]
        SingleRedis[Redis]
    end

    subgraph "将来 (スケールアウト)"
        LB[Load Balancer]
        Hono1[Hono Server 1]
        Hono2[Hono Server 2]
        Worker1[Worker 1]
        Worker2[Worker 2]
        Worker3[Worker 3]
        RedisCluster[Redis Cluster]
    end

    LB --> Hono1
    LB --> Hono2
    Hono1 --> RedisCluster
    Hono2 --> RedisCluster
    Worker1 --> RedisCluster
    Worker2 --> RedisCluster
    Worker3 --> RedisCluster

    style SingleHono fill:#ff6b6b
    style SingleWorker fill:#ffd93d
    style SingleRedis fill:#dc143c,color:#fff
    
    style LB fill:#4ecdc4
    style RedisCluster fill:#dc143c,color:#fff
```
