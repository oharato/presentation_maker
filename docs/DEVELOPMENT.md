# 開発環境 (DEVELOPMENT)

## 必須ツール

### 共通 (CLI + Webアプリ)
- **OS**: Windows (WSL2推奨)
- **Node.js**: v18以上 (LTS推奨)
- **pnpm**: パッケージマネージャ
  ```bash
  npm install -g pnpm
  ```
- **FFmpeg**: 動画処理用。PATHを通しておくこと
  ```bash
  # Windows
  winget install Gyan.FFmpeg
  
  # 確認
  ffmpeg -version
  ```
- **VOICEVOX**: 音声合成エンジン
  - ダウンロード: https://voicevox.hiroshiba.jp/
  - 起動後、`http://127.0.0.1:50021` でAPIが利用可能

### Webアプリモード追加要件
- **Docker** (WSL2推奨) または **Redis**
  ```bash
  # WSL2 Docker確認
  wsl docker --version
  
  # または、ローカルRedis
  redis-server --version
  ```

## セットアップ

### 1. リポジトリのクローン
```bash
git clone <repository-url>
cd presentation_maker
```

### 2. 依存関係のインストール

#### CLIモード
```bash
pnpm install
```

#### Webアプリモード
```bash
# ルート
pnpm install

# フロントエンド
cd web
pnpm install
cd ..
```

### 3. 環境変数の設定
```bash
# .envファイルを作成
cp .env.sample .env

# 必要に応じて編集
# - VOICEVOX_BASE_URL
# - VOICEVOX_SPEAKER_ID
```

### 4. Redis起動 (Webアプリモードのみ)
```bash
# WSL2 Docker
pnpm redis:start

# または
start-redis.bat
```

## 実行

### Docker Compose を使用した実行 (推奨)

全てのサービス (Web, API, Worker, Voicevox) を一括で起動できます。

```bash
docker compose -f docker-compose.local.yml up
```

- Web UI: http://localhost:5173
- API: http://localhost:8787
- Worker: http://localhost:8080 (内部通信用)
- Voicevox: http://localhost:50021

停止するには:
```bash
docker compose -f docker-compose.local.yml down
```

### CLIモード
```bash
# 開発実行
pnpm start

# ビルド
pnpm build

# ビルド後実行
node dist/src/index.js
```

### Webアプリモード
```bash
# 開発モード (推奨)
pnpm dev

# 個別起動
pnpm dev:server  # バックエンドのみ
pnpm dev:web     # フロントエンドのみ

# 本番ビルド
pnpm build:web
pnpm build
```

## テスト

```bash
# 全テスト実行
pnpm test

# ウォッチモード
pnpm test:watch

# カバレッジ
pnpm test -- --coverage
```

## 技術スタック

### CLIモード
- **言語**: TypeScript
- **動画処理**: fluent-ffmpeg
- **音声合成**: VOICEVOX (HTTP API)
- **Markdown処理**: marked
- **スライドレンダリング**: puppeteer
- **その他**: fs-extra, axios, glob

### Webアプリモード (追加)
- **バックエンド**:
  - Hono (Webフレームワーク)
  - Socket.IO (リアルタイム通信)
  - Bull (ジョブキュー)
  - IORedis (Redisクライアント)
  - Multer (ファイルアップロード)

- **フロントエンド**:
  - Vue.js 3 (UIフレームワーク)
  - TypeScript
  - Vite (ビルドツール)
  - Socket.IO Client
  - **Markdown処理**: marked (ライブプレビュー用)
  - **スライドレンダリング**: html-to-image (ライブプレビュー用)

- **インフラ**:
  - Redis (ジョブキュー・データストア)
  - Docker (Redis環境)

## ディレクトリ構造

```
presentation_maker/
├── src/                  # CLIモード
│   ├── services/         # サービス層
│   ├── config.ts         # 環境変数設定
│   └── index.ts          # エントリーポイント
├── server/               # Webアプリバックエンド
│   ├── routes/           # APIルート
│   ├── workers/          # ジョブワーカー
│   ├── queue.ts          # Bullキュー設定
│   └── server.ts         # サーバーエントリーポイント
├── web/                  # Webアプリフロントエンド
│   ├── src/
│   │   ├── App.vue       # メインコンポーネント
│   │   └── main.ts
│   └── dist/             # ビルド出力
├── tests/                # テスト
├── docs/                 # ドキュメント
├── input/                # 入力ファイル (CLI)
├── output/               # 出力ファイル (CLI)
└── public/               # 公開ファイル (Web)
    └── videos/           # 生成動画
```

