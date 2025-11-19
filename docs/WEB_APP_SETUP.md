# Webアプリケーション セットアップガイド

## 前提条件

1. **Docker と Docker Compose**
   - Docker Desktop for Windows をインストール

2. **VOICEVOX の起動**
   - VOICEVOXアプリを起動してください

## セットアップ手順

### 1. 依存関係のインストール

```bash
# ルートディレクトリ
pnpm install

# Webフロントエンド
cd web
pnpm install
cd ..
```

### 2. 環境変数の設定

`.env`ファイルが既に存在します。必要に応じて編集してください。

### 3. Redis の起動

#### オプション1: WSL2 Docker (推奨 - Windows)

**簡単な方法:**
```bash
# WindowsのコマンドプロンプトまたはPowerShellで
start-redis.bat
```

**または、手動で:**
```bash
wsl docker compose up -d
```

Redisが起動したか確認:
```bash
wsl docker compose ps
```

停止する場合:
```bash
stop-redis.bat
# または
wsl docker compose down
```

#### オプション2: Docker Desktop (Windows)

```bash
docker compose up -d
```

Redisが起動したか確認:
```bash
docker compose ps
```

#### オプション3: ローカルにRedisをインストール

**Windows:**
1. https://github.com/microsoftarchive/redis/releases からダウンロード
2. インストール後、`redis-server`を実行

**または、WSL2を使用:**
```bash
wsl
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

**確認:**
```bash
redis-cli ping
# PONG と返ってくればOK
```

### 4. アプリケーションの起動

#### 開発モード（推奨）

```bash
pnpm dev
```

これにより以下が同時に起動します:
- バックエンドサーバー (Hono): http://localhost:3000
- Socket.IOサーバー: http://localhost:3001
- フロントエンド開発サーバー (Vue): http://localhost:5173

#### 個別に起動

```bash
# バックエンドのみ
pnpm dev:server

# フロントエンドのみ
pnpm dev:web
```

## 使い方

### 方法1: ローカルフォルダからアップロード

1. ブラウザで http://localhost:5173 を開く
2. 「フォルダを選択」ボタンをクリック
3. `input`フォルダを選択
4. 「アップロードして動画生成」ボタンをクリック
5. 進捗が表示され、完了すると動画が表示されます

### 方法2: 手動入力

1. ブラウザで http://localhost:5173 を開く
2. スライドとスクリプトを手動で入力
3. 「+ スライドを追加」で追加可能
4. 「動画を生成」ボタンをクリック
5. 進捗が表示され、完了すると動画が表示されます

## トラブルシューティング

### Redisに接続できない

```bash
# Redisが起動しているか確認
docker-compose ps

# ログを確認
docker-compose logs redis

# 再起動
docker-compose restart redis
```

### VOICEVOXに接続できない

- VOICEVOXアプリが起動しているか確認
- http://localhost:50021/docs にアクセスできるか確認

### ポートが使用中

`.env`ファイルでポートを変更できます:

```
PORT=3002  # バックエンドのポート
```

## 本番環境へのデプロイ

### 1. フロントエンドのビルド

```bash
pnpm build:web
```

### 2. バックエンドのビルド

```bash
pnpm build
```

### 3. 起動

```bash
# Redisを起動
docker-compose up -d

# アプリケーションを起動
NODE_ENV=production node dist/server/server.js
```

ビルドされたフロントエンドは`web/dist`に出力され、バックエンドサーバーが自動的に配信します。

## Docker Composeコマンド

```bash
# 起動
docker-compose up -d

# 停止
docker-compose down

# ログ確認
docker-compose logs -f

# Redis CLIに接続
docker-compose exec redis redis-cli
```

## アーキテクチャ

- **フロントエンド**: Vue.js + TypeScript + Vite
- **バックエンド**: Hono (軽量Webフレームワーク)
- **リアルタイム通信**: Socket.IO
- **ジョブキュー**: Bull + Redis
- **動画生成**: 既存サービス (VoicevoxService, SlideRenderer, VideoGenerator)
