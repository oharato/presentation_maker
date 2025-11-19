# プレゼンテーション動画制作アプリ - 変更履歴

## v2.0.0 - Webアプリケーション化 (2025-11-20)

### 追加機能
- **Webアプリケーション**: Vue.js + Hono によるWebインターフェース
  - ローカルフォルダからのファイルアップロード
  - ブラウザ上での手動入力
  - リアルタイム進捗表示
  - 動画プレビュー・ダウンロード
- **非同期ジョブキュー**: Bull + Redis による動画生成の非同期処理
- **リアルタイム通信**: Socket.IOによる進捗通知
- **Docker Compose**: Redis環境の簡単セットアップ

### 技術スタック変更
- **Webフレームワーク**: Express → Hono (軽量・高速)
- **フロントエンド**: Vue.js 3 + TypeScript + Vite
- **ジョブキュー**: Bull (Redis)
- **リアルタイム**: Socket.IO

### ドキュメント
- `docs/WEB_APP_SETUP.md`: Webアプリセットアップガイド
- `docs/API.md`: API仕様書
- `docker-compose.yml`: Redis環境定義

### 依存関係
- 追加: `hono`, `@hono/node-server`, `bull`, `ioredis`, `socket.io`, `uuid`
- 削除: `express`, `cors` (Honoに移行)
- 削除: `@types/glob`, `@types/marked`, `@types/uuid` (deprecated)

---

## v1.0.0 - 初期リリース

### 機能
- Markdownスライドから画像生成
- テキストスクリプトから音声生成 (VOICEVOX)
- 音声付き動画の自動生成
- 複数スライドの結合
- `[pause:N]` 構文による無音挿入
- 環境変数による音声設定

### 技術スタック
- TypeScript
- Node.js
- FFmpeg (動画処理)
- VOICEVOX (音声合成)
- Puppeteer (スライドレンダリング)
- Marked (Markdown処理)

### テスト
- Jest + ts-jest
- VoicevoxService, SlideRenderer, VideoGenerator のユニットテスト
