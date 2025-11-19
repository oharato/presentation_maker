@echo off
REM WSL2のDockerを使ってRedisを停止するスクリプト (Windows用)

echo 🛑 Stopping Redis...
echo.

wsl docker compose down

echo.
echo ✅ Redis stopped!
echo.

pause
