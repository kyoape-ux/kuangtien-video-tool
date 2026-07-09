@echo off
chcp 65001 >nul 2>&1
title 光田影片下載工具
setlocal enabledelayedexpansion

set "TOOLDIR=%USERPROFILE%\ktgh-video-tool"
set "BIN=%TOOLDIR%\bin"
set "PORT=8765"
set "BASE=https://kyoape-ux.github.io"
set "PAGEURL=http://localhost:%PORT%/media-toolkit.html"
set "PYDIR=%BIN%\python"

if not exist "%BIN%" mkdir "%BIN%" 2>nul
cd /d "%TOOLDIR%"

REM 服務已在跑就直接開網頁
curl -s -o nul --max-time 2 "http://localhost:%PORT%/api/ytdl/health"
if not errorlevel 1 (
  echo 服務已在執行中，開啟網頁...
  start "" "%PAGEURL%"
  exit /b
)

echo.
echo   光田影片下載工具 安裝／啟動中，第一次約需 1-2 分鐘...
echo.

REM 1. Python 綠色版（免安裝）
if not exist "%PYDIR%\python.exe" (
  echo [1/4] 下載 Python 綠色版...
  curl -L -# -o "%TEMP%\ktgh_py.zip" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip"
  powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\ktgh_py.zip' '%PYDIR%'"
)

REM 2. yt-dlp 引擎
if not exist "%BIN%\yt-dlp.exe" (
  echo [2/4] 下載 yt-dlp 引擎...
  curl -L -# -o "%BIN%\yt-dlp.exe" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
)

REM 3. ffmpeg + ffprobe
if not exist "%BIN%\ffmpeg.exe" (
  echo [3/4] 下載 ffmpeg 影音引擎...
  curl -L -# -o "%TEMP%\ktgh_ff.zip" "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
  powershell -NoProfile -Command "$d=Join-Path $env:TEMP 'ktgh_ff'; Expand-Archive -Force (Join-Path $env:TEMP 'ktgh_ff.zip') $d; $f=Get-ChildItem $d -Recurse -Filter ffmpeg.exe ^| Select-Object -First 1; Copy-Item $f.FullName (Join-Path '%BIN%' 'ffmpeg.exe'); Copy-Item (Join-Path $f.DirectoryName 'ffprobe.exe') (Join-Path '%BIN%' 'ffprobe.exe')"
)

REM 4. 同步最新程式（與公開網站一致）
echo [4/4] 同步最新程式...
curl -s -L -o "%TOOLDIR%\serve_ytdl.py" "%BASE%/serve_ytdl.py"
curl -s -L -o "%TOOLDIR%\media-toolkit.html" "%BASE%/media-toolkit.html"

if not exist "%PYDIR%\python.exe" (
  echo. & echo [錯誤] Python 下載或解壓失敗，請確認網路後重試。& pause & exit /b 1
)
if not exist "%TOOLDIR%\serve_ytdl.py" (
  echo. & echo [錯誤] 無法下載程式，請確認網路連線後再試一次。& pause & exit /b 1
)

REM 3 秒後自動開啟瀏覽器
start "" cmd /c "timeout /t 3 >nul & start "" "%PAGEURL%""

echo.
echo ==========================================
echo   影片下載服務啟動中（連接埠 %PORT%）
echo   關閉此視窗即停止服務
echo ==========================================
echo.
"%PYDIR%\python.exe" "%TOOLDIR%\serve_ytdl.py" %PORT% "%TOOLDIR%"
echo.
echo 服務已停止。按任意鍵關閉視窗。
pause >nul
