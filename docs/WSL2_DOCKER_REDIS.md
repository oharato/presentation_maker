# WSL2 Docker を使った Redis 起動ガイド

## 作成したファイル

### 1. start-redis.bat (Windows用)
Windowsのコマンドプロンプトまたはエクスプローラーからダブルクリックで実行できます。

**機能:**
- WSL2のDockerを使ってRedisコンテナを起動
- 起動確認
- 使い方のヘルプ表示

### 2. stop-redis.bat (Windows用)
Redisコンテナを停止します。

### 3. start-redis.sh (Linux/WSL用)
WSL内から実行する場合のBashスクリプトです。

## 使い方

### 簡単な方法 (推奨)

**起動:**
```bash
start-redis.bat
```
または
```bash
pnpm redis:start
```

**停止:**
```bash
stop-redis.bat
```
または
```bash
pnpm redis:stop
```

**ログ確認:**
```bash
pnpm redis:logs
```

### 手動で実行

```bash
# 起動
wsl docker compose up -d

# 状態確認
wsl docker compose ps

# ログ確認
wsl docker compose logs -f redis

# 停止
wsl docker compose down
```

## トラブルシューティング

### WSLが見つからない

```bash
# WSLがインストールされているか確認
wsl --list

# インストールされていない場合
wsl --install
```

### Dockerが見つからない

WSL内でDockerをインストール:
```bash
wsl
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo service docker start
```

### ポート6379が使用中

別のRedisが起動している可能性があります:
```bash
# Windowsで確認
netstat -ano | findstr :6379

# プロセスを停止
taskkill /PID <PID> /F
```

### コンテナが起動しない

```bash
# ログを確認
wsl docker compose logs redis

# コンテナを削除して再起動
wsl docker compose down
wsl docker compose up -d
```

## Redis接続確認

```bash
# WSL内から
wsl docker exec -it presentation_maker_redis redis-cli ping
# PONG と返ってくればOK

# または、redis-cliがインストールされている場合
redis-cli -h localhost -p 6379 ping
```

## データの永続化

Redisのデータは `presentation_maker_redis_data` という名前のDockerボリュームに保存されます。

**ボリュームの確認:**
```bash
wsl docker volume ls
```

**データをクリア:**
```bash
wsl docker compose down -v
```
⚠️ 注意: `-v` オプションを付けるとデータが削除されます

## まとめ

✅ **簡単起動:**
- `start-redis.bat` をダブルクリック
- または `pnpm redis:start`

✅ **簡単停止:**
- `stop-redis.bat` をダブルクリック
- または `pnpm redis:stop`

✅ **ログ確認:**
- `pnpm redis:logs`

これでWSL2のDockerを使ってRedisを簡単に管理できます!
