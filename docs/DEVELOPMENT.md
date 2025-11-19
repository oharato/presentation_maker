# 開発環境 (DEVELOPMENT)

## 必須ツール
- **OS**: Windows
- **Node.js**: 最新の LTS 推奨
- **pnpm**: パッケージマネージャ
- **FFmpeg**: 動画処理用。PATHを通しておくこと。
- **VOICEVOX**: 音声合成エンジン。ローカルサーバーとして起動しておくこと (デフォルト: `http://127.0.0.1:50021`)。

## セットアップ
```bash
# 依存関係のインストール
pnpm install
```

## 実行
```bash
# ビルド & 実行
pnpm start
```

## 技術スタック
- 言語: TypeScript
- 動画処理: fluent-ffmpeg
- 音声合成: VOICEVOX (HTTP API)
- その他: fs-extra, axios