## 開発ワークフロー

### 新機能の追加

1. **ブランチ作成**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **コード実装**
   - サービス層に機能を実装
   - 必要に応じてテスト追加

3. **テスト**
   ```bash
   pnpm test
   ```

4. **コミット**
   ```bash
   git add .
   git commit -m "Add new feature"
   ```

5. **プッシュ**
   ```bash
   git push origin feature/new-feature
   ```

### バグ修正

1. **問題の特定**
   - ログ確認
   - デバッグ実行

2. **修正実装**
   - 該当コードを修正
   - テスト追加/更新

3. **検証**
   ```bash
   pnpm test
   pnpm start  # または pnpm dev
   ```

## デバッグ

### CLIモード
```bash
# TypeScriptデバッグ
node --inspect -r ts-node/register src/index.ts

# VSCodeでデバッグ
# .vscode/launch.json を設定
```

### Webアプリモード
```bash
# バックエンドデバッグ
node --inspect -r ts-node/register server/server.ts

# フロントエンド
# ブラウザのDevToolsを使用
```

### ログ確認
```bash
# Redis
pnpm redis:logs

# アプリケーション
# コンソール出力を確認
```

## トラブルシューティング

### pnpm installが失敗
```bash
# キャッシュクリア
pnpm store prune

# 再インストール
rm -rf node_modules
pnpm install
```

### TypeScriptエラー
```bash
# 型定義の再インストール
pnpm install -D @types/node

# tsconfigの確認
cat tsconfig.json
```

### Redisに接続できない
```bash
# Docker確認
wsl docker compose ps

# 再起動
pnpm redis:stop
pnpm redis:start
```

### VOICEVOXに接続できない
```bash
# APIエンドポイント確認
curl http://localhost:50021/speakers

# ブラウザで確認
# http://localhost:50021/docs
```

## コーディング規約

- **TypeScript**: strict mode
- **インデント**: 4スペース
- **命名規則**:
  - ファイル: snake_case
  - クラス: PascalCase
  - 関数/変数: camelCase
  - 定数: UPPER_SNAKE_CASE

## コミットメッセージ

```
<type>: <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: フォーマット
- `refactor`: リファクタリング
- `test`: テスト
- `chore`: その他

## リリースプロセス

1. バージョン更新
   ```bash
   # package.jsonのversionを更新
   ```

2. CHANGELOG更新
   ```bash
   # docs/CHANGELOG.mdに変更内容を記載
   ```

3. ビルド
   ```bash
   pnpm build
   pnpm build:web
   ```

4. タグ作成
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## Cloudflare Containersデプロイ

### 前提条件

- Cloudflareアカウント
- Wrangler CLI (`pnpm install -g wrangler`)
- Docker (ローカルテスト用)

### セットアップ

#### 1. R2 API トークンの作成

1. Cloudflareダッシュボード → R2 → Manage R2 API Tokens
2. Create API Token
3. Permissions: Admin Read & Write
4. 以下の情報を取得：
   - Access Key ID
   - Secret Access Key
   - Account ID (URLまたは `wrangler whoami` で確認)

#### 2. Secretsの設定

```bash
cd workers/container
pnpm wrangler secret put R2_ACCOUNT_ID --env production
pnpm wrangler secret put R2_ACCESS_KEY_ID --env production
pnpm wrangler secret put R2_SECRET_ACCESS_KEY --env production
```

#### 3. デプロイ

```bash
# ルートディレクトリから
pnpm deploy:container
```

このコマンドは以下を実行します：
1. `src/` ディレクトリを `workers/container/src/` にコピー
2. Dockerイメージをビルド
3. Cloudflare Containersにデプロイ

### ローカルテスト

```bash
# ファイル準備
powershell -Command "Copy-Item -Path src -Destination workers/container/src -Recurse -Force"

# Dockerビルド
cd workers/container
wsl docker build -t test-video-worker .

