# Video Worker Container
FROM node:24-slim

# 必要なパッケージのインストール (FFmpeg, Chromium, フォントなど)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    libnss3 \
    libfreetype6 \
    libfreetype6-dev \
    libharfbuzz-bin \
    ca-certificates \
    fonts-freefont-ttf \
    nodejs \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# pnpmインストール
RUN npm install -g pnpm

# 依存関係ファイルをコピー
COPY package.json ./

# 依存関係インストール
RUN pnpm install --no-frozen-lockfile --prod

# ソースコードコピー
COPY src ./src
COPY video-worker.ts ./
COPY tsconfig.json ./
COPY blank.png ./

# TypeScriptビルド
RUN pnpm add -D typescript @types/node tsc-alias
RUN pnpm run build

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# ワーカー起動（メモリ制限を2GBに設定）
CMD ["node", "--max-old-space-size=2048", "dist/video-worker.js"]
