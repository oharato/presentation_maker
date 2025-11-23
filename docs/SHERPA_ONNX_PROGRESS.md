# Sherpa-onnx ブラウザWASM実装 - 進捗状況

## 完了した作業

### 1. WASMファイルのセルフホスト ✅

以下のファイルをダウンロードし、`web/public/models/sherpa-onnx/` に配置しました:

- `sherpa-onnx-wasm-main-tts.js` (約120KB) - JavaScriptローダー
- `sherpa-onnx-wasm-main-tts.wasm` (約12MB) - WASMバイナリ
- `sherpa-onnx-wasm-main-tts.data` (約92MB) - データファイル

合計約104MBのファイルをセルフホストしています。

### 2. 日本語ONNXモデルのダウンロード ✅

**csukuangfj/vits-hf-zh-jp-zomehwh** モデルをダウンロード:

- `model.onnx` (約122MB) - ONNX形式のVITSモデル
- `tokens.txt` (268 Bytes) - トークンファイル
- `lexicon.txt` (約782KB) - 辞書ファイル

配置場所: `web/public/models/sherpa-onnx/vits-zh-jp/`

このモデルは中国語と日本語の両方に対応しています。

### 3. Sherpa-onnx サービス実装 ✅

`web/src/services/audio/sherpa-onnx.ts` に以下の機能を実装:

- WASMモジュールの動的ロード
- 日本語ONNXモデルの初期化
- 音声生成（プレースホルダー機能付き）
- WAVファイル生成

### 4. ドキュメント作成 ✅

- `docs/SHERPA_ONNX_SETUP.md` - セットアップガイド（更新）
- `docs/SHERPA_ONNX_PROGRESS.md` - 進捗状況（このファイル）
- ダウンロードスクリプト `scripts/download-sherpa-onnx.js`
- `.gitignore` に大きなモデルファイルを追加

## 未完了の作業

### 1. 動作確認とデバッグ ⏳

ブラウザでの実際の動作確認が必要です:

1. **WASMモジュールのロード確認**
   - `Module` 関数が正しく呼び出されるか
   - `createOfflineTts` 関数が利用可能か

2. **モデルの初期化確認**
   - ONNXモデルが正しく読み込まれるか
   - 辞書ファイルとトークンファイルが正しく参照されるか

3. **音声生成のテスト**
   - 日本語テキストから音声が生成されるか
   - WAVファイルが正しく作成されるか

#### 必要なファイル:

```
web/public/models/sherpa-onnx/vits-piper-ja_JP-misaki-low/
├── ja_JP-misaki-low.onnx
├── ja_JP-misaki-low.onnx.json
├── tokens.txt
└── espeak-ng-data/ (ディレクトリ)
```

#### ダウンロード方法:

1. **Piper Voicesから直接ダウンロード**:
   - https://huggingface.co/rhasspy/piper-voices
   - 日本語モデルを探す（`ja/ja_JP/`）

2. **Sherpa-onnx公式モデルを使用**:
   - https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
   - 日本語対応モデルを探す

3. **代替案: 英語モデルで動作確認**:
   - 英語モデルを先にダウンロードして動作確認
   - その後、日本語モデルに切り替え

### 2. モデル設定の調整 ⏳

`web/src/services/audio/sherpa-onnx.ts` の `initializeTTS()` メソッドで、
モデルファイルのパスを実際のファイルに合わせて設定する必要があります。

現在の設定（プレースホルダー）:
```typescript
const modelConfig = {
    vits: {
        model: '',  // 空 = 組み込みモデル（存在しない）
        tokens: '',
        dataDir: '',
        // ...
    },
    // ...
};
```

日本語モデル使用時の設定例:
```typescript
const modelConfig = {
    vits: {
        model: '/models/sherpa-onnx/vits-piper-ja_JP-misaki-low/ja_JP-misaki-low.onnx',
        tokens: '/models/sherpa-onnx/vits-piper-ja_JP-misaki-low/tokens.txt',
        dataDir: '/models/sherpa-onnx/vits-piper-ja_JP-misaki-low/espeak-ng-data',
        lengthScale: 1.0,
        noiseScale: 0.667,
        noiseScaleW: 0.8,
    },
    modelDir: '',
    maxNumSentences: 1,
    debug: 1,
};
```

### 3. テストの作成 ⏳

Sherpa-onnxサービスの単体テストを作成:

- `web/src/services/audio/__tests__/sherpa-onnx.test.ts`

## 現在の動作状況

### プレースホルダーモード

現在、日本語モデルがないため、以下の動作をします:

1. WASMモジュールのロードは成功
2. TTSモデルの初期化は失敗（モデルファイルがないため）
3. プレースホルダーモードにフォールバック
4. 音声生成時は単純なビープ音を生成

### 期待される動作（モデル配置後）

1. WASMモジュールのロードが成功
2. TTSモデルの初期化が成功
3. 日本語テキストから音声を生成
4. WAVファイルとして返す

## 次のステップ

### 優先度: 高

1. **日本語モデルのダウンロード**
   - Hugging Faceから適切な日本語モデルを探す
   - `web/public/models/sherpa-onnx/` に配置

2. **モデル設定の更新**
   - `sherpa-onnx.ts` のモデルパスを実際のファイルに合わせる

3. **動作確認**
   - Webアプリを起動
   - ブラウザコンソールでログを確認
   - 実際に音声生成をテスト

### 優先度: 中

4. **テストの作成**
   - 単体テストを作成
   - モックを使用してWASMなしでもテスト可能にする

5. **エラーハンドリングの改善**
   - より詳細なエラーメッセージ
   - リトライ機能

### 優先度: 低

6. **パフォーマンス最適化**
   - モデルのキャッシュ
   - 並列処理

7. **UI改善**
   - 初期化状態の表示
   - プログレスバー

## トラブルシューティング

### WASMファイルが見つからない

```
Error: Failed to load WASM script
```

→ `web/public/models/sherpa-onnx/` にファイルが存在するか確認

### モデルファイルが見つからない

```
[Sherpa-onnx] TTS instance creation returned null
```

→ モデルファイルをダウンロードして配置

### メモリ不足

```
RuntimeError: memory access out of bounds
```

→ より小さいモデル（`low`品質）を使用

## 参考リンク

- [Sherpa-onnx GitHub](https://github.com/k2-fsa/sherpa-onnx)
- [Sherpa-onnx ドキュメント](https://k2-fsa.github.io/sherpa/onnx/)
- [Piper Voices](https://huggingface.co/rhasspy/piper-voices)
- [Hugging Face TTS Demo](https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en)
