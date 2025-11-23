# Sherpa-onnx セットアップガイド

このプロジェクトでは、ブラウザ上で動作する音声合成エンジンとしてSherpa-onnxを使用します。
大きなWASMファイルとモデルファイルはセルフホストします。

## 必要なファイル

### 1. WASMファイル（自動ダウンロード可能）

以下のファイルは `pnpm download:sherpa-onnx` で自動ダウンロードできます:

- `sherpa-onnx-wasm-main-tts.js` - WASMローダー
- `sherpa-onnx-wasm-main-tts.wasm` - WASMバイナリ
- `sherpa-onnx-wasm-main-tts.data` - データファイル

### 2. 日本語TTSモデル（手動ダウンロード）

日本語音声合成には、以下のモデルファイルが必要です:

#### ✅ 推奨: csukuangfj/vits-hf-zh-jp-zomehwh (ONNX形式)

**中国語・日本語対応のVITSモデル（ONNX形式）**

- URL: https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh
- サイズ: 約122MB
- 形式: ONNX (Sherpa-onnx WASMで直接使用可能)

**ダウンロード手順（PowerShell）:**

```powershell
# ディレクトリを作成
New-Item -ItemType Directory -Force -Path web\public\models\sherpa-onnx\vits-zh-jp

cd web\public\models\sherpa-onnx\vits-zh-jp

# ONNXモデル (122MB)
Invoke-WebRequest -Uri "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/vits-hf-zh-jp-zomehwh.onnx" -OutFile "model.onnx"

# トークンファイル
Invoke-WebRequest -Uri "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/tokens.txt" -OutFile "tokens.txt"

# 辞書ファイル
Invoke-WebRequest -Uri "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/lexicon.txt" -OutFile "lexicon.txt"
```

**ダウンロード手順（bash/WSL）:**

```bash
# ディレクトリを作成
mkdir -p web/public/models/sherpa-onnx/vits-zh-jp

cd web/public/models/sherpa-onnx/vits-zh-jp

# ONNXモデル (122MB)
curl -L -o model.onnx "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/vits-hf-zh-jp-zomehwh.onnx"

# トークンファイル
curl -L -o tokens.txt "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/tokens.txt"

# 辞書ファイル
curl -L -o lexicon.txt "https://huggingface.co/csukuangfj/vits-hf-zh-jp-zomehwh/resolve/main/lexicon.txt"
```

#### 代替案: 他のモデル

1. **Hugging Face VITS日本語モデル**
   - litagin/vits-japros-pretrained (PyTorch形式 - 変換が必要)
   - Lycoris53/Vits-TTS-Japanese-Only-* (PyTorch形式 - 変換が必要)

2. **英語モデルで動作確認**
   - まず英語モデルで動作確認してから日本語に切り替え

## セットアップ手順

### 1. WASMファイルのダウンロード

#### 方法A: 自動ダウンロード（推奨だが失敗する場合あり）

```bash
pnpm download:sherpa-onnx
```

#### 方法B: 手動ダウンロード（確実）

以下のコマンドでWASMファイルを手動ダウンロード:

```bash
# ディレクトリを作成
mkdir -p web/public/models/sherpa-onnx

# WASMファイルをダウンロード
cd web/public/models/sherpa-onnx

# JavaScriptローダー
curl -L -o sherpa-onnx-wasm-main-tts.js "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.js"

# WASMバイナリ（約12MB）
curl -L -o sherpa-onnx-wasm-main-tts.wasm "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.wasm"

# データファイル（約92MB）
curl -L -o sherpa-onnx-wasm-main-tts.data "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.data"
```

Windowsの場合（PowerShell）:

```powershell
# ディレクトリを作成
New-Item -ItemType Directory -Force -Path web\public\models\sherpa-onnx

# WASMファイルをダウンロード
cd web\public\models\sherpa-onnx

Invoke-WebRequest -Uri "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.js" -OutFile "sherpa-onnx-wasm-main-tts.js"

Invoke-WebRequest -Uri "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.wasm" -OutFile "sherpa-onnx-wasm-main-tts.wasm"

Invoke-WebRequest -Uri "https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.data" -OutFile "sherpa-onnx-wasm-main-tts.data"
```

### 2. 日本語モデルの配置

上記の手順に従って、日本語モデルファイルを以下のディレクトリに配置:

```
web/public/models/sherpa-onnx/vits-japanese/
├── model.onnx
├── config.json
├── tokens.txt
└── その他必要なファイル
```

### 3. 動作確認

Webアプリを起動して、Sherpa-onnxが正常に動作するか確認:

```bash
pnpm dev
```

ブラウザのコンソールで以下のログが表示されれば成功:

```
[Sherpa-onnx] Initializing...
[Sherpa-onnx] Loading WASM module...
[Sherpa-onnx] Initializing TTS model...
[Sherpa-onnx] TTS model loaded
[Sherpa-onnx] Initialized successfully
```

## ファイルサイズの注意

- WASMファイル: 約104MB (js + wasm + data)
- 日本語モデル: 約20-100MB（モデルによる）

合計で120-200MB程度のファイルをセルフホストすることになります。

## トラブルシューティング

### WASMファイルが見つからない

`web/public/models/sherpa-onnx/` ディレクトリにファイルが正しく配置されているか確認してください。

### モデルの読み込みに失敗する

1. ブラウザのコンソールでエラーメッセージを確認
2. モデルファイルのパスが正しいか確認
3. CORSエラーが出ていないか確認（開発サーバーでは通常問題なし）

### メモリ不足エラー

大きなモデルを使用する場合、ブラウザのメモリ制限に達する可能性があります。
より小さいモデルを使用することを検討してください。

## 代替モデル

日本語以外の言語や、異なる音声品質のモデルを使用する場合は、
`web/src/services/audio/sherpa-onnx.ts` のモデル設定を変更してください。

利用可能なモデルのリスト:
- [Sherpa-onnx Pre-trained Models](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/index.html)
- [Hugging Face VITS Models](https://huggingface.co/models?search=vits+japanese)
