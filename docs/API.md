# プレゼンテーション動画制作アプリ - API仕様

## ベースURL

- 開発環境: `http://localhost:3000`
- Socket.IO: `http://localhost:3001`

## REST API

### POST /api/upload-folder

ローカルフォルダからファイルをアップロードして動画生成ジョブを作成します。

**リクエスト:**
- Content-Type: `multipart/form-data`
- Body: 
  - `files`: File[] - `.md`と`.txt`ファイルの配列

**レスポンス:**
```json
{
  "jobId": "uuid-string",
  "slidesCount": 3
}
```

**エラー:**
- 400: ファイルがアップロードされていない、または有効なスライドファイルが見つからない
- 500: アップロード失敗

---

### POST /api/generate

手動入力からスライドデータを送信して動画生成ジョブを作成します。

**リクエスト:**
```json
{
  "slides": [
    {
      "id": "1",
      "markdown": "# タイトル\n\n- ポイント1",
      "script": "こんにちは。[pause:1.0]今日は..."
    }
  ]
}
```

**レスポンス:**
```json
{
  "jobId": "uuid-string"
}
```

**エラー:**
- 400: 無効なスライドデータ
- 500: 生成失敗

---

### GET /api/jobs/:jobId

ジョブのステータスを取得します。

**パラメータ:**
- `jobId`: string - ジョブID

**レスポンス:**
```json
{
  "jobId": "uuid-string",
  "state": "completed",
  "progress": 100,
  "result": {
    "videoUrl": "/videos/uuid_final.mp4"
  }
}
```

**ステータス:**
- `waiting`: キュー待機中
- `active`: 処理中
- `completed`: 完了
- `failed`: 失敗

**エラー:**
- 404: ジョブが見つからない
- 500: ステータス取得失敗

---

## Socket.IO イベント

### クライアント → サーバー

#### join:job

ジョブルームに参加して進捗通知を受け取ります。

```typescript
socket.emit('join:job', { jobId: 'uuid-string' });
```

---

### サーバー → クライアント

#### job:progress

ジョブの進捗を通知します。

```typescript
{
  jobId: string;
  progress: number; // 0-100
  message: string; // "Processing slide 2/5"
}
```

#### job:completed

ジョブが完了したことを通知します。

```typescript
{
  jobId: string;
  videoUrl: string; // "/videos/uuid_final.mp4"
}
```

#### job:failed

ジョブが失敗したことを通知します。

```typescript
{
  jobId: string;
  error: string;
}
```

---

## データ型

### Slide

```typescript
interface Slide {
  id: string;
  markdown: string;
  script: string;
}
```

### JobProgress

```typescript
interface JobProgress {
  jobId: string;
  progress: number;
  message: string;
}
```

### VideoJobData

```typescript
interface VideoJobData {
  jobId: string;
  slides: Slide[];
}
```

---

## ファイル命名規則

アップロードするファイルは以下の命名規則に従う必要があります:

- Markdownファイル: `{番号}__{タイトル}.md`
- スクリプトファイル: `{番号}__{タイトル}.txt`

例:
- `010__title.md`
- `010__title.txt`
- `020__introduction.md`
- `020__introduction.txt`

番号が一致するファイルが1つのスライドとしてグループ化されます。

---

## エラーハンドリング

すべてのAPIエンドポイントは以下の形式でエラーを返します:

```json
{
  "error": "エラーメッセージ"
}
```

HTTPステータスコード:
- 400: リクエストが不正
- 404: リソースが見つからない
- 500: サーバーエラー
