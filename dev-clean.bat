@echo off
echo Cleaning up Node.js processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo Node.js processes terminated.
) else (
    echo No Node.js processes found.
)

echo Starting development servers...
pnpm dev
