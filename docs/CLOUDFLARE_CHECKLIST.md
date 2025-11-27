# Cloudflare デプロイ - 実装チェックリスト

このドキュメントは、Cloudflareデプロイに必要な実装タスクのチェックリストです。

## ✅ 完了済み: 設計・設定ファイル

### ドキュメント
- [x] `docs/CLOUDFLARE_DEPLOYMENT.md` - アーキテクチャ設計書
- [x] `docs/CLOUDFLARE_DEPLOY_GUIDE.md` - デプロイ手順書
- [x] `README.md` - Cloudflareデプロイ情報を追加

### 設定ファイル
- [x] `wrangler.toml` - Workers設定
- [x] `wrangler.pages.toml` - Pages設定
- [x] `tsconfig.workers.json` - Workers用TypeScript設定
- [x] `docker-compose.cloudflare.yml` - Container設定
- [x] `package.json` - デプロイスクリプト追加

### Workers実装
- [x] `workers/src/index.ts` - メインエントリーポイント
- [x] `workers/src/routes/api.ts` - APIルート
- [x] `workers/src/routes/websocket.ts` - WebSocketルート
- [x] `workers/middleware/auth.ts` - 認証ミドルウェア
- [x] `workers/middleware/rate-limit.ts` - レート制限ミドルウェア
- [x] `workers/utils/queue.ts` - ジョブキュー (Durable Objects)
- [x] `workers/durable-objects/JobManager.ts` - Durable Objects実装

### Container実装
- [x] `workers/container/Dockerfile` - Video Worker用
- [x] `workers/container/voicevox/Dockerfile` - VOICEVOX用
- [x] `workers/container/video-worker.ts` - ワーカー実装

## 🔧 実装が必要: 依存関係とビルド

### 1. 依存関係インストール

```bash
# Workers用の型定義とCLI
pnpm add -D @cloudflare/workers-types wrangler

# Workers用のランタイム依存関係


# Container用の依存関係
pnpm add @aws-sdk/client-s3
```

### 2. インポートパス修正

以下のファイルでインポートパスを修正する必要があります:

#### `workers/src/routes/api.ts`
- [ ] `import { JobQueue } from '../utils/queue';` → パス確認

#### `workers/middleware/rate-limit.ts`
- [ ] `import type { Env } from '../index';` → パス確認

#### `workers/middleware/auth.ts`
- [ ] `import type { Env } from '../index';` → パス確認

#### `workers/utils/queue.ts`
- [ ] `import type { Env } from '../index';` → パス確認

#### `workers/container/video-worker.ts`
- [ ] `import { JobQueue } from '../../utils/queue';` → パス確認
- [ ] `import { VideoGenerator } from '../../../src/services/VideoGenerator';` → パス確認

### 3. 型定義の追加

Honoのコンテキスト型を拡張:

```typescript
// workers/src/types.ts を作成
import type { Context as HonoContext } from 'hono';

export interface Variables {
  userId?: string;
  user?: any;
}

export type Context = HonoContext<{ Bindings: Env; Variables: Variables }>;
```

各ミドルウェアで使用:
```typescript
import type { Context } from '../types';
```

## 🚀 実装が必要: Cloudflareセットアップ

### 2. Cloudflareアカウント設定
- [ ] Cloudflareアカウント作成
- [ ] Workers & Pages プラン有効化
- [ ] R2 有効化
- [ ] Durable Objects 有効化 (有料プラン)

### 3. Wrangler CLI設定
- [ ] Wrangler インストール: `pnpm add -g wrangler`
- [ ] ログイン: `wrangler login`

### 4. R2バケット作成
```bash
wrangler r2 bucket create presentation-videos
wrangler r2 bucket create presentation-videos-preview
```

### 5. Workers KV作成
```bash
wrangler kv namespace create "CACHE"
wrangler kv namespace create "CACHE" --preview
```

出力されたIDを `wrangler.toml` に設定:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

