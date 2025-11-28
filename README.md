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

## CLIモードの使用方法

CLIモードでは、ローカル環境でプレゼンテーション動画を生成できます。

### 基本的な使い方

1. `input/` ディレクトリにMarkdownファイル（`.md`）とテキストファイル（`.txt`）を配置
2. `pnpm dev:cli` を実行

### 事前準備ファイルの活用

CLIモードでは、事前に用意された画像や無音動画ファイルを `input/` に置くことで活用できます：

- **スライド画像**: `input/{番号}__{タイトル}.png`, `.jpg`, `.jpeg` が存在する場合、Markdownからの画像生成をスキップ
- **無音動画**: `input/{番号}__{タイトル}.nosound.mp4` が存在する場合、無音動画の生成をスキップ

これにより、外部ツールで作成した高品質な画像やカスタム動画を利用できます。

### CLI のメディアパイプラインと新機能

CLI（`apps/cli`）でのローカルメディア生成フローに関する重要な仕様と、追加した便利な機能をまとめます。

- **入力場所**: 事前準備素材はすべて `input/` に配置します。ファイル名は `NNN__title.*` の形式を想定します（例: `020__slide-title.md`, `021__cover.png`, `031__demo.mp4`）。
- **スライド素材の自動利用**:
	- 画像: `input/{id}__*.png|jpg|jpeg` がある場合は Markdown レンダリングをスキップしてその画像をスライドに使用します。
	- 無音動画: `input/{id}__*.nosound.mp4` を置くとスライドごとの無音動画生成をスキップできます。
	- フル mp4: `input/{id}__*.mp4` を置くと、音声の有無を検査してそのまま使うか（音声あり）、音声と合成するか（無音）を自動で判断します。
- **出力ファイル**: 各スライドの最終動画は `output/{id}__title.mp4`、さらに音声と結合した「処理済みファイル」を `output/{id}__title.processed.mp4` として出力します。最終的な結合は `output/final_presentation.mp4` に書き出されます。
- **音声と動画のマージ**:
	- スライドごとに音声（VOICEVOX生成）と動画を結合する際、音声の先頭が負のPTSになるケースに対処するため、マージ処理で音声PTSをリセット（`asetpts=PTS-STARTPTS`）します。
	- マージ時は「長い方の長さを優先」するロジックを取り入れています（audio/video をプローブして短い方を `apad`/`tpad` で延長し `-t` で長さを揃える）。
	- まず可能なら高速なコピーパス（ストリームコピー）を試行し、問題があれば再エンコードして正常化します。
- **最終結合（concat）**:
	- デフォルトは高速な concat（copy ベース）を試み、失敗や音声の欠落があれば再エンコードでフォールバックします。
	- 再エンコード concat は PTS 再生成フラグ（`-fflags +genpts -avoid_negative_ts make_zero`）を使い、必要に応じて全入力を同一解像度/コーデックに正規化します。
	- 再エンコード時は規定解像度（デフォルト `1920x1080`）に「アスペクト比を維持してフィット（scale+pad）」するフィルタを適用します。

- **画像からの動画化**: `imageToVideo`（スライド画像 → 無音動画）は、画像をアスペクト比を維持してターゲット解像度にフィット（中央パディング）する `scale+pad` フィルタを使用します。デフォルト解像度は `1920x1080` です。

- **CLI 引数の便利機能**:
	- `pnpm --filter @presentation-maker/cli dev` : すべて生成 → 結合（従来の動作）
	- `pnpm --filter @presentation-maker/cli dev 020` : 指定のスライド ID（複数可）だけ処理して結合
	- `pnpm --filter @presentation-maker/cli dev final` : 既に存在する `output/*.processed.mp4` を使って「最終結合のみ」を行う（再生成は行いません）

- **サムネイル→PDF バッチ**: `apps/cli` に `thumbnails-to-pdf` スクリプトを追加しました。`output/*.processed.mp4` の先頭フレームを抽出して `output/presentation_thumbnails.pdf` にまとめます。

### 使い方（例）

```bash
# すべての処理
pnpm --filter @presentation-maker/cli dev

# ID 020 のみ処理
pnpm --filter @presentation-maker/cli dev 020

# 既存の processed 動画だけ結合して final を作る
pnpm --filter @presentation-maker/cli dev final

# processed の先頭サムネイルを PDF にまとめる
pnpm --filter @presentation-maker/cli run thumbnails-to-pdf
```

このセクションで説明した CLI とメディアパイプラインの実装は、`packages/core/src/utils/ffmpeg.ts`（および生成済みの `dist`）にあるユーティリティを使って行われています。音声PTSの正規化やアスペクト比維持、再エンコードフォールバックなどのロジックはそこで管理されています。

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
