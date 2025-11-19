# テストコード

## 概要
このプロジェクトでは、サービス層のユニットテストを実装しています。

## 実装済みテスト

### サービス層テスト

#### 1. VoicevoxService テスト
**ファイル**: `tests/services/voicevox.test.ts`

**テスト内容:**
- シンプルなテキストの音声生成
- `[pause:N]` 構文を含むテキストの処理
- VOICEVOX API のモック
- FFmpeg のモック

#### 2. SlideRenderer テスト
**ファイル**: `tests/services/slide_renderer.test.ts`

**テスト内容:**
- Markdownからスライド画像への変換
- Puppeteer のモック
- Marked のモック

#### 3. VideoGenerator テスト
**ファイル**: `tests/services/video_generator.test.ts`

**テスト内容:**
- 無音動画の生成
- 音声と動画のマージ
- 音声の長さ取得
- 動画の連結
- FFmpeg のモック

## サーバーテスト (準備中)

以下のテストファイルを作成しましたが、複雑なモックが必要なため、現在は実行をスキップしています:

### 1. Queue テスト
**ファイル**: `tests/server/queue.test.ts`

**テスト内容:**
- ジョブデータ構造の検証
- 進捗データ構造の検証

### 2. API Routes テスト
**ファイル**: `tests/server/api.test.ts`

**テスト内容:**
- ファイル命名パターンの検証
- スライドIDの解析
- ファイルのグループ化ロジック
- レスポンス構造の検証

### 3. Video Worker テスト
**ファイル**: `tests/server/videoWorker.test.ts`

**テスト内容:**
- 進捗計算ロジック
- 出力ファイルパスの生成
- デフォルト期間の処理
- 複数スライドの進捗計算

## テスト実行

### 全テスト実行
```bash
pnpm test
```

### ウォッチモード
```bash
pnpm test:watch
```

### カバレッジ
```bash
pnpm test -- --coverage
```

## テスト結果

```
Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        ~7s
```

## モック戦略

### axios (HTTP Client)
- VOICEVOX API呼び出しをモック
- レスポンスデータを固定値で返却

### fs-extra (File System)
- ファイル読み書きをモック
- 実際のファイルシステムに触れない

### fluent-ffmpeg (FFmpeg)
- FFmpegコマンド実行をモック
- イベント（`end`, `error`）を手動でトリガー
- 非同期処理をシミュレート

### puppeteer (Browser Automation)
- ブラウザ起動をモック
- スクリーンショット処理をモック

### marked (Markdown Parser)
- Markdown → HTML変換をモック

## 今後の課題

### 統合テスト
- [ ] Hono API の統合テスト
- [ ] Bull Queue の統合テスト
- [ ] Video Worker の統合テスト
- [ ] Socket.IO の統合テスト

### E2Eテスト
- [ ] Webアプリの E2E テスト (Playwright)
- [ ] ファイルアップロードフロー
- [ ] 手動入力フロー
- [ ] 動画生成フロー

### パフォーマンステスト
- [ ] 大量スライドの処理
- [ ] 並列ジョブ処理
- [ ] メモリ使用量の測定

## テスト設定

### jest.config.js
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(marked|glob)/)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/server/', // サーバーテストは準備中
  ],
};
```

## トラブルシューティング

### ESMモジュールのエラー
`marked` や `glob` などのESMモジュールは `transformIgnorePatterns` で明示的に変換対象に含める必要があります。

### タイムアウトエラー
非同期処理が多いテストでは `jest.setTimeout()` でタイムアウトを延長します:
```typescript
jest.setTimeout(10000); // 10秒
```

### モックが機能しない
モックは各テストの `beforeEach` で初期化し、`afterEach` でクリアします:
```typescript
beforeEach(() => {
    jest.clearAllMocks();
});
```

## 参考リンク

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
