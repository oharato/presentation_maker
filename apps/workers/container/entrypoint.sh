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
# Try several addresses used by different platforms: local loopback and the
# Cloudflare internal host. This increases the chance the readiness probe
# succeeds regardless of the container IP mapping.
echo "Waiting for Video Worker to become ready (keepalive)..."
MAX_WAIT=60
COUNT=0
READY=false
while [ "$COUNT" -lt "$MAX_WAIT" ]; do
	COUNT=$((COUNT+1))

	# Try loopback
	if curl -sSf http://127.0.0.1:80/keepalive >/dev/null 2>&1; then
		READY=true
		break
	fi

	# Try localhost (some runtimes map differently)
	if curl -sSf http://localhost:80/keepalive >/dev/null 2>&1; then
		READY=true
		break
	fi

	# Try Cloudflare internal host (used by the platform probe)
	if curl -sSf http://internal/keepalive >/dev/null 2>&1; then
		READY=true
		break
	fi

	sleep 1
done

if [ "$READY" = true ]; then
	echo "Video Worker is ready (keepalive responded)."
else
	echo "Timeout waiting for Video Worker keepalive after ${MAX_WAIT}s"
	sleep 1
	kill -TERM "$WORKER_PID" >/dev/null 2>&1 || true
	exit 1
fi

# Wait on the worker process so the container keeps running and logs are forwarded
wait "$WORKER_PID"
