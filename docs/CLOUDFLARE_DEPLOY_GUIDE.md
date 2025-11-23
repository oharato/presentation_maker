# Cloudflare デプロイガイド

このガイドでは、プレゼンテーション動画制作アプリをCloudflareにデプロイする手順を説明します。

## 前提条件

### 必要なツール

- **Node.js** v18以上
- **pnpm** パッケージマネージャー
- **Wrangler CLI** (Cloudflare Workers CLI)
- **Docker** (コンテナビルド用)

### Cloudflareアカウント

1. [Cloudflare](https://dash.cloudflare.com/sign-up) でアカウント作成
2. Workers & Pages プランを有効化 (無料プランでOK)
3. R2 を有効化
4. Durable Objects を有効化 (有料プラン必要)

### Upstash Redis

1. [Upstash](https://console.upstash.com/) でアカウント作成
2. Redis データベースを作成
3. REST API の URL とトークンを取得

## セットアップ

### 1. Wrangler CLI インストール

```bash
pnpm add -g wrangler
```

### 2. Cloudflare ログイン

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログインします。

### 3. R2 バケット作成

```bash
# 本番用
wrangler r2 bucket create presentation-videos

# プレビュー用
wrangler r2 bucket create presentation-videos-preview
```

### 4. Workers KV 作成

```bash
# 本番用
wrangler kv:namespace create "CACHE"

# プレビュー用
wrangler kv:namespace create "CACHE" --preview
```

出力された `id` と `preview_id` を `wrangler.toml` に設定します。

### 5. シークレット設定

```bash
# Upstash Redis URL
wrangler secret put UPSTASH_REDIS_REST_URL

# Upstash Redis Token
wrangler secret put UPSTASH_REDIS_REST_TOKEN

# JWT Secret (任意の文字列)
wrangler secret put JWT_SECRET

# R2 認証情報 (Container用)
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

### 6. 依存関係インストール

```bash
# Workers用の依存関係
pnpm add -D @cloudflare/workers-types wrangler

# Workers用のランタイム依存関係
pnpm add @upstash/redis uuid

# Container用の依存関係
pnpm add @aws-sdk/client-s3
```

## ビルド

### Workers ビルド

```bash
pnpm build:workers
```

### フロントエンド ビルド

```bash
pnpm build:web
```

### Docker イメージビルド

```bash
# 全てビルド
pnpm docker:build

# または個別に
pnpm docker:build:worker
pnpm docker:build:voicevox
```

## デプロイ

### ステージング環境

#### 1. Workers デプロイ

```bash
pnpm deploy:workers:staging
```

#### 2. Pages デプロイ

```bash
pnpm deploy:pages:staging
```

#### 3. コンテナデプロイ

```bash
# ローカルでテスト
pnpm cloudflare:start

# ログ確認
pnpm cloudflare:logs

# 停止
pnpm cloudflare:stop
```

本番環境では、Cloudflare Container Registry にプッシュします:

```bash
# Dockerイメージにタグ付け
docker tag presentation-maker-worker registry.cloudflare.com/your-account-id/presentation-maker-worker
docker tag presentation-maker-voicevox registry.cloudflare.com/your-account-id/presentation-maker-voicevox

# プッシュ
docker push registry.cloudflare.com/your-account-id/presentation-maker-worker
docker push registry.cloudflare.com/your-account-id/presentation-maker-voicevox
```

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

Cloudflare Dashboard で設定:

1. Pages プロジェクトを開く
2. Settings → Environment variables
3. 以下を追加:
   - `VITE_API_URL`: `https://api.your-domain.com`
   - `VITE_WS_URL`: `wss://api.your-domain.com/ws`

## カスタムドメイン設定

### Workers

1. Cloudflare Dashboard → Workers & Pages
2. プロジェクトを選択
3. Settings → Triggers → Custom Domains
4. `api.your-domain.com` を追加

### Pages

1. Cloudflare Dashboard → Pages
2. プロジェクトを選択
3. Custom domains
4. `presentation-maker.your-domain.com` を追加

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
