# プレゼンテーション動画制作アプリ - 変更履歴

## v2.0.0 - Webアプリケーション化 (2025-11-20)

### 追加機能
- **Webアプリケーション**: Vue.js + Hono によるWebインターフェース
  - ローカルフォルダからのファイルアップロード
  - ブラウザ上での手動入力
  - リアルタイム進捗表示
  - 動画プレビュー・ダウンロード
- **非同期ジョブキュー**: Bull + Redis による動画生成の非同期処理
- **リアルタイム通信**: Socket.IOによる進捗通知
- **Docker Compose**: Redis環境の簡単セットアップ

### 技術スタック変更
- **Webフレームワーク**: Express → Hono (軽量・高速)
- **フロントエンド**: Vue.js 3 + TypeScript + Vite
- **ジョブキュー**: Bull (Redis)
- **リアルタイム**: Socket.IO

### ドキュメント
- `docs/WEB_APP_SETUP.md`: Webアプリセットアップガイド
- `docs/API.md`: API仕様書
- `docker-compose.yml`: Redis環境定義

### 依存関係
- 追加: `hono`, `@hono/node-server`, `bull`, `ioredis`, `socket.io`, `uuid`
- 削除: `express`, `cors` (Honoに移行)
- 削除: `@types/glob`, `@types/marked`, `@types/uuid` (deprecated)

---

## v1.0.0 - 初期リリース

### 機能
- Markdownスライドから画像生成
- テキストスクリプトから音声生成 (VOICEVOX)
- 音声付き動画の自動生成
- 複数スライドの結合
- `[pause:N]` 構文による無音挿入
- 環境変数による音声設定

### 技術スタック
- TypeScript
- Node.js
- FFmpeg (動画処理)
- VOICEVOX (音声合成)
- Puppeteer (スライドレンダリング)
- Marked (Markdown処理)

### テスト
- Jest + ts-jest
- VoicevoxService, SlideRenderer, VideoGenerator のユニットテスト

---

## v2.1.0 - CLI/メディアパイプライン改善 (2025-11-29)

### 修正・改善
- **FFmpeg 結合の堅牢化**: 入力メディア間で音声パラメータ（サンプルレート / チャンネル）や動画解像度が異なる場合、単純な demuxer ベースの concat やストリームコピーではタイムスタンプ不整合が発生し、音声欠落や静止画化が起きる問題を確認しました。このため、以下の対策を実装しました。
  - 入力ファイル群をプローブして音声の `sample_rate` と `channels` をチェックし、不一致がある場合は自動的に「再エンコード concat（filter_complex の concat）」を利用するように変更しました。
  - 再エンコード時は各入力を事前に `scale+pad` でターゲット解像度に揃えた上で concat filter を使い、映像・音声のサイズやタイムスタンプの不整合を解消します。
  - 高速化のため、まず copy ベースの concat を試し、失敗や音声欠落があれば再エンコードにフォールバックするロジックを採用しています。

- **音声 PTS 正規化**: マージ処理で音声先頭が負の PTS になるケースに対して、`asetpts=PTS-STARTPTS` を用いて音声 PTS をリセットし、必要に応じて `apad` / `tpad` によるパディングで長さを揃えるようにしました。これにより最終結合時のズレや無音化を防ぎます。

- **画像からの動画化改善**: `imageToVideo` の実装を改良し、画像をターゲット解像度（デフォルト `1920x1080`）にアスペクト比を維持してフィットさせ、中央にパディングする `scale+pad` フィルタを使うようにしました。

- **CLI の利便性向上**:
  - `pnpm --filter @presentation-maker/cli dev 020` のようにスライド ID（複数可）を指定して部分処理が可能。
  - `pnpm --filter @presentation-maker/cli dev final` で既存の `output/*.processed.mp4` から最終結合のみを実行する `final-only` モードを追加。
  - `apps/cli` に `thumbnails-to-pdf` スクリプトを追加。`output/*.processed.mp4` の先頭フレームを抽出して `output/presentation_thumbnails.pdf` を生成します。

### 実装箇所
- `packages/core/src/utils/ffmpeg.ts` (および `dist` に出力された実行ファイル) にて、concat/merge/normalize ロジックを拡張しました。
- `apps/cli/src/index.ts` に CLI 引数処理（ID 指定 / final モード）とサムネPDF処理を追加しています。

### 備考 / 推奨
- パフォーマンスを優先するなら、事前に各 `processed` ファイルを同一の音声サンプルレート・チャンネル・解像度に正規化しておくと、copy ベース concat が常に使え、処理時間を大幅に短縮できます。CLI に正規化オプションを追加することもできます（必要なら対応します）。
