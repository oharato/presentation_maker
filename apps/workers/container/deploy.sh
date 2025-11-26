#!/bin/bash

# エラーが発生したら停止
set -e

# ディレクトリ移動
cd "$(dirname "$0")"

# 変数定義
ACCOUNT_ID="1a02a58c61ffef10bc9598f738805e54"
IMAGE_NAME="presentation-maker-worker"
TAG=$(date +%Y%m%d%H%M%S)
FULL_IMAGE_NAME="registry.cloudflare.com/$ACCOUNT_ID/$IMAGE_NAME:$TAG"

echo "🚀 Starting deployment for tag: $TAG"

# 1. Dockerイメージのビルド
echo "📦 Building Docker image..."
# Cloudflare Workersはlinux/amd64アーキテクチャが必要です
docker build --platform linux/amd64 -f Dockerfile -t "$IMAGE_NAME:$TAG" .

# 2. タグ付け
echo "🏷️ Tagging image..."
docker tag "$IMAGE_NAME:$TAG" "$FULL_IMAGE_NAME"

# 3. Cloudflare Registryへプッシュ
echo "⬆️ Pushing to Cloudflare Registry..."
# 事前に `docker login registry.cloudflare.com` が必要です
docker push "$FULL_IMAGE_NAME"

# 4. wrangler.jsoncの更新
echo "📝 Updating wrangler.jsonc..."
node update-wrangler-jsonc.js "$TAG"

# 5. Workerのデプロイ
echo "🚀 Deploying Worker..."
pnpm run deploy

echo "✅ Deployment complete! Tag: $TAG"
