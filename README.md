# Presentation Maker

プレゼンテーション動画を自動生成するアプリケーションです。
Markdownのスライドとテキストの台本から、音声付きの動画を作成します。

## 前提条件
- Node.js (v18以上推奨)
- pnpm
- FFmpeg
- VOICEVOX

## セットアップ

1. 依存関係をインストールします。
    ```bash
    pnpm install
    ```

2. `.env.sample`を`.env`にコピーして、必要に応じて設定を変更します。
    ```bash
    cp .env.sample .env
    ```
    - `VOICEVOX_BASE_URL`: VOICEVOXのURL (デフォルト: `http://127.0.0.1:50021`)
    - `VOICEVOX_SPEAKER_ID`: 使用する音声のID (デフォルト: `1` = ずんだもん)
    - 利用可能なスピーカーIDは`.env.sample`を参照してください

3. VOICEVOXをインストールして起動します。
    - 公式サイト (https://voicevox.hiroshiba.jp/) からダウンロード
    - アプリを起動すると、ローカルサーバー (http://127.0.0.1:50021) が有効になります

4. FFmpegをインストールします。
    - 公式サイト (https://ffmpeg.org/download.html) からダウンロード
    - または: `winget install Gyan.FFmpeg`
    - `ffmpeg -version` でパスが通っていることを確認

## 使い方

1. `input` フォルダにファイルを配置します。
    - スライド: `010__title.md`
    - 台本: `010__title.txt`
    - ファイル名の先頭の数字 (`010`) が一致するものがペアとして処理されます。
    - 台本ファイル内で `[pause:秒数]` と記述することで、無音時間を挿入できます。
        - 例: `こんにちは。[pause:1.5]今日はいい天気ですね。` (1.5秒の無音)

2. アプリケーションを実行します。
    ```bash
    pnpm start
    ```

3. `output` フォルダに生成物が保存されます。
    - `010__title.wav`: 音声
    - `010__title.png`: スライド画像
    - `010__title.nosound.mp4`: 無音動画
    - `010__title.mp4`: 完成動画
    - `final_presentation.mp4`: 全スライドを結合した最終動画

## テスト

テストを実行します。
```bash
pnpm test
```

## 音声の変更

`.env`ファイルで`VOICEVOX_SPEAKER_ID`を変更することで、異なる音声を使用できます。
利用可能な音声IDは`.env.sample`を参照してください。
