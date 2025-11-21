# Presentation Maker

プレゼンテーション動画を自動生成するアプリケーションです。
Markdownのスライドとテキストの台本から、音声付きの動画を作成します。

## 特徴

✨ **2つのモード**
- **CLIモード**: コマンドラインから一括処理
- **Webアプリモード**: ブラウザから対話的に操作

🎯 **主な機能**
- Markdownスライドから高品質な画像生成
- VOICEVOX による自然な音声合成
- 音声とスライドの自動同期
- 複数スライドの自動結合
- リアルタイム進捗表示 (Webアプリ)
- `[pause:N]` 構文による無音挿入
- **入力データの自動保存**:
  - ブラウザのローカルストレージに入力内容を自動保存
  - リロードしても作業を継続可能
- **ブラウザ完結モード (実験的)**:
  - サーバー不要で動画生成が可能
  - Transformers.js によるブラウザ内音声合成 (現在は英語のみ、キャッシュ対応で高速化)
  - FFmpeg.wasm によるブラウザ内動画処理

## 前提条件

### 必須
- **Node.js** v18以上
- **pnpm** パッケージマネージャー
- **FFmpeg** 動画処理ツール
- **VOICEVOX** 音声合成エンジン

### Webアプリモードの場合
- **Docker** (WSL2推奨) または **Redis**

## クイックスタート

### CLIモード

1. **依存関係をインストール**
    ```bash
    pnpm install
    ```

2. **環境変数を設定**
    ```bash
    cp .env.sample .env
    # 必要に応じて .env を編集 (音声IDなど)
    ```

3. **VOICEVOXを起動**
    - VOICEVOXアプリを起動してください

4. **入力ファイルを配置**
    
    `input`フォルダに以下の形式でファイルを配置:
    - スライド: `010__title.md`
    - 台本: `010__title.txt`
    
    ファイル名の規則:
    - `{番号}__{タイトル}.{拡張子}`
    - 番号が一致するファイルが1つのスライドとして処理されます

5. **実行**
    ```bash
    pnpm start
    ```

6. **出力を確認**
    
    `output`フォルダに以下が生成されます:
    - `010__title.wav` - 音声ファイル
    - `010__title.png` - スライド画像
    - `010__title.nosound.mp4` - 無音動画
    - `010__title.mp4` - 完成動画
    - `final_presentation.mp4` - 全スライド結合動画

### Webアプリモード

詳細は [docs/WEB_APP_SETUP.md](docs/WEB_APP_SETUP.md) を参照してください。

**簡単セットアップ:**

```bash
# 1. Redisを起動 (WSL2 Docker)
start-redis.bat
# または
pnpm redis:start

# 2. 依存関係をインストール
pnpm install
cd web && pnpm install && cd ..

# 3. 開発サーバーを起動
pnpm dev
```

**アクセス:**
- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000
- Socket.IO: http://localhost:3001

**使い方:**
1. ブラウザで http://localhost:5173 を開く
2. ローカルフォルダをアップロード、または手動入力
3. 動画生成ボタンをクリック
4. リアルタイムで進捗を確認
5. 完成した動画をプレビュー・ダウンロード

## ドキュメント

### 📚 主要ドキュメント
- [**アーキテクチャ概要**](docs/ARCHITECTURE.md) - システム全体図、データフロー、技術スタック
- [**Webアプリセットアップ**](docs/WEB_APP_SETUP.md) - Webアプリの詳細セットアップ手順
- [**API仕様**](docs/API.md) - REST API と Socket.IO イベント仕様

### 📖 詳細ドキュメント
- [要件仕様](docs/REQUIREMENTS.md) - プロジェクト要件
- [技術仕様](docs/SPECIFICATIONS.md) - 技術的な仕様
- [開発環境](docs/DEVELOPMENT.md) - 開発環境のセットアップ
- [コンポーネント図](docs/COMPONENT_DIAGRAM.md) - CLIモードのコンポーネント図

### 🔧 運用ドキュメント
- [WSL2 Docker Redis](docs/WSL2_DOCKER_REDIS.md) - WSL2でRedisを使う方法
- [変更履歴](docs/CHANGELOG.md) - バージョン履歴

## スクリプト

### CLIモード
```bash
pnpm start              # アプリケーション実行
pnpm build              # TypeScriptビルド
pnpm clean              # 出力ファイルクリア
```

### Webアプリモード
```bash
pnpm dev                # 開発サーバー起動 (フロント+バック)
pnpm dev:server         # バックエンドのみ起動
pnpm dev:web            # フロントエンドのみ起動
pnpm build:web          # フロントエンドビルド
```

### Redis管理 (WSL2 Docker)
```bash
pnpm redis:start        # Redis起動
pnpm redis:stop         # Redis停止
pnpm redis:logs         # ログ確認

# または、バッチファイルを使用 (Windows)
start-redis.bat         # Redis起動
stop-redis.bat          # Redis停止
```

### テスト
```bash
pnpm test               # 全テスト実行
pnpm test:watch         # ウォッチモード
```

## 設定

### 音声の変更

`.env`ファイルで`VOICEVOX_SPEAKER_ID`を変更:

```env
VOICEVOX_SPEAKER_ID=1   # 1: ずんだもん (デフォルト)
```

利用可能な音声IDは`.env.sample`を参照してください。

詳細: http://localhost:50021/docs (VOICEVOX起動中)

### ポーズの挿入

台本ファイル内で `[pause:秒数]` と記述:

```
こんにちは。[pause:1.5]今日はいい天気ですね。
```

- `1.5` = 1.5秒の無音
- 小数点以下も指定可能

## 技術スタック

### フロントエンド (Webアプリ)
- Vue.js 3 + TypeScript
- Vite
- Socket.IO Client

### バックエンド
- Hono (軽量Webフレームワーク)
- Socket.IO (リアルタイム通信)
- Bull (ジョブキュー)
- Redis (データストア)

### サービス
- VOICEVOX (音声合成)
- FFmpeg (動画処理)
- Puppeteer (スライドレンダリング)
- Marked (Markdown処理)

## トラブルシューティング

### VOICEVOXに接続できない
```bash
# VOICEVOXが起動しているか確認
# ブラウザで http://localhost:50021/docs にアクセス
```

### Redisに接続できない (Webアプリ)
```bash
# WSL2 Docker の場合
wsl docker compose ps

# ローカルRedisの場合
redis-cli ping
```

### FFmpegが見つからない
```bash
# インストール確認
ffmpeg -version

# Windowsの場合
winget install Gyan.FFmpeg
```

### テストが失敗する
```bash
# node_modulesを再インストール
rm -rf node_modules
pnpm install

# キャッシュをクリア
pnpm store prune
```

## 貢献

プルリクエストを歓迎します!

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## ライセンス

ISC

## 作者

プロジェクトマネージャー兼開発者

---

**📖 詳細なドキュメントは [docs/](docs/) ディレクトリを参照してください。**
