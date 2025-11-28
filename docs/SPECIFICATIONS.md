# 仕様書 (SPECIFICATIONS)

## ファイル命名規則

### 入力ファイル (CLI / Webアプリ共通)
- **スライド**: `{番号}__{タイトル}.md`
- **台本**: `{番号}__{タイトル}.txt`

**規則:**
- `__` (アンダースコア2つ) で番号とタイトルを区切る
- 番号が一致するファイルをペアとして扱う
- タイトル部分は一致していなくても良い（番号を正とする）
- タイトルは空でも良い (例: `020__.md`)

**例:**
```
input/
├── 010__title.md
├── 010__title.txt
├── 020__introduction.md
├── 020__introduction.txt
└── 030__.md              # タイトルなし
```

### 出力ファイル (CLI)
- **音声**: `output/{番号}__{タイトル}.wav`
- **スライド画像**: `output/{番号}__{タイトル}.png`
- **無音動画**: `output/{番号}__{タイトル}.nosound.mp4`
- **結合動画**: `output/{番号}__{タイトル}.mp4`
- **最終成果物**: `output/final_presentation.mp4`

### 事前準備ファイルのサポート (CLI)

CLIモードでは、事前に準備された画像ファイルや無音動画ファイルを使用することができます。

**サポートされる事前準備ファイル:**
- **スライド画像**: `output/{番号}__{タイトル}.png`, `.jpg`, `.jpeg`
- **無音動画**: `output/{番号}__{タイトル}.nosound.mp4`

**動作:**
- スライド画像が既に存在する場合、Markdownからの画像生成をスキップします
- 無音動画が既に存在する場合、無音動画の生成をスキップします
- 存在しない場合は通常通り生成されます

**例:**
```
output/
├── 010__title.jpg       # 事前準備済み（Markdownからの生成をスキップ）
├── 020__intro.nosound.mp4  # 事前準備済み（無音動画生成をスキップ）
```

### 出力ファイル (Webアプリ / Cloudflare R2)
- **スライド動画**: `jobs/{jobId}/0{番号}__{タイトル}.mp4`
- **最終成果物**: `jobs/{jobId}/final_presentation.mp4`

## 処理フロー

### CLIモード

1. **ファイルスキャン**
   - `input/` ディレクトリをスキャン
   - 処理対象のファイルをリストアップ
   - 番号でグループ化

2. **各スライドの処理** (番号順)
   
   a. **音声生成**
   - `.txt` の内容を VOICEVOX API に送信
   - `[pause:N]` 構文を解析し、無音を挿入
   - `output/` に `.wav` として保存
   
   b. **スライド画像生成**
   - `output/` に既存の画像ファイル（`.png`, `.jpg`, `.jpeg`）がある場合はスキップ
   - ない場合、`.md` の内容を Marked でHTMLに変換
   - Puppeteer でスクリーンショット
   - `output/` に `.png` として保存
   
   c. **無音動画生成**
   - `output/` に既存の `.nosound.mp4` がある場合はスキップ
   - ない場合、生成された `.wav` の再生時間を取得
   - FFmpeg で画像をその時間分ループする動画を作成
   - `output/` に `.nosound.mp4` として保存
   
   d. **音声・動画結合**
   - `.wav` と `.nosound.mp4` を結合
   - `output/` に `.mp4` として保存
   - 生成された動画パスをリストに追加

3. **全動画結合**
   - リストに追加された動画を番号順に連結
   - `output/final_presentation.mp4` として保存

### Webアプリモード (Cloudflare)

1. **ファイルアップロード / 手動入力**
   - **ファイルアップロード (`/api/upload-folder`)**:
     - ブラウザからAPIへリクエスト
     - Markdown/ScriptをR2に保存 (`jobs/{jobId}/uploads/`)
     - ジョブIDを生成
   - **手動入力 (`/api/generate`)**:
     - ブラウザからJSONデータとしてスライド情報を送信
     - スライド内容 (Markdown/Script) はジョブデータに直接含める
     - ジョブIDを生成

