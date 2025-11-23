# ローカル動作確認ガイド (Miniflare)

Miniflare (Wrangler Dev) を使用して、ローカル環境でCloudflare Workersの動作確認を行う手順です。

## 概要

ローカル環境では、外部サービスへの依存を最小限にするため、以下のモック機能を使用します：

- **Redis**: Workers KVを使用したモックキュー (`MOCK_QUEUE=true`)
- **Container**: 実際には起動せず、ログ出力のみ (またはローカルDockerを手動起動)
- **R2/KV/Durable Objects**: Miniflareによるローカルエミュレーション

## 準備

### 1. 依存関係のインストール

```bash
pnpm add -D @cloudflare/workers-types wrangler
pnpm add @upstash/redis @aws-sdk/client-s3 uuid
```

### 2. 設定確認

`wrangler.toml` に以下の設定があることを確認してください：

```toml
[env.development]
vars = { ENVIRONMENT = "development", MOCK_QUEUE = "true" }
```

## 実行手順

### 1. Workersの開発サーバー起動

```bash
# Miniflare (ローカルモード) で起動
pnpm dev:workers
```

これで `http://localhost:8787` でAPIがリッスンします。

### 2. 動作確認

別のターミナルを開いて、APIをテストします。

#### ヘルスチェック

```bash
curl http://localhost:8787/health
```

レスポンス例:
```json
{"status":"ok","environment":"development",...}
```

#### ジョブ作成 (モック)

```bash
curl -X POST http://localhost:8787/api/generate \
  -H "Content-Type: application/json" \
  -d '{"slides":[{"id":"1","text":"test"}]}'
```

レスポンス例:
```json
{"jobId":"...","message":"Job created successfully"}
```

コンソールログに `[Mock] Job added: ...` と表示されれば成功です。

### 3. コンテナ側の動作確認 (オプション)

ローカルで動画生成まで行いたい場合は、Dockerコンテナを手動で起動し、ローカルのMiniflareに向ける必要がありますが、ネットワーク設定が複雑になるため、推奨手順は以下の通りです：

1. **Workersロジックの確認**: 上記の手順でAPIとキューの動作を確認
2. **動画生成ロジックの確認**: 既存の `pnpm dev` (Expressサーバー) で確認
3. **統合テスト**: ステージング環境 (`pnpm deploy:workers:staging`) で確認

## トラブルシューティング

### 型定義エラー

エディタ上で型定義エラーが出る場合は、VSCodeを再起動するか、`tsconfig.json` を確認してください。

### モジュールが見つからない

```bash
pnpm install
```

を実行して、依存関係が正しくインストールされているか確認してください。
