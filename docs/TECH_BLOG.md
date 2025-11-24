# Cloudflare Containersで動画生成ワーカーをデプロイするまでの道のり

## はじめに

プレゼンテーション動画を自動生成するアプリケーションを開発する中で、動画生成処理をCloudflare Containersにデプロイしました。この記事では、デプロイまでに遭遇した課題と解決方法を記録します。

## アーキテクチャ

### システム構成

- **フロントエンド**: Cloudflare Pages（Vue.js）
- **APIサーバー**: Cloudflare Workers（Hono）
- **動画生成ワーカー**: Cloudflare Containers（Docker + Node.js）
- **ストレージ**: Cloudflare R2
- **ジョブ管理**: Durable Objects

### 動画生成フロー

1. ユーザーがスライドデータを入力
2. APIサーバーがジョブをキューに追加
3. コンテナワーカーがジョブをポーリング
4. Markdownをスライド画像に変換（Puppeteer）
5. 音声を生成（VOICEVOX）
6. 画像と音声を動画に結合（FFmpeg）
7. R2にアップロード

## 遭遇した課題と解決方法

### 1. TypeScriptのパスエイリアス解決エラー

**問題**: コンテナ実行時に `MODULE_NOT_FOUND: @src/services/video_generator` エラー

**原因**: TypeScriptの `paths` 設定（`@src/*`）がコンパイル後のJSファイルで解決されない

**解決策**:
```json
// package.json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  },
  "devDependencies": {
    "tsc-alias": "^1.8.8"
  }
}
```

`tsc-alias` を使ってビルド時にパスエイリアスを相対パスに変換。

### 2. コンテナが起動しない問題

**問題**: Durable Objectへのリクエストは成功するが、コンテナ内のアプリケーションが起動しない

**原因**: 
- `Container` クラスのインポート元が間違っていた（`cloudflare:workers` ではなく `@cloudflare/containers`）
- コンテナがHTTPサーバーとして動作していなかった

**解決策**:
```typescript
// index.ts
import { Container } from '@cloudflare/containers';

export class VideoWorkerV2 extends Container {
  defaultPort = 80;
  // ...
}
```

```typescript
// video-worker.ts
import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Video Worker is running');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

Cloudflare Containersは、HTTPサーバーとして動作するコンテナを期待しているため、ダミーサーバーを起動。

### 3. 環境変数がコンテナに渡らない

**問題**: `CONTAINER_API_URL` などの環境変数が `undefined`

**原因**: 静的な `envVars` プロパティでは、Workerの環境変数（Secrets含む）にアクセスできない

**解決策**:
```typescript
export class VideoWorkerV2 extends Container {
  constructor(state: any, env: any) {
    super(state, env);
    this.envVars = {
      CONTAINER_API_URL: env.CONTAINER_API_URL,
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      // ...
    };
  }
}
```

コンストラクタで動的に `envVars` を設定し、Cloudflare Secretsから取得した値をコンテナに渡す。

### 4. ジョブデータ構造の不一致

**問題**: `Cannot read properties of undefined (reading 'length')`

**原因**: APIから返されるジョブデータが `{ jobId, data: { slides } }` という構造だが、コードは `{ jobId, slides }` を期待していた

**解決策**:
```typescript
const jobData = job as { jobId: string; data: { slides: any[] } };
const slides = jobData.data?.slides;

if (!slides || !Array.isArray(slides)) {
  throw new Error(`Invalid job data`);
}
```

データ構造を修正し、バリデーションを追加。

### 5. メモリ不足エラー

**問題**: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

**原因**: Puppeteer（Chromium）が大量のメモリを消費

**解決策**:

#### 方法1: Node.jsのヒープサイズを増やす
```dockerfile
CMD ["node", "--max-old-space-size=2048", "dist/video-worker.js"]
```

#### 方法2: Cloudflare Containersのインスタンスタイプを変更
```jsonc
// wrangler.jsonc
{
  "containers": [{
    "name": "video-worker",
    "image": "./Dockerfile",
    "class_name": "VideoWorkerV2",
    "instance_type": "standard-1"  // 4 GiB
  }]
}
```

**利用可能なインスタンスタイプ**:
- `lite`: 256 MiB
- `basic`: 1 GiB
- `standard-1`: 4 GiB
- `standard-2`: 6 GiB
- `standard-3`: 8 GiB
- `standard-4`: 12 GiB

Puppeteerを使う場合は `standard-1` 以上を推奨。

### 6. R2認証情報の管理

**問題**: R2アクセスキーをどう管理するか

**解決策**: Cloudflare Secretsを使用
```bash
pnpm wrangler secret put R2_ACCOUNT_ID --env production
pnpm wrangler secret put R2_ACCESS_KEY_ID --env production
pnpm wrangler secret put R2_SECRET_ACCESS_KEY --env production
```

Secretsは環境変数として `env` オブジェクトに渡され、コンストラクタで `envVars` に設定してコンテナに渡す。

### 7. Cron Triggerでコンテナを維持

**問題**: コンテナがリクエストがないと起動しない

**解決策**:
```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": ["* * * * *"]  // 1分ごと
  }
}
```

```typescript
// index.ts
export default {
  async scheduled(event: any, env: any, ctx: any) {
    const container = env.VIDEO_WORKER.getByName("worker-instance");
    await container.fetch("http://internal/keepalive");
  }
};
```

1分ごとにCronでコンテナにリクエストを送り、起動を維持。

## ベストプラクティス

### 1. ビルドコンテキストの管理

Dockerfileのビルドコンテキストは `workers/container` ディレクトリだが、ソースコードは `src/` にある。
デプロイ前にファイルをコピーするスクリプトを作成：

```javascript
// workers/container/copy-files.js
const fs = require('fs-extra');
const path = require('path');

const srcDir = path.join(__dirname, '../../src');
const destDir = path.join(__dirname, 'src');

fs.copySync(srcDir, destDir);
console.log('Files copied successfully');
```

```json
// package.json
{
  "scripts": {
    "deploy:container": "node workers/container/copy-files.js && cd workers/container && wrangler deploy --env production"
  }
}
```

### 2. ログの活用

コンテナのログは Cloudflare ダッシュボードで確認できる。
デバッグ時は詳細なログを出力：

```typescript
console.log('Received job:', JSON.stringify(job, null, 2));
```

### 3. エラーハンドリング

ジョブ処理は try-catch で囲み、エラー時はステータスを更新：

```typescript
try {
  // ジョブ処理
  await updateJobStatus(jobId, 'completed', { videoUrl });
} catch (error) {
  console.error(`Job failed: ${jobId}`, error);
  await updateJobStatus(jobId, 'failed', { message: error.message });
}
```

## まとめ

Cloudflare Containersは強力ですが、以下の点に注意が必要です：

1. **メモリ管理**: Puppeteerなど重い処理を行う場合は `instance_type` を適切に設定
2. **環境変数**: コンストラクタで動的に設定する必要がある
3. **HTTPサーバー**: コンテナはHTTPサーバーとして動作する必要がある
4. **ビルドコンテキスト**: Dockerfileのビルドコンテキストとソースコードの配置に注意
5. **Secrets管理**: 機密情報は Cloudflare Secrets で管理

これらの課題を乗り越えることで、サーバーレスで動画生成処理を実行できるようになりました。

## 参考資料

- [Cloudflare Containers Documentation](https://developers.cloudflare.com/workers/runtime-apis/containers/)
- [Cloudflare Containers GitHub](https://github.com/cloudflare/containers)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
