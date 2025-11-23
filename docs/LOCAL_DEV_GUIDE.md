# ローカル開発ガイド (Miniflare & Durable Objects)

このガイドでは、Cloudflare Workers環境（Miniflare）を使って、ローカルでアプリケーションを開発・テストする方法を説明します。
本番環境と同じく、**Durable Objects** を使ってジョブキューを管理します（Redisは不要です）。

## 前提条件

*   Node.js v18以上
*   pnpm
*   Docker (動画生成コンテナの動作確認用)

## 1. セットアップ

依存関係をインストールします。

```bash
pnpm install
```

## 2. Workers (バックエンド) の起動

Miniflareを使ってWorkersをローカルで起動します。
Durable Objectsもローカルでエミュレートされます。

```bash
pnpm dev:workers
```

*   API URL: `http://localhost:8787`
*   Durable Objects: メモリ上で動作（再起動でデータは消えます）

## 3. コンテナ (動画生成ワーカー) の起動

動画生成を行うコンテナをDockerで起動します。
このコンテナは、ローカルで起動しているWorkers API (`http://host.docker.internal:8787`) にアクセスしてジョブを取得します。

### `.env` の設定

コンテナがローカルのWorkersにアクセスできるように、環境変数を設定します。
`workers/container/.env` (なければ作成) または `docker-compose.cloudflare.yml` を確認してください。

```env
# workers/container/.env
CONTAINER_API_URL=http://host.docker.internal:8787
CONTAINER_API_TOKEN=dev-token
```

### 起動

```bash
docker-compose -f docker-compose.cloudflare.yml up --build
```

## 4. 動作確認フロー

1.  **ジョブ作成**:
    Workers APIを叩いてジョブを作成します。

    ```bash
    curl -X POST http://localhost:8787/api/generate \
      -H "Content-Type: application/json" \
      -d '{"slides": [{"id": "slide1", "text": "こんにちは"}]}'
    ```

2.  **ログ確認**:
    *   **Workers**: コンソールに `Job added to DO queue` と表示されます。
    *   **Container**: Dockerのログに `Processing job: ...` と表示され、動画生成が始まります。

3.  **ステータス確認**:
    ブラウザで `http://localhost:8787/api/jobs/{jobId}` にアクセスして進捗を確認します。

## 5. トラブルシューティング

### コンテナからWorkersに繋がらない

エラー: `fetch failed` や `Connection refused`

*   **原因**: Dockerコンテナ内から `localhost` はコンテナ自身を指します。
*   **解決策**: `host.docker.internal` を使用してください（Windows/MacのDocker Desktopではデフォルトで使えます）。Linuxの場合は `--add-host` オプションが必要な場合があります。

### Durable Objectsのエラー

エラー: `Durable Object not found`

*   **原因**: `wrangler.toml` の設定不備や、Miniflareの起動オプション不足。
*   **解決策**: `wrangler.toml` に `[durable_objects]` の設定があるか確認してください。

```toml
[[durable_objects.bindings]]
name = "JOB_MANAGER"
class_name = "JobManager"
```
