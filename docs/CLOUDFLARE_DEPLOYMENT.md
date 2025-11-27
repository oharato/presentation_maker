# Cloudflare デプロイ設計

## 概要

command = "cd web && pnpm build"
cwd = "."
watch_dirs = ["web/src"]

[build.upload]
format = "directory"
dir = "web/dist"
```

**環境変数**:
- `VITE_API_URL`: `/api` (同一ドメインのため相対パス)
- `VITE_WS_URL`: `wss://presentation-maker.your-domain.com/api/ws`

---

### 2. API Gateway: Cloudflare Workers

**役割**: REST API、WebSocket プロキシ、認証

**URL構成**:
- Frontend: `https://presentation-maker.your-domain.com`
- API: `https://presentation-maker.your-domain.com/api/*` (Workers Routesでルーティング)

**技術スタック**:
- Hono (現行のまま、Workers対応)
- Cloudflare Workers
- Durable Objects (WebSocket管理)

**主要エンドポイント**:
- `POST /api/upload-folder` - ファイルアップロード → R2保存
- `POST /api/generate` - 動画生成ジョブ作成
- `GET /api/jobs/:id` - ジョブステータス取得
- `GET /api/videos/:id` - 動画URL取得 (R2署名付きURL)
-- `WS /api/ws` - WebSocket接続 (Durable Objects経由)

**デプロイ方法**:
```bash
# Workers用にビルド
pnpm build:workers

# デプロイ
wrangler deploy
```

**設定ファイル**: `wrangler.toml` (Workers用)
```toml
name = "presentation-maker-api"
main = "dist/workers/index.js"
compatibility_date = "2024-01-01"

[env.production]
vars = { ENVIRONMENT = "production" }

[[r2_buckets]]
binding = "PRESENTATION_MAKER_BUCKET"
bucket_name = "presentation-videos"

[[durable_objects.bindings]]
name = "PRESENTATION_MAKER_JOB_MANAGER"
class_name = "JobManager"

[[kv_namespaces]]
binding = "PRESENTATION_MAKER_CACHE"
id = "your-kv-namespace-id"

[observability]
enabled = true
```

**制約事項**:
- CPU時間: 最大30秒 (無料プラン) / 15分 (有料プラン)
- メモリ: 128MB
- リクエストサイズ: 100MB

---

### 3. ジョブ管理: Durable Objects

**役割**: WebSocket接続管理、ジョブステータス管理

**実装**:
```typescript
// workers/durable-objects/JobManager.ts
export class JobManager {
  state: DurableObjectState;
  sessions: Map<string, WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request) {
    // WebSocket接続処理
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // ジョブステータス更新
    const url = new URL(request.url);
    if (url.pathname.startsWith("/jobs/")) {
      return this.handleJobStatus(request);
    }

    return new Response("Not found", { status: 404 });
  }

  async handleSession(websocket: WebSocket) {
    websocket.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, websocket);

    websocket.addEventListener("message", async (msg) => {
      const data = JSON.parse(msg.data);
      // ジョブ進捗の配信
      await this.broadcastProgress(data);
    });

    websocket.addEventListener("close", () => {
      this.sessions.delete(sessionId);
    });
  }

  async broadcastProgress(data: any) {
    for (const ws of this.sessions.values()) {
      ws.send(JSON.stringify(data));
    }
  }
}
```

---

### 4. ストレージ: Cloudflare R2

**役割**: 動画ファイル、音声ファイル、画像ファイルの保存

**バケット構成**:
```
presentation-videos/
├── jobs/
│   ├── {jobId}/
│   │   ├── slides/
│   │   │   ├── 010__title.png
│   │   │   └── 020__intro.png
│   │   ├── audio/
│   │   │   ├── 010__title.wav
│   │   │   └── 020__intro.wav
│   │   ├── videos/
│   │   │   ├── 010__title.mp4
│   │   │   └── 020__intro.mp4
│   │   └── final_presentation.mp4
└── cache/
    └── silence/
        └── silence_1.5s.wav
```

**アクセス方法**:
```typescript
// Workers内でR2にアクセス
const object = await env.PRESENTATION_MAKER_BUCKET.get(`jobs/${jobId}/final_presentation.mp4`);

// R2は署名付きURLをネイティブサポートしていないため、Workers経由でプロキシ
const proxyUrl = `/api/videos/${jobId}/download`;
```

