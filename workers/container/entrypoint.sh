#!/bin/bash
set -e

echo "Starting VOICEVOX Engine..."
# VOICEVOXエンジンをバックグラウンドで起動
# 公式の起動方法を使用
gosu user /opt/voicevox_engine/run --host 0.0.0.0 --port 50021 &

# VOICEVOXの起動待機
echo "Waiting for VOICEVOX to start..."
timeout 30 bash -c 'until curl -s http://127.0.0.1:50021/version > /dev/null; do sleep 1; done'
echo "VOICEVOX started!"

# アプリケーションディレクトリに移動
cd /app

# Video Workerを起動（メインプロセス）
echo "Starting Video Worker..."
exec node dist/workers/container/video-worker.js
