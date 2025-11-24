#!/bin/bash
set -e

echo "Starting VOICEVOX Engine..."
# VOICEVOXエンジンをバックグラウンドで起動
# /opt/voicevox_engine/run.py があると仮定 (公式イメージの構造)
# もしパスが違う場合は修正が必要だが、一般的なパスを使用
cd /opt/voicevox_engine
python3 run.py --use_gpu=False --host 0.0.0.0 --port 50021 &

# VOICEVOXの起動待機
echo "Waiting for VOICEVOX to start..."
timeout 30 bash -c 'until curl -s http://127.0.0.1:50021/version > /dev/null; do sleep 1; done'
echo "VOICEVOX started!"

# アプリケーションディレクトリに戻る
cd /app

# Video Workerを起動
echo "Starting Video Worker..."
npm start
