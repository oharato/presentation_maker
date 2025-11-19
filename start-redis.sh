#!/bin/bash

# WSL2のDockerを使ってRedisを起動するスクリプト

echo "🚀 Starting Redis with WSL2 Docker..."

# docker-compose.ymlのパスを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# WSL2でdocker composeを実行
wsl docker compose -f "$COMPOSE_FILE" up -d

# 起動確認
echo ""
echo "⏳ Waiting for Redis to be ready..."
sleep 2

# ヘルスチェック
wsl docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "✅ Redis is running!"
echo "   Container: presentation_maker_redis"
echo "   Port: 6379"
echo ""
echo "📝 To check logs:"
echo "   wsl docker compose -f \"$COMPOSE_FILE\" logs -f redis"
echo ""
echo "🛑 To stop Redis:"
echo "   wsl docker compose -f \"$COMPOSE_FILE\" down"