### 6. シークレット設定
```bash
wrangler secret put JWT_SECRET
wrangler secret put CONTAINER_API_TOKEN
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

## 🔨 実装が必要: コード修正

### 1. VideoGenerator サービス

`src/services/VideoGenerator.ts` を作成または修正:

```typescript
export class VideoGenerator {
  constructor(options?: { voicevoxUrl?: string }) {
    // 初期化
  }

  async generateSlide(slide: any): Promise<{
    audio?: Buffer;
    image?: Buffer;
    video?: Buffer;
  }> {
    // スライド生成ロジック
  }

  async combineVideos(slides: any[]): Promise<Buffer> {
    // 動画結合ロジック
  }
}
```

### 2. R2 署名付きURL生成

Workers内でR2署名付きURLを生成する機能を追加:

```typescript
// workers/utils/r2.ts を作成
export async function createSignedUrl(
  bucket: R2Bucket,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  // 署名付きURL生成ロジック
  // 注: R2は現在署名付きURLをネイティブサポートしていないため、
  // 代替として一時的な公開URLを生成するか、
  // Workers経由でプロキシする必要があります
}
```

### 3. WebSocket型定義

Cloudflare Workers用のWebSocket型を使用:

```typescript
// workers/durable-objects/JobManager.ts
export class JobManager {
  state: DurableObjectState;
  sessions: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    // ...
  }

  handleSession(websocket: WebSocket) {
    this.state.acceptWebSocket(websocket);
    // ...
  }
}
```

## 🧪 テスト

### ローカルテスト

```bash
# Workers ローカル実行
pnpm dev:workers

# Container ローカル実行
pnpm cloudflare:start
```

### ステージングデプロイ

```bash
# Workers
pnpm deploy:workers:staging

# Pages
pnpm deploy:pages:staging
```

### 動作確認

```bash
# ヘルスチェック
curl https://api-staging.your-domain.com/health

# WebSocket接続テスト
wscat -c wss://api-staging.your-domain.com/api/ws/connect/global
```

## 📊 モニタリング設定

- [ ] Cloudflare Analytics 確認
- [ ] ログ確認: `wrangler tail`
- [ ] アラート設定 (Cloudflare Dashboard)

## 🎯 本番デプロイ

### デプロイ前チェックリスト

- [ ] 全テストが通過
- [ ] ステージング環境で動作確認
- [ ] 環境変数が正しく設定されている
- [ ] カスタムドメインが設定されている
- [ ] CORS設定が本番用に更新されている
- [ ] レート制限が適切に設定されている

### デプロイ実行

```bash
# 一括デプロイ
pnpm deploy:all

# または個別に
pnpm deploy:workers:production
pnpm deploy:pages:production
```

### デプロイ後確認

- [ ] ヘルスチェック成功
- [ ] フロントエンドアクセス可能
- [ ] WebSocket接続可能
- [ ] 動画生成テスト成功
- [ ] モニタリング正常

## 📝 次のステップ

1. **フェーズ1: 準備** (完了)
   - [x] 設計書作成
   - [x] 設定ファイル作成
   - [x] 基本実装

2. **フェーズ2: 依存関係とビルド** (次のタスク)
   - [ ] 依存関係インストール
   - [ ] インポートパス修正
   - [ ] 型定義追加
   - [ ] ビルドテスト

3. **フェーズ3: Cloudflareセットアップ**
   - [ ] アカウント設定
   - [ ] リソース作成
   - [ ] シークレット設定

4. **フェーズ4: コード修正**
   - [ ] VideoGenerator実装
   - [ ] R2統合
   - [ ] WebSocket修正

5. **フェーズ5: テスト**
   - [ ] ローカルテスト
   - [ ] ステージングデプロイ
   - [ ] 動作確認

6. **フェーズ6: 本番デプロイ**
   - [ ] 本番デプロイ
   - [ ] モニタリング設定
   - [ ] ドキュメント最終更新

## 🔗 参考資料

- [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) - アーキテクチャ設計
- [CLOUDFLARE_DEPLOY_GUIDE.md](./CLOUDFLARE_DEPLOY_GUIDE.md) - デプロイ手順
- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Wrangler CLI ドキュメント](https://developers.cloudflare.com/workers/wrangler/)
