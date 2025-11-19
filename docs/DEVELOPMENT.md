# 開発環境 (DEVELOPMENT)

## 必須ツール

### 共通 (CLI + Webアプリ)
- **OS**: Windows (WSL2推奨)
- **Node.js**: v18以上 (LTS推奨)
- **pnpm**: パッケージマネージャ
  ```bash
  npm install -g pnpm
  ```
- **FFmpeg**: 動画処理用。PATHを通しておくこと
  ```bash
  # Windows
  winget install Gyan.FFmpeg
  
  # 確認
  ffmpeg -version
  ```
- **VOICEVOX**: 音声合成エンジン
  - ダウンロード: https://voicevox.hiroshiba.jp/
  - 起動後、`http://127.0.0.1:50021` でAPIが利用可能

### Webアプリモード追加要件
- **Docker** (WSL2推奨) または **Redis**
  ```bash
  # WSL2 Docker確認
  wsl docker --version
  
  # または、ローカルRedis
  redis-server --version
  ```

## セットアップ

### 1. リポジトリのクローン
```bash
git clone <repository-url>
cd presentation_maker
```

### 2. 依存関係のインストール

#### CLIモード
```bash
pnpm install
```

#### Webアプリモード
```bash
# ルート
pnpm install

# フロントエンド
cd web
pnpm install
cd ..
```

### 3. 環境変数の設定
```bash
# .envファイルを作成
cp .env.sample .env

# 必要に応じて編集
# - VOICEVOX_BASE_URL
# - VOICEVOX_SPEAKER_ID
```

### 4. Redis起動 (Webアプリモードのみ)
```bash
# WSL2 Docker
pnpm redis:start

# または
start-redis.bat
```

## 実行

### CLIモード
```bash
# 開発実行
pnpm start

# ビルド
pnpm build

# ビルド後実行
node dist/src/index.js
```

### Webアプリモード
```bash
# 開発モード (推奨)
pnpm dev

# 個別起動
pnpm dev:server  # バックエンドのみ
pnpm dev:web     # フロントエンドのみ

# 本番ビルド
pnpm build:web
pnpm build
```

## テスト

```bash
# 全テスト実行
pnpm test

# ウォッチモード
pnpm test:watch

# カバレッジ
pnpm test -- --coverage
```

## 技術スタック

### CLIモード
- **言語**: TypeScript
- **動画処理**: fluent-ffmpeg
- **音声合成**: VOICEVOX (HTTP API)
- **Markdown処理**: marked
- **スライドレンダリング**: puppeteer
- **その他**: fs-extra, axios, glob

### Webアプリモード (追加)
- **バックエンド**:
  - Hono (Webフレームワーク)
  - Socket.IO (リアルタイム通信)
  - Bull (ジョブキュー)
  - IORedis (Redisクライアント)
  - Multer (ファイルアップロード)

- **フロントエンド**:
  - Vue.js 3 (UIフレームワーク)
  - TypeScript
  - Vite (ビルドツール)
  - Socket.IO Client

- **インフラ**:
  - Redis (ジョブキュー・データストア)
  - Docker (Redis環境)

## ディレクトリ構造

```
presentation_maker/
├── src/                  # CLIモード
│   ├── services/         # サービス層
│   ├── config.ts         # 環境変数設定
│   └── index.ts          # エントリーポイント
├── server/               # Webアプリバックエンド
│   ├── routes/           # APIルート
│   ├── workers/          # ジョブワーカー
│   ├── queue.ts          # Bullキュー設定
│   └── server.ts         # サーバーエントリーポイント
├── web/                  # Webアプリフロントエンド
│   ├── src/
│   │   ├── App.vue       # メインコンポーネント
│   │   └── main.ts
│   └── dist/             # ビルド出力
├── tests/                # テスト
├── docs/                 # ドキュメント
├── input/                # 入力ファイル (CLI)
├── output/               # 出力ファイル (CLI)
└── public/               # 公開ファイル (Web)
    └── videos/           # 生成動画
```

## 開発ワークフロー

### 新機能の追加

1. **ブランチ作成**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **コード実装**
   - サービス層に機能を実装
   - 必要に応じてテスト追加

3. **テスト**
   ```bash
   pnpm test
   ```

4. **コミット**
   ```bash
   git add .
   git commit -m "Add new feature"
   ```

5. **プッシュ**
   ```bash
   git push origin feature/new-feature
   ```

### バグ修正

1. **問題の特定**
   - ログ確認
   - デバッグ実行

2. **修正実装**
   - 該当コードを修正
   - テスト追加/更新

3. **検証**
   ```bash
   pnpm test
   pnpm start  # または pnpm dev
   ```

## デバッグ

### CLIモード
```bash
# TypeScriptデバッグ
node --inspect -r ts-node/register src/index.ts

# VSCodeでデバッグ
# .vscode/launch.json を設定
```

### Webアプリモード
```bash
# バックエンドデバッグ
node --inspect -r ts-node/register server/server.ts

# フロントエンド
# ブラウザのDevToolsを使用
```

### ログ確認
```bash
# Redis
pnpm redis:logs

# アプリケーション
# コンソール出力を確認
```

## トラブルシューティング

### pnpm installが失敗
```bash
# キャッシュクリア
pnpm store prune

# 再インストール
rm -rf node_modules
pnpm install
```

### TypeScriptエラー
```bash
# 型定義の再インストール
pnpm install -D @types/node

# tsconfigの確認
cat tsconfig.json
```

### Redisに接続できない
```bash
# Docker確認
wsl docker compose ps

# 再起動
pnpm redis:stop
pnpm redis:start
```

### VOICEVOXに接続できない
```bash
# APIエンドポイント確認
curl http://localhost:50021/speakers

# ブラウザで確認
# http://localhost:50021/docs
```

## コーディング規約

- **TypeScript**: strict mode
- **インデント**: 4スペース
- **命名規則**:
  - ファイル: snake_case
  - クラス: PascalCase
  - 関数/変数: camelCase
  - 定数: UPPER_SNAKE_CASE

## コミットメッセージ

```
<type>: <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: フォーマット
- `refactor`: リファクタリング
- `test`: テスト
- `chore`: その他

## リリースプロセス

1. バージョン更新
   ```bash
   # package.jsonのversionを更新
   ```

2. CHANGELOG更新
   ```bash
   # docs/CHANGELOG.mdに変更内容を記載
   ```

3. ビルド
   ```bash
   pnpm build
   pnpm build:web
   ```

4. タグ作成
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## 参考リンク

- [Hono Documentation](https://hono.dev/)
- [Vue.js Documentation](https://vuejs.org/)
- [Bull Documentation](https://github.com/OptimalBits/bull)
- [VOICEVOX API](http://localhost:50021/docs)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
