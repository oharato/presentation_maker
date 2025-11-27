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

# Video Workerを起動（メインプロセス）
echo "Starting Video Worker..."

# Start the worker in the background so we can perform a readiness probe
node dist/video-worker.js &
WORKER_PID=$!

# Wait for the worker to respond on the keepalive endpoint before continuing.
# This helps avoid platform healthchecks failing if the process takes a short time to bind.
echo "Waiting for Video Worker to become ready (keepalive)..."
MAX_WAIT=60
COUNT=0
while ! curl -sSf http://127.0.0.1:80/keepalive >/dev/null 2>&1; do
	COUNT=$((COUNT+1))
	if [ "$COUNT" -ge "$MAX_WAIT" ]; then
		echo "Timeout waiting for Video Worker keepalive after ${MAX_WAIT}s"
		# If keepalive doesn't respond, show logs and exit with failure to let orchestrator notice
		sleep 1
		kill -TERM "$WORKER_PID" >/dev/null 2>&1 || true
		exit 1
	fi
	sleep 1
done

echo "Video Worker is ready (keepalive responded)."

# Wait on the worker process so the container keeps running and logs are forwarded
wait "$WORKER_PID"