# 実行
wsl docker run --rm -e PORT=8080 -p 8080:8080 test-video-worker
```

### 設定

#### インスタンスタイプ

`workers/container/wrangler.jsonc` で設定：

```jsonc
{
  "containers": [{
    "instance_type": "standard-1"  // 4 GiB
  }]
}
```

利用可能なタイプ：
- `lite`: 256 MiB
- `basic`: 1 GiB
- `standard-1`: 4 GiB (推奨)
- `standard-2`: 6 GiB
- `standard-3`: 8 GiB
- `standard-4`: 12 GiB

Puppeteerを使う場合は `standard-1` 以上を推奨。

#### 環境変数

コンテナに渡す環境変数は `index.ts` のコンストラクタで設定：

```typescript
constructor(state: any, env: any) {
  super(state, env);
  this.envVars = {
    CONTAINER_API_URL: env.CONTAINER_API_URL,
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    // ...
  };
}
```

### トラブルシューティング

#### メモリ不足エラー

**症状**: `FATAL ERROR: Reached heap limit Allocation failed`

**対処法**:
1. `wrangler.jsonc` で `instance_type` を上げる
2. `Dockerfile` で Node.js のヒープサイズを増やす：
   ```dockerfile
   CMD ["node", "--max-old-space-size=2048", "dist/video-worker.js"]
   ```

#### コンテナが起動しない

**症状**: ログに `GET /keepalive` は出るが、コンテナログが出ない

**確認事項**:
1. HTTPサーバーが起動しているか（`video-worker.ts`）
2. `Container` クラスを正しく継承しているか（`@cloudflare/containers`）
3. `defaultPort` が設定されているか

#### 環境変数が渡らない

**症状**: `process.env.XXX` が `undefined`

**確認事項**:
1. Secretsが設定されているか：
   ```bash
   pnpm wrangler secret list --env production
   ```
2. `index.ts` のコンストラクタで `envVars` に設定しているか
3. 再デプロイしたか

### `ContainerManager` の `405 Method Not Allowed` エラー

**症状**:
`npx wrangler tail` のログで `Container start response: 405 Method Not Allowed` が出力され、コンテナが起動しない。

**原因**:
`apps/workers/utils/container-manager.ts` 内の `startContainer` メソッドが、`CONTAINER_API_URL` で設定されたURL（通常はメインAPIのURL）に対して `POST` リクエストを送信していました。しかし、`video-worker` はこの `POST` リクエストに対応するエンドポイントを持っておらず、またメインAPIも `action: 'start'` のペイロードを持つルートハンドラを持っていませんでした。`video-worker` はジョブキューをポーリングするため、明示的な「起動」API呼び出しは不要でした。

**対処法**:
`apps/workers/utils/container-manager.ts` から、`startContainer` メソッド内の外部APIへの `fetch` 呼び出しを削除しました。これにより、`ContainerManager` はプラットフォーム（Cloudflare Containers）または `video-worker` 自身のポーリングメカニズムにコンテナのライフサイクル管理を依存するようになります。

**症状**: `MODULE_NOT_FOUND: @src/...`

**対処法**:
`package.json` に `tsc-alias` を追加：
```json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  },
  "devDependencies": {
    "tsc-alias": "^1.8.8"
  }
}
```

#### Cannot find module '@cloudflare/containers'

**症状**: `index.ts` でモジュールが見つからないエラーが出る

**対処法**:
`tsconfig.json` の `include` 配列に `index.ts` が含まれているか確認してください：
```json
{
  "include": [
    "video-worker.ts",
    "index.ts",
    "src/**/*"
  ]
}
```

### ログ確認

```bash
# Cloudflareダッシュボード
# Workers & Pages → presentation-maker-worker-production → Logs

# または wrangler CLI
cd workers/container
pnpm wrangler tail --env production
```

### デプロイフロー

```
1. ソースコード変更
   ↓
2. pnpm deploy:container
   ↓
3. copy-files.js 実行 (src/ をコピー)
   ↓
4. Dockerイメージビルド
   ↓
5. Cloudflareにプッシュ
   ↓
6. Durable Object + Container デプロイ
   ↓
7. Cron Trigger が1分ごとに起動
```

## 参考リンク

- [Cloudflare Containers Documentation](https://developers.cloudflare.com/workers/runtime-apis/containers/)
- [Cloudflare Containers GitHub](https://github.com/cloudflare/containers)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Hono Documentation](https://hono.dev/)
- [Vue.js Documentation](https://vuejs.org/)
- [Bull Documentation](https://github.com/OptimalBits/bull)
- [VOICEVOX API](http://localhost:50021/docs)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
