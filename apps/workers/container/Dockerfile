# VOICEVOXエンジンをベースにする
FROM voicevox/voicevox_engine:cpu-ubuntu24.04-latest

# rootユーザーで実行
USER root

# 必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    wget \
    xdg-utils \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24のインストール
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

# pnpmのインストール
RUN npm install -g pnpm

# アプリケーションのセットアップ
WORKDIR /app

# プロジェクトルート全体をコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/container ./apps/workers/container

# pnpm install
RUN pnpm install --frozen-lockfile

# Build core package
WORKDIR /app/packages/core
RUN pnpm build

# Build worker container
WORKDIR /app/apps/workers/container
RUN pnpm build

# Puppeteerの設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_NO_SANDBOX=true
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe

# Chromeのインストール (Puppeteer用)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# エントリーポイントスクリプト
COPY apps/workers/container/entrypoint.sh /entrypoint.sh
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

# 実行時のワーキングディレクトリ
WORKDIR /app/apps/workers/container

# VOICEVOXのポート
EXPOSE 50021
# Workerのポート
EXPOSE 80

# Node.jsのヒープサイズ制限を緩和
ENV NODE_OPTIONS="--max-old-space-size=2048"

ENTRYPOINT ["/entrypoint.sh"]
