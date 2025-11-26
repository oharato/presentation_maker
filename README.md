# Presentation Maker (Cloudflare Edition)

マークダウンファイルからプレゼンテーション動画を自動生成するアプリケーションです。
Cloudflareのエコシステム（Workers, Durable Objects, R2）をフル活用したサーバーレスアーキテクチャを採用しています。

## 特徴

*   **Markdown to Video**: シンプルなMarkdownファイルからスライドと音声を生成し、動画化します。
*   **Serverless Architecture**: Cloudflare Workers + Durable Objects + R2 で構築され、待機コストはほぼゼロです。
*   **Scale to Zero**: 動画生成を行うコンテナはオンデマンドで起動し、アイドル時に自動停止します。
*   **No External DB**: Redisなどの外部データベースを使わず、Cloudflare Durable Objectsでジョブキューと状態を管理します。

## 技術スタック

### フロントエンド
- **Framework**: Vue.js 3
- **Build Tool**: Vite
- **Hosting**: Cloudflare Pages

### バックエンド (API Gateway)
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Language**: TypeScript

### インフラ & データ
- **Job Queue & State**: Cloudflare Durable Objects (Redis不要)
- **Storage**: Cloudflare R2 (動画・音声ファイル)
- **Cache**: Cloudflare Workers KV

### 動画生成 (Compute)
- **Runtime**: Cloudflare Containers (Docker)
- **Tools**: Node.js, FFmpeg, Puppeteer
- **TTS**: VOICEVOX (Docker)

## アーキテクチャ

完全なサーバーレスアーキテクチャを採用し、コスト効率とスケーラビリティを最大化しています。

1.  **API Gateway**: Cloudflare Workers がリクエストを受け付け。
2.  **Job Queue**: Durable Objects がジョブの順序とステータスを管理。
3.  **Storage**: 素材と生成物は Cloudflare R2 に保存。
4.  **Compute**: 重い動画生成処理はコンテナで行い、Workersからオンデマンドで起動。
5.  **Realtime**: WebSocket (Durable Objects) で進捗をリアルタイム通知。

詳細なアーキテクチャ解説は [技術ブログ記事](docs/ARCHITECTURE_BLOG.md) をご覧ください。

## クイックスタート (ローカル開発)

### 前提条件
- Node.js v18+
- pnpm
- Docker (コンテナ動作確認用)

### セットアップ

```bash
# 依存関係インストール
pnpm install

# Cloudflare Workers (Backend) 起動
pnpm dev:workers
```

### コンテナ動作確認 (ローカル)

```bash
# コンテナビルド & 起動
docker-compose -f docker-compose.cloudflare.yml up --build
```

## ディレクトリ構造

```
presentation_maker/
├── apps/
│   ├── cli/              # CLIツール
│   ├── server/           # ローカル開発用バックエンド (Node.js/Express)
│   ├── web/              # フロントエンド (Vue.js)
│   └── workers/
│       ├── api/          # Cloudflare Workers (API Gateway)
│       └── container/    # 動画生成ワーカー (Cloudflare Container)
├── packages/
│   └── core/             # 共通ロジック (動画生成, Voicevoxクライアントなど)
├── input/                # CLI用入力ファイル
└── output/               # CLI用出力ファイル
```

## デプロイ

Cloudflareへのデプロイ手順は [Cloudflare デプロイガイド](docs/CLOUDFLARE_DEPLOY_GUIDE.md) を参照してください。

### コンテナデプロイ (自動化済み)
Cloudflare Containersへのデプロイは、イメージのビルド、タグ付け、プッシュ、そしてWorker設定の更新まで1つのコマンドで自動化されています。

```bash
# コンテナとWorkerをデプロイ
pnpm deploy:container
```

このコマンドは自動的に日時ベースのタグを生成し、`wrangler.jsonc` を更新してデプロイを行います。

```bash
# WebアプリとAPIも含む全体デプロイ
pnpm deploy:all
```

*   [**アーキテクチャ解説 (ブログ)**](docs/ARCHITECTURE_BLOG.md) - 技術選定の理由と構成図
*   [**デプロイガイド**](docs/CLOUDFLARE_DEPLOY_GUIDE.md) - 本番環境へのデプロイ手順
*   [**デプロイ設計書**](docs/CLOUDFLARE_DEPLOYMENT.md) - 詳細なシステム設計
*   [**ローカル開発ガイド**](docs/LOCAL_DEV_GUIDE.md) - Miniflareを使った開発方法

## ライセンス

ISC

## 作者

プロジェクトマネージャー兼開発者
