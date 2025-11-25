# リファクタリング計画書: モノレポ構成への移行

## 1. 概要
現在のプロジェクト構造は、CLIツール、APIサーバー、フロントエンド、Cloudflare Workersが混在しており、コード共有が相対パスに依存している状態です。これを整理し、保守性と拡張性を高めるために `pnpm workspace` を用いたモノレポ構成へ移行します。

## 2. 現状の課題
- **依存関係の複雑化**: `server/` から `src/` (CLI用コード) を相対パス `../../src` で参照しており、ディレクトリ移動に弱い。
- **責務の混在**: ルートディレクトリに全プロジェクトの設定ファイルが散乱している。
- **ビルドの分断**: 各コンポーネントを一貫してビルド・テストするフローが確立されていない。

## 3. 目標とするディレクトリ構成

```text
/
├── apps/                       # 各アプリケーション
│   ├── cli/                    # 旧 src/ (バッチ処理用CLI)
│   ├── server/                 # 旧 server/ (ローカルAPIサーバー)
│   ├── web/                    # 旧 web/ (フロントエンド)
│   └── workers/                # 旧 workers/ (Cloudflare Workers)
│       ├── api/                # API Worker
│       └── container/          # 動画生成用コンテナ
│
├── packages/                   # 共有ライブラリ
│   └── core/                   # 旧 src/services, src/utils
│       ├── src/
│       │   ├── services/       # SlideRenderer, VoicevoxServiceなど
│       │   ├── utils/          # ffmpegなど
│       │   └── config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── infrastructure/             # インフラ設定 (Dockerなど)
│   ├── docker/
│   └── ...
│
├── input/                      # ユーザー入力 (変更なし)
├── output/                     # 出力先 (変更なし)
├── pnpm-workspace.yaml         # ワークスペース定義
└── package.json                # ルート設定
```

## 4. 移行ステップ

### Step 1: ワークスペースのセットアップ
- ルートの `package.json` を整理。
- `pnpm-workspace.yaml` を作成。

### Step 2: 共有パッケージ `packages/core` の作成
- `packages/core` ディレクトリ作成。
- `src/services`, `src/utils`, `src/config.ts` を移動。
- `package.json` を作成し、必要な依存関係 (`axios`, `fs-extra`, `fluent-ffmpeg` 等) を定義。
- TypeScript設定を行い、ビルド可能にする。

### Step 3: アプリケーションの移行
#### 3-1. CLI (`apps/cli`)
- `apps/cli` 作成。
- `src/index.ts` を `apps/cli/src/index.ts` へ移動。
- `packages/core` を依存関係に追加。
- 相対パスのインポートをパッケージインポート (`@presentation-maker/core`) に書き換え。

#### 3-2. Server (`apps/server`)
- `apps/server` 作成。
- `server/` の中身を移動。
- `packages/core` を利用するように修正。

#### 3-3. Web (`apps/web`)
- `web/` を `apps/web` に移動。

#### 3-4. Workers (`apps/workers`)
- `workers/` を `apps/workers` に移動。
- 内部の相対パス参照があれば修正。

### Step 4: インフラとクリーンアップ
- `Dockerfile` などを `infrastructure/` または各 `apps/` 配下の適切な場所へ移動。
- ルートに残った不要なファイルを削除。

## 5. 検証
- 各アプリ (`cli`, `server`, `web`) が正常にビルド・起動できるか確認。
- `pnpm test` で既存のテストがパスすることを確認。