**料金**:
- ストレージ: $0.015/GB/月

  async getJob() {
    const job = await redis.rpop('jobs:pending');
    return job ? JSON.parse(job) : null;
  }

  async updateJobStatus(jobId: string, status: string) {
    await redis.hset(`job:${jobId}`, { status, updatedAt: Date.now() });
  }
}
```

**料金**:
- 無料枠: 10,000コマンド/日
- 有料プラン: $0.2/100,000コマンド

---

### 6. 動画処理ワーカー: Cloudflare Container (オンデマンド起動)

**役割**: 動画生成の重い処理を実行。必要な時だけ起動し、アイドル時に停止する。

**動作モデル**: Scale to Zero (0台 ⇔ N台)

**技術スタック**:
- Node.js 20
- FFmpeg
- Puppeteer
- 自動停止ロジック

**ライフサイクル**:
1. **起動**: Workers APIがジョブ受信時に、コンテナ起動API（Fly.io Machines API / Google Cloud Run / AWS Fargate 等）をコール
2. **処理**: コンテナが起動し、Workers API (`/internal/queue/next`) をポーリングしてジョブを取得・処理
3. **停止**: キューが空になり、指定時間（例: 5分）経過後、プロセスが終了しコンテナが停止

**ワーカー実装 (自動停止付き)**:
```typescript
// workers/container/video-worker.ts
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5分
let lastActivityTime = Date.now();

async function processJobs() {
  while (true) {
    const job = await getJobFromApi(); // API経由で取得
    
    if (job) {
      lastActivityTime = Date.now();
      await processJob(job);
    } else {
      // アイドルチェック
      if (Date.now() - lastActivityTime > IDLE_TIMEOUT) {
        console.log('Idle timeout. Shutting down...');
        process.exit(0); // コンテナ停止
      }
      
      // 待機
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

**コンテナ制御**:
Workersからコンテナを起動するために、`ContainerManager` を実装します。

```typescript
// workers/utils/container-manager.ts
export class ContainerManager {
  async startContainer() {
    // 外部コンテナサービスの起動APIを叩く
    // 例: Fly.io Machines API, Google Cloud Run API
    await fetch(env.CONTAINER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CONTAINER_API_TOKEN}` },
      body: JSON.stringify({ action: 'start' })
    });
  }
}
```

---

### 7. VOICEVOX: Cloudflare Container

**役割**: 音声合成サービス

**Dockerfile**:
```dockerfile
# workers/container/voicevox/Dockerfile
FROM voicevox/voicevox_engine:cpu-ubuntu20.04-latest

# ポート公開
EXPOSE 50021

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:50021/version || exit 1

CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "50021"]
```

**デプロイ方法**:
```bash
# コンテナビルド
docker build -t presentation-maker-voicevox -f workers/container/voicevox/Dockerfile .

