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
set "RETRY=--retry 5 --retry-delay 3 --retry-all-errors"

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
  curl -L -# %RETRY% -o "%TEMP%\ktgh_py.zip" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip"
  powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\ktgh_py.zip' '%PYDIR%'"
)

REM 2. yt-dlp 引擎
if not exist "%BIN%\yt-dlp.exe" (
  echo [2/4] 下載 yt-dlp 引擎...
  curl -L -# %RETRY% -o "%BIN%\yt-dlp.exe" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
)

REM 3. ffmpeg + ffprobe（GitHub CDN；PowerShell 只解壓，複製用 cmd 較保險）
if not exist "%BIN%\ffmpeg.exe" (
  echo [3/4] 下載 ffmpeg 影音引擎（約 87MB，請稍候）...
  curl -L -# %RETRY% -o "%TEMP%\ktgh_ff.zip" "https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip"
  echo    解壓縮中...
  if exist "%TEMP%\ktgh_ff" rmdir /s /q "%TEMP%\ktgh_ff"
  powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\ktgh_ff.zip' '%TEMP%\ktgh_ff'"
  for /r "%TEMP%\ktgh_ff" %%F in (ffmpeg.exe) do copy /y "%%F" "%BIN%\ffmpeg.exe" >nul
  for /r "%TEMP%\ktgh_ff" %%F in (ffprobe.exe) do copy /y "%%F" "%BIN%\ffprobe.exe" >nul
)

REM 4. 同步最新程式（與公開網站一致）
echo [4/4] 同步最新程式...
curl -s -L %RETRY% -o "%TOOLDIR%\serve_ytdl.py" "%BASE%/serve_ytdl.py"
curl -s -L %RETRY% -o "%TOOLDIR%\media-toolkit.html" "%BASE%/media-toolkit.html"

if not exist "%PYDIR%\python.exe" (
  echo. & echo [錯誤] Python 安裝失敗，請關掉本視窗、重新雙擊本檔案再試。& pause & exit /b 1
)
if not exist "%BIN%\ffmpeg.exe" (
  echo. & echo [錯誤] ffmpeg 安裝失敗，請關掉本視窗、重新雙擊本檔案再試。& pause & exit /b 1
)
if not exist "%TOOLDIR%\serve_ytdl.py" (
  echo. & echo [錯誤] 無法下載程式，請確認網路連線後再試。& pause & exit /b 1
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
