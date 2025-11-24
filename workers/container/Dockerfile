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
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

# Puppeteerの設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Chromeのインストール (Puppeteer用)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# エントリーポイントスクリプト
COPY entrypoint.sh /entrypoint.sh
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

# VOICEVOXのポート
EXPOSE 50021
# Workerのポート
EXPOSE 80

# Node.jsのヒープサイズ制限を緩和
ENV NODE_OPTIONS="--max-old-space-size=2048"

ENTRYPOINT ["/entrypoint.sh"]