# プッシュ
docker tag presentation-maker-voicevox registry.cloudflare.com/your-account/presentation-maker-voicevox
docker push registry.cloudflare.com/your-account/presentation-maker-voicevox
```

**Workers からのアクセス**:
```typescript
// Workers内でVOICEVOXコンテナにアクセス
const response = await fetch(`${env.VOICEVOX_URL}/audio_query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, speaker: 1 }),
});
```

---

### 8. キャッシュ: Workers KV

**役割**: 無音音声、APIレスポンスのキャッシュ

**使用例**:
```typescript
// 無音音声のキャッシュ
const cacheKey = `silence_${duration}s`;
let silenceAudio = await env.PRESENTATION_MAKER_CACHE.get(cacheKey, 'arrayBuffer');

if (!silenceAudio) {
  silenceAudio = await generateSilence(duration);
  await env.PRESENTATION_MAKER_CACHE.put(cacheKey, silenceAudio, {
    expirationTtl: 86400 * 30, // 30日間
  });
}
```

**料金**:
- 無料枠: 100,000読み込み/日、1,000書き込み/日、1GB
- 有料: $0.50/百万読み込み、$5.00/百万書き込み

---

## デプロイフロー

### 開発環境

```bash
# ローカル開発
pnpm dev

# Wranglerでローカルテスト
wrangler dev
```

### ステージング環境

```bash
# Workers デプロイ (ステージング)
wrangler deploy --env staging

# Pages デプロイ (ステージング)
wrangler pages deploy web/dist --project-name presentation-maker-staging

# コンテナデプロイ (ステージング)
docker-compose -f docker-compose.cloudflare.yml up -d
```

### 本番環境

```bash
# 1. フロントエンドビルド
cd web && pnpm build

# 2. Workersビルド
pnpm build:workers

# 3. Pagesデプロイ
wrangler pages deploy web/dist

# 4. Workersデプロイ
wrangler deploy --env production

# 5. コンテナデプロイ
docker-compose -f docker-compose.cloudflare.yml up -d
```

---

## 環境変数

### Cloudflare Workers

```toml
# wrangler.toml
[env.production.vars]
ENVIRONMENT = "production"
VOICEVOX_URL = "https://voicevox.your-domain.com"
UPSTASH_REDIS_REST_URL = "https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN = "your-token"
```

### Cloudflare Pages

```bash
# Pages環境変数 (Cloudflare Dashboard)
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com/api/ws/connect/global
```

---

## コスト見積もり

### 月間1,000ジョブ想定

| サービス | 使用量 | 料金 |
|---------|--------|------|
| Cloudflare Pages | 無制限リクエスト | $0 (無料) |
| Cloudflare Workers | 100万リクエスト | $0 (無料枠内) |
| Cloudflare R2 | 50GB保存、10万書き込み | $0.75 + $0.45 = $1.20 |
| Durable Objects | 100万リクエスト | $0.15 |
| Workers KV | 10万読み込み | $0 (無料枠内) |
| Upstash Redis | 30万コマンド | $0.60 |
| Cloudflare Container | 2インスタンス × 730時間 | $20 (概算) |
| **合計** | | **約$22/月** |

### スケールアップ時 (月間10,000ジョブ)

| サービス | 使用量 | 料金 |
|---------|--------|------|
| Cloudflare Workers | 1000万リクエスト | $5 |
| Cloudflare R2 | 500GB保存、100万書き込み | $7.50 + $4.50 = $12 |
| Durable Objects | 1000万リクエスト | $1.50 |
| Upstash Redis | 300万コマンド | $6 |
| Cloudflare Container | 5インスタンス × 730時間 | $50 (概算) |
| **合計** | | **約$75/月** |

---

## セキュリティ

### 認証・認可

```typescript
// workers/middleware/auth.ts
export async function authenticate(c: Context) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // JWTトークン検証
  const payload = await verifyJWT(token, env.JWT_SECRET);
  c.set('userId', payload.sub);
}
```

### CORS設定

```typescript
// workers/middleware/cors.ts
export function cors() {
  return async (c: Context, next: Next) => {
    c.header('Access-Control-Allow-Origin', env.ALLOWED_ORIGINS);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }
    
    await next();
  };
}
```

### レート制限

```typescript
// workers/middleware/rate-limit.ts
export async function rateLimit(c: Context) {
  const ip = c.req.header('CF-Connecting-IP');
  const key = `rate_limit:${ip}`;
  
  const count = await env.PRESENTATION_MAKER_CACHE.get(key);
  if (count && parseInt(count) > 100) {
    return c.json({ error: 'Too many requests' }, 429);
  }
  
  await env.PRESENTATION_MAKER_CACHE.put(key, (parseInt(count || '0') + 1).toString(), {
    expirationTtl: 60,
  });
}
```

---

## モニタリング

### Cloudflare Analytics

- リクエスト数
- エラー率
- レスポンスタイム
- 帯域幅使用量

### カスタムログ

```typescript
// workers/utils/logger.ts
export function log(level: string, message: string, data?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  
  console.log(JSON.stringify(logEntry));
  
  // Cloudflare Logsに送信
  // または外部ログサービス (Datadog, Sentryなど)
}
```

---

## 移行計画

### フェーズ1: 準備 (1週間)

- [ ] Cloudflareアカウント作成
- [ ] Upstash Redisセットアップ
- [ ] R2バケット作成
- [ ] Workers KV作成
- [ ] Durable Objects有効化

### フェーズ2: Workers実装 (2週間)

- [ ] Hono → Workers移植
- [ ] Durable Objects実装
- [ ] R2統合
- [ ] Upstash Redis統合
- [ ] テスト

### フェーズ3: コンテナ化 (1週間)

- [ ] Video Worker Dockerfile作成
- [ ] VOICEVOX Dockerfile作成
- [ ] ローカルテスト
- [ ] Cloudflare Container Registry登録

### フェーズ4: フロントエンド移行 (1週間)

- [ ] Vite設定調整
- [ ] API URL更新
- [ ] Cloudflare Pages設定
- [ ] デプロイテスト

### フェーズ5: 本番移行 (1週間)

- [ ] ステージング環境テスト
- [ ] パフォーマンステスト
- [ ] 本番デプロイ
- [ ] モニタリング設定
- [ ] ドキュメント更新

---

## トラブルシューティング

### Workers タイムアウト

**問題**: 動画生成が30秒を超える

**解決策**:
- Container Workerに処理を移行
- ジョブを細かく分割
- 非同期処理を活用

### R2 アップロード失敗

**問題**: 大きなファイルのアップロードが失敗

**解決策**:
- マルチパートアップロード使用
- リトライロジック実装
- タイムアウト設定調整

### WebSocket 切断

**問題**: Durable Objects WebSocket接続が切れる

**解決策**:
- ハートビート実装
- 自動再接続ロジック
- エラーハンドリング強化

---

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages ドキュメント](https://developers.cloudflare.com/pages/)
- [Cloudflare R2 ドキュメント](https://developers.cloudflare.com/r2/)
- [Durable Objects ドキュメント](https://developers.cloudflare.com/durable-objects/)
- [Upstash Redis ドキュメント](https://docs.upstash.com/redis)
- [Wrangler CLI ドキュメント](https://developers.cloudflare.com/workers/wrangler/)

---

## 次のステップ

1. **設計レビュー**: この設計書をレビューし、フィードバックをください
2. **技術検証**: 各コンポーネントのPoCを実施
3. **実装開始**: フェーズ1から順次実装
4. **テスト**: 各フェーズでテストを実施
5. **デプロイ**: ステージング → 本番の順にデプロイ
