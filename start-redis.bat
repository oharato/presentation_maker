@echo off
REM WSL2のDockerを使ってRedisを起動するスクリプト (Windows用)

echo 🚀 Starting Redis with WSL2 Docker...
echo.

REM WSL2でdocker composeを実行
wsl docker compose up -d

echo.
echo ⏳ Waiting for Redis to be ready...
timeout /t 2 /nobreak >nul

REM 起動確認
wsl docker compose ps

echo.
echo ✅ Redis is running!
echo    Container: presentation_maker_redis
echo    Port: 6379
echo.
echo 📝 To check logs:
echo    wsl docker compose logs -f redis
echo.
echo 🛑 To stop Redis:
echo    wsl docker compose down
echo.

pause
