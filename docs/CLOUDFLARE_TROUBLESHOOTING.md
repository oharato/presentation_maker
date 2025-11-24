# Cloudflare デプロイ トラブルシューティング

このドキュメントは、Cloudflare Workers/Containers環境でのデプロイ時に発生した問題と解決策をまとめたものです。

## 目次

1. [R2アップロード問題](#r2アップロード問題)
2. [コンテナからのAPI接続問題](#コンテナからのapi接続問題)
3. [VOICEVOX接続エラー](#voicevox接続エラー)
4. [Dockerビルドエラー](#dockerビルドエラー)
5. [認証エラー](#認証エラー)

---

## R2アップロード問題

### 症状
- R2バケットにファイルがアップロードされない
- `object_count: 0` の状態が続く
- コンテナが「Markdown file not found in R2」エラーで失敗

### 原因
1. **API経由とジョブデータ経由の2つのフロー**
   - `/api/upload-folder`: ファイルをR2にアップロード
   - `/api/generate`: ジョブデータに直接スライド内容を含める（R2を経由しない）

2. **コンテナ側がR2からのダウンロードのみを想定**
   - ジョブデータに含まれるコンテンツを利用する処理が不足

### 解決策

#### 1. コンテナ側の修正（`workers/container/video-worker.ts`）

```typescript
// ジョブデータにコンテンツが含まれている場合は優先使用
if (slide.markdown) {
    await fs.writeFile(markdownPath, slide.markdown);
    console.log(`Wrote markdown for slide ${slideId} from job data`);
} else {
    try {
        await downloadFileFromR2(jobId, markdownFileName, markdownPath);
    } catch (e) {
        console.warn(`Markdown file for slide ${slideId} not found in R2. Skipping.`, e);
    }
}
```

#### 2. API Worker側のログ追加（`workers/src/routes/api.ts`）

```typescript
console.log(`Uploading file to R2: ${key}, size: ${file.size}`);
try {
    await c.env.PRESENTATION_MAKER_BUCKET.put(key, file.stream());
    console.log(`Successfully uploaded: ${key}`);
} catch (uploadError) {
    console.error(`Failed to upload ${key}:`, uploadError);
    throw uploadError;
}
```

---

## コンテナからのAPI接続問題

### 症状
- コンテナがジョブを取得できない
- `Idle timeout reached. Shutting down container...`
- ログに `Received job:` が出力されない

### 原因
1. **レート制限によるブロック（429 Too Many Requests）**
   - API Workerの `rateLimit` ミドルウェアがコンテナからのリクエストもブロック
   - IPアドレスベースのカウントで、頻繁なポーリングが制限に達する

2. **WAF/ボット対策によるブロック**
   - User-Agentヘッダーが不足
   - Cloudflareのセキュリティ機能が疑わしいリクエストとして判定

### 解決策

#### 1. internalエンドポイントをレート制限から除外（`workers/src/index.ts`）

```typescript
// レート制限
app.use('/api/*', async (c, next) => {
    // internalエンドポイントはスキップ
    if (c.req.path.includes('/internal/')) {
        return await next();
    }
    return rateLimit(c, next);
});
```

#### 2. User-Agentヘッダーの追加（`workers/container/video-worker.ts`）

```typescript
const response = await fetch(`${API_URL}/api/internal/queue/next`, {
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'User-Agent': 'VideoWorker/1.0',
    },
});
```

#### 3. 詳細ログの追加（`workers/src/routes/api.ts`）

```typescript
api.get('/internal/queue/next', async (c) => {
    console.log(`[Internal] GET /queue/next called from ${c.req.header('User-Agent')}`);
    // ...
    if (!job) {
        console.log('[Internal] No job available (204)');
        return c.body(null, 204);
    }
    console.log(`[Internal] Job dispatched: ${job.jobId}`);
    return c.json(job);
});
```

---

## VOICEVOX接続エラー

### 症状
```
Error: getaddrinfo ENOTFOUND voicevox
hostname: 'voicevox'
code: 'ENOTFOUND'
```

または

```
python3: No module named voicevox_engine
/usr/bin/python3: No module named voicevox_engine
```

### 原因
1. Cloudflare Containers環境には別のVOICEVOXコンテナが存在しない
2. Docker Composeのようなネットワーク共有機能がない
3. VOICEVOXイメージをベースにすると、Node.js環境との競合が発生

### 解決策（推奨）

**外部VOICEVOXサービスを利用する**

Cloudflare Containers内で2つのサービス（VOICEVOX + Node.js Worker）を同居させるのは技術的に困難です。
以下のいずれかの方法で外部VOICEVOXサービスを利用することを推奨します：

#### オプション1: 別のサーバーでVOICEVOXをホスト

```bash
# 別のサーバー（VPS等）でVOICEVOX Dockerコンテナを起動
docker run -d -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu24.04-latest
```

`wrangler.jsonc` で外部URLを指定：

```jsonc
"vars": {
    "VOICEVOX_URL": "https://your-voicevox-server.example.com:50021"
}
```

#### オプション2: Cloudflare Tunnelを使用

ローカルのVOICEVOXサービスをCloudflare Tunnel経由で公開：

```bash
# ローカルでVOICEVOXを起動
docker run -d -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu24.04-latest

# Cloudflare Tunnelで公開
cloudflared tunnel --url http://localhost:50021
```

#### オプション3: 音声合成をスキップ

開発・テスト目的であれば、音声合成をスキップして無音動画のみ生成することも可能です。

`workers/container/video-worker.ts` で音声生成部分をスキップ：

```typescript
// 音声生成をスキップ
if (await fs.pathExists(scriptPath) && VOICEVOX_URL) {
    try {
        const scriptContent = await fs.readFile(scriptPath, 'utf8');
        await voicevoxService.generateAudio(scriptContent, audioPath);
        slideDuration = await videoGenerator.getAudioDuration(audioPath);
    } catch (e) {
        console.warn(`VOICEVOX unavailable, using default duration`);
        slideDuration = 5; // デフォルト5秒
    }
}
```

**1. Dockerfileの変更**

```dockerfile
# VOICEVOXエンジンをベースにする
FROM voicevox/voicevox_engine:cpu-ubuntu24.04-latest

# rootユーザーで実行
USER root

# 必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    wget \
    xdg-utils \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24のインストール
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

# pnpmのインストール
RUN npm install -g pnpm

# アプリケーションのセットアップ
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

# Puppeteerの設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Chromeのインストール
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# エントリーポイントスクリプト
COPY entrypoint.sh /entrypoint.sh
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

# VOICEVOXのポート
EXPOSE 50021
# Workerのポート
EXPOSE 80

# Node.jsのヒープサイズ制限を緩和
ENV NODE_OPTIONS="--max-old-space-size=2048"

ENTRYPOINT ["/entrypoint.sh"]
```

**2. エントリーポイントスクリプト（`entrypoint.sh`）**

```bash
#!/bin/bash
set -e

echo "Starting VOICEVOX Engine..."
# VOICEVOXエンジンをバックグラウンドで起動
# 公式イメージではPythonモジュールとして実行
cd /
python3 -m voicevox_engine --use_gpu=False --host 0.0.0.0 --port 50021 &

# VOICEVOXの起動待機
echo "Waiting for VOICEVOX to start..."
timeout 30 bash -c 'until curl -s http://127.0.0.1:50021/version > /dev/null; do sleep 1; done'
echo "VOICEVOX started!"

# アプリケーションディレクトリに戻る
cd /app

# Video Workerを起動
echo "Starting Video Worker..."
npm start
```

**注意:** VOICEVOXの公式Dockerイメージでは、`run.py` ではなく `python3 -m voicevox_engine` として実行する必要があります。

**3. VOICEVOX URLの変更（`workers/container/video-worker.ts`）**

```typescript
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
```

---

## Dockerビルドエラー

### 症状
```
E: Package 'libasound2' has no installation candidate
```

### 原因
- Ubuntu 24.04でパッケージ名が変更された（2038年問題対応）
- 個別のライブラリを指定すると、バージョン間の互換性問題が発生

### 解決策

#### 必要最小限のパッケージのみインストール

Puppeteer（Chrome）の依存関係は、`google-chrome-stable` のインストール時に自動解決されるため、個別のライブラリ指定は不要。

```dockerfile
# 必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    wget \
    xdg-utils \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*
```

---

## 認証エラー

### 症状
```
✘ [ERROR] Unauthorized
```

### 原因
- Wranglerの認証トークンが期限切れ
- 別のCloudflareアカウントでログインしている

### 解決策

#### 1. 再ログイン

```bash
npx wrangler login
```

#### 2. 現在のログイン状態確認

```bash
npx wrangler whoami
```

#### 3. ログアウトして再ログイン

```bash
npx wrangler logout
npx wrangler login
```

---

## デプロイ手順

### 1. API Workerのデプロイ

```bash
cd workers
pnpm run deploy
```

### 2. コンテナのデプロイ

```bash
cd workers/container
pnpm deploy:container
```

**注意事項:**
- VOICEVOXエンジンを含むため、ビルドに5-10分かかる
- イメージサイズが大きい（数GB）
- 初回デプロイ時は特に時間がかかる

### 3. ログ確認

```bash
# API Workerのログ
npx wrangler tail --config workers/wrangler.toml --env production

# コンテナのログ
# Cloudflareダッシュボードから確認
```

---

## トラブルシューティングチェックリスト

### デプロイ前
- [ ] `wrangler whoami` で正しいアカウントにログインしているか確認
- [ ] `wrangler.toml` / `wrangler.jsonc` の設定が正しいか確認
- [ ] R2バケット、KV、Durable Objectsが作成されているか確認

### デプロイ中
- [ ] ビルドエラーが出ていないか確認
- [ ] 認証エラーが出た場合は `wrangler login` を実行
- [ ] タイムアウトエラーが出た場合は再試行

### デプロイ後
- [ ] `wrangler tail` でログを確認
- [ ] コンテナが起動しているか確認（Cloudflareダッシュボード）
- [ ] ジョブが正しくキューに追加されているか確認
- [ ] R2にファイルがアップロードされているか確認

---

## よくある質問

### Q: コンテナが起動しない
A: 以下を確認してください：
1. Dockerfileのビルドが成功しているか
2. `entrypoint.sh` の改行コードがLFになっているか（CRLFだとエラー）
3. 環境変数が正しく設定されているか

### Q: ジョブが処理されない
A: 以下を確認してください：
1. コンテナがAPIにアクセスできているか（ログで確認）
2. レート制限に引っかかっていないか（429エラー）
3. Durable Objectにジョブが登録されているか

### Q: 動画生成が失敗する
A: 以下を確認してください：
1. VOICEVOXが起動しているか（コンテナログで確認）
2. Puppeteerが正しく動作しているか
3. FFmpegがインストールされているか
4. R2へのアップロード権限があるか

---

## 参考リンク

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers Documentation](https://developers.cloudflare.com/containers/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [VOICEVOX Engine](https://github.com/VOICEVOX/voicevox_engine)
