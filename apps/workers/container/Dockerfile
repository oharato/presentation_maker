# VOICEVOXエンジンをベースにする
FROM voicevox/voicevox_engine:cpu-ubuntu24.04-latest

# rootユーザーで実行
USER root

# Node.js 24のインストール
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get update && apt-get install -y nodejs

# pnpmのインストール
RUN npm install -g pnpm

# 必要なパッケージとChromeのインストール
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    fontconfig \
    lsb-release \
    wget \
    xdg-utils \
    dos2unix \
    # Chromeのインストール (Puppeteer用)
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Rebuild font cache so headless Chrome / Puppeteer can use newly installed fonts
RUN fc-cache -f -v || true

# アプリケーションのセットアップ
WORKDIR /app
# 依存関係ファイルのみをコピーしてpnpm installをキャッシュ
COPY package.json /app/package.json
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY pnpm-workspace.yaml /app/pnpm-workspace.yaml

# pnpm install
RUN pnpm install --frozen-lockfile

# 後から必要なコードのみをコピー
COPY packages /app/packages
COPY apps/workers/container /app/apps/workers/container

# Build core package
WORKDIR /app/packages/core
# coreパッケージの依存関係をインストール
COPY packages/core/package.json /app/packages/core/package.json
COPY packages/core/tsconfig.json /app/packages/core/tsconfig.json
RUN pnpm install --frozen-lockfile

# coreパッケージの残りのコードをコピー
COPY packages/core/src /app/packages/core/src

# Build core package
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

# Directly run the Node.js worker for debugging. Voicevox will not be started with this configuration.
CMD ["node", "dist/video-worker.js"]