2. **ジョブキューに追加**
   - Durable Object (JobQueue) にジョブを追加
   - クライアントに jobId を返却

3. **ワーカーによる処理 (Cloudflare Container)**
   - Video Worker コンテナが定期的にポーリング (Cron Trigger / Loop)
   - ジョブを取得
   - **素材取得**:
     - ジョブデータにコンテンツが含まれる場合はそれを使用 (手動入力時)
     - 含まれない場合はR2からダウンロード (`jobs/{jobId}/uploads/`)
   - 各スライドを順次処理 (Puppeteer, VOICEVOX, FFmpeg)
   - 生成された動画をR2にアップロード (`jobs/{jobId}/`)
   - 進捗をAPI経由でDurable Objectに通知

4. **完了通知**
   - クライアントはAPIをポーリングまたはWebSocketで状態監視
   - 完了時、R2の署名付きURLまたは公開URLを取得して動画を表示

## データフォーマット

### スライドデータ (内部)
```typescript
interface Slide {
  id: string;           // スライド番号
  markdown: string;     // Markdownコンテンツ
  script: string;       // トークスクリプト
  title?: string;       // スライドタイトル
}
```

### ジョブデータ (API)
```typescript
interface VideoJobData {
  jobId: string;
  data: {
    slides: Slide[];
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}
```

### 進捗データ (API)
```typescript
interface JobProgress {
  jobId: string;
  status: string;
  progress: number;     // 0-100
  message: string;      // "Processing slide 2/5"
  videoUrl?: string;    // 完了時のみ
}
```

## 音声合成仕様

### サーバー側: VOICEVOX (Container)
- **URL**: 環境変数 `VOICEVOX_URL` で指定 (例: `http://voicevox:50021`)
- **エンドポイント**:
  - `POST /audio_query`
  - `POST /synthesis`
- **出力形式**: WAV

### ブラウザ側: Sherpa-onnx (WASM)
- (変更なし)

### ブラウザ側: Transformers.js
- (変更なし)

## クライアント側データ永続化
- (変更なし)

## スライドレンダリング仕様
- (変更なし)

## 動画生成仕様
- (変更なし)

## エラーハンドリング

### CLIモード
- (変更なし)

### Webアプリモード (Cloudflare)
- **ファイルアップロードエラー**:
  - 400 Bad Request
  
- **ジョブ処理エラー**:
  - コンテナ内でキャッチし、ジョブステータスを `failed` に更新
  - エラーメッセージを保存
  
- **コンテナエラー**:
  - メモリ不足 (OOM) 等は Cloudflare ログで確認
  - 自動再起動 (Cron/Platform)

## パフォーマンス最適化

### 並列処理
- Cloudflare Containersはインスタンス数をスケール可能
- Durable Objectがジョブを適切に分配 (現在はFIFOキュー)

### キャッシング
- R2へのアクセスを最小限に
- 生成済み動画の再利用 (ジョブIDベース)

### ファイルクリーンアップ
- コンテナ内の一時ファイルはジョブ完了時に削除
- R2の一時ファイル (Markdown/Script) はライフサイクルルールで削除 (要設定)

## セキュリティ

### 入力検証
- ファイルサイズ制限
- Markdownサニタイズ

### アクセス制御
- R2バケットは非公開 (Worker経由または署名付きURL)
- APIトークンによる内部API保護 (`CONTAINER_API_TOKEN`)

## 互換性
- (変更なし)

## 制限事項

### Cloudflare Containers
- **メモリ制限**: インスタンスタイプによる (lite: 256MB ~ standard-4: 12GB)
- **実行時間**: リクエスト処理時間ではなく、コンテナの稼働時間に課金
- **コールドスタート**: コンテナ起動に時間がかかる場合がある

### 既知の問題
- Puppeteerのメモリ消費量が大きい (standard-1以上推奨)

