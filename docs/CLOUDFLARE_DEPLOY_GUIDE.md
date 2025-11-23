# Cloudflare デプロイガイド

このガイドでは、プレゼンテーション動画制作アプリをCloudflareにデプロイする手順を説明します。

## 前提条件

### 必要なツール

- **Node.js** v18以上
- **pnpm** パッケージマネージャー
- **Wrangler CLI** (Cloudflare Workers CLI)
- **Docker** (コンテナビルド用)

### 本番環境

#### 一括デプロイ

```bash
pnpm deploy:all
```

これにより、以下が実行されます:
1. Workers ビルド
2. Workers デプロイ (本番)
3. Pages デプロイ (本番)

#### 個別デプロイ

```bash
# Workers のみ
pnpm deploy:workers:production

# Pages のみ
pnpm deploy:pages:production
```

## 環境変数設定

### Workers 環境変数

`wrangler.toml` で設定済み。

### Pages 環境変数

Cloudflare Dashboard https://dash.cloudflare.com/ で設定:

1. Pages プロジェクトを開く
2. Settings → Environment variables
3. 以下を追加:
   - `VITE_API_URL`: `/api` (同一ドメインなので相対パスでOK)
   - `VITE_WS_URL`: `wss://presentation-maker.your-domain.com/api/ws` (WebSocketはフルURL推奨)

## カスタムドメインとルーティング設定

フロントエンドとAPIを同じドメイン (`presentation-maker.your-domain.com`) で提供するための設定です。

### 1. Pages (フロントエンド)

Cloudflare Dashboard で Pages プロジェクトにカスタムドメインを設定します。

1. Cloudflare Dashboard → Pages
2. プロジェクトを選択
3. Custom domains
4. `presentation-maker.your-domain.com` を追加
   - これで `https://presentation-maker.your-domain.com` でフロントエンドが表示されます。

### 2. Workers (API)

Workers を同じドメインの `/api/*` パスで動作させます。

`wrangler.toml` に以下を追加（または書き換え）します:

```toml
[env.production]
# ... 他の設定 ...
routes = [
	{ pattern = "presentation-maker.your-domain.com/api/*", zone_name = "your-domain.com" }
]
```

または、Cloudflare Dashboard から設定する場合:
1. Workers & Pages → Workers プロジェクト
2. Settings → Triggers → Routes
3. Add route:
   - Route: `presentation-maker.your-domain.com/api/*`
   - Zone: `your-domain.com`

これにより、`/api/` で始まるリクエストだけが Workers に転送され、それ以外は Pages (フロントエンド) が表示されます。

## 動作確認

### ヘルスチェック

```bash
curl https://api.your-domain.com/health
```

期待される応答:
```json
{
  "status": "ok",
  "environment": "production",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### フロントエンドアクセス

ブラウザで `https://presentation-maker.your-domain.com` を開きます。

### WebSocket接続テスト

```javascript
const ws = new WebSocket('wss://api.your-domain.com/ws?jobId=test');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  console.log('Message:', event.data);
};
```

## トラブルシューティング

### Workers デプロイエラー

**エラー**: `Error: No such module "xxx"`

**解決策**:
```bash
# node_modulesを再インストール
rm -rf node_modules
pnpm install

# 再ビルド
pnpm build:workers
```

### R2 アクセスエラー

**エラー**: `Error: Access denied to R2 bucket`

**解決策**:
1. `wrangler.toml` でバケット名を確認
2. R2 バケットが存在するか確認:
   ```bash
   wrangler r2 bucket list
   ```

### Durable Objects エラー

**エラー**: `Error: Durable Object not found`

**解決策**:
1. Durable Objects が有効か確認 (有料プラン必要)
2. `wrangler.toml` の設定を確認
3. マイグレーションを実行:
   ```bash
   wrangler deploy --new-class JobManager
   ```

### Container 起動エラー

**エラー**: `Container failed to start`

**解決策**:
```bash
# ローカルでテスト
docker run -it presentation-maker-worker sh

# ログ確認
docker logs presentation_maker_video_worker
```

## モニタリング

### Cloudflare Analytics

1. Cloudflare Dashboard → Workers & Pages
2. プロジェクトを選択
3. Analytics タブ

以下が確認できます:
- リクエスト数
- エラー率
- レスポンスタイム
- CPU使用時間

### ログ確認

```bash
# Workers ログ
wrangler tail

# 特定の環境
wrangler tail --env production

# フィルタリング
wrangler tail --status error
```

### アラート設定

Cloudflare Dashboard → Notifications でアラートを設定:
- エラー率が閾値を超えた場合
- CPU使用時間が閾値を超えた場合
- R2 ストレージが閾値を超えた場合

## コスト最適化

### R2 ストレージ

古いジョブファイルを定期的に削除:

```typescript
// Workers Cron Triggers で実行
export default {
  async scheduled(event, env, ctx) {
    const queue = new JobQueue(env);
    await queue.cleanupOldJobs(7 * 24 * 60 * 60 * 1000); // 7日以上前
  }
}
```

`wrangler.toml` に追加:
```toml
[triggers]
crons = ["0 0 * * *"] # 毎日0時に実行
```

### Workers KV

キャッシュのTTLを適切に設定:
```typescript
await env.CACHE.put(key, value, {
  expirationTtl: 86400, // 24時間
});
```

### Container リソース

**オンデマンド起動 (Scale to Zero)**

ジョブがないときはコンテナを停止することで、コストを最小限に抑えます。

1. **起動**: Workers APIがジョブ受信時にコンテナ起動APIをコール
2. **停止**: コンテナ内のワーカーがアイドル状態（5分以上ジョブなし）を検知して自動終了

これにより、待機時間のコストがゼロになります。

必要最小限のリソースを割り当て:
```yaml
# docker-compose.cloudflare.yml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
```

## セキュリティ

### CORS 設定

本番環境では許可するオリジンを制限:

```typescript
// workers/src/index.ts
app.use('*', cors({
  origin: 'https://presentation-maker.your-domain.com',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

### レート制限

適切なレート制限を設定:

```typescript
// workers/middleware/rate-limit.ts
if (count >= 100) { // 100リクエスト/分
  return c.json({ error: 'Too many requests' }, 429);
}
```

### 認証

本番環境では認証を有効化:

```typescript
// workers/src/routes/api.ts
import { authenticate } from '../middleware/auth';

api.use('/generate', authenticate);
api.use('/upload-folder', authenticate);
```

## バックアップ

### R2 バックアップ

定期的にR2データをバックアップ:

```bash
# rclone を使用
rclone sync r2:presentation-videos /backup/r2
```

### Redis バックアップ

Upstash は自動バックアップを提供しています。
Dashboard で確認・復元が可能です。

## ロールバック

### Workers ロールバック

```bash
# 以前のバージョンにロールバック
wrangler rollback --message "Rollback to previous version"
```

### Pages ロールバック

Cloudflare Dashboard → Pages → Deployments から以前のデプロイメントを選択し、"Rollback to this deployment" をクリック。

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages ドキュメント](https://developers.cloudflare.com/pages/)
- [Wrangler CLI ドキュメント](https://developers.cloudflare.com/workers/wrangler/)
- [Upstash Redis ドキュメント](https://docs.upstash.com/redis)

## サポート

問題が発生した場合:
1. [Cloudflare Community](https://community.cloudflare.com/)
2. [Cloudflare Discord](https://discord.gg/cloudflaredev)
3. プロジェクトの GitHub Issues
