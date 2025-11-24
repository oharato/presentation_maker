# Video Worker Container
FROM node:20-alpine

# FFmpegインストール
RUN apk add --no-cache ffmpeg

# Puppeteer依存関係
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

# Puppeteer設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

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

# ワーカー起動
CMD ["node", "dist/video-worker.js"]
