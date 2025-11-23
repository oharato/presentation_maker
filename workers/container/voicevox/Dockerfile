# VOICEVOX Container
FROM voicevox/voicevox_engine:cpu-ubuntu20.04-latest

# 環境変数
ENV VOICEVOX_PORT=50021

# ポート公開
EXPOSE 50021

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD curl -f http://localhost:50021/version || exit 1

# VOICEVOX起動
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "50021"]
