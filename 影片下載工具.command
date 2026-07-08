#!/bin/zsh
# ══════════════════════════════════════════════════════
#  影音小助手 · 影片下載工具（安裝＋啟動 二合一）
#
#  給同事／新電腦：把這個檔案傳過去，雙擊即可——
#  第一次會自動下載引擎（約 1 分鐘），之後雙擊直接啟動。
#  不需要 Homebrew、不需要打任何指令。
#
#  第一次打不開？在檔案上按右鍵 → 打開 → 再按一次「打開」
#  （macOS 對下載的檔案的一次性安全確認）
# ══════════════════════════════════════════════════════

TOOLDIR="${YTDL_TOOLDIR:-$HOME/影片下載工具}"
BIN="$TOOLDIR/bin"
PORT=8765
BASE="https://kyoape-ux.github.io"
URL="http://localhost:${PORT}/media-toolkit.html"

mkdir -p "$BIN"
cd "$TOOLDIR"

# ── 0. 若服務已在跑，直接開網頁 ──
if lsof -ti:${PORT} >/dev/null 2>&1; then
  echo "服務已在執行中，直接開啟網頁…"
  open "$URL"
  exit 0
fi

# ── 1. 檢查 python3（macOS 內建，但可能要先裝命令列工具）──
if ! /usr/bin/python3 -c 'print()' >/dev/null 2>&1; then
  echo "此電腦還沒有 Python（macOS 內建元件）。"
  echo "螢幕上會跳出安裝視窗，請按「安裝」，完成後再雙擊本檔案一次。"
  xcode-select --install >/dev/null 2>&1
  echo "（按任意鍵關閉）"; read -k1; exit 1
fi

# ── 2. 第一次使用：下載獨立引擎（免 Homebrew）──
ARCH=$(uname -m)   # arm64 (Apple Silicon) 或 x86_64 (Intel)
if [ ! -x "$BIN/yt-dlp" ]; then
  echo "① 下載 yt-dlp 引擎（官方獨立版）…"
  curl -L --progress-bar -o "$BIN/yt-dlp" \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
  chmod +x "$BIN/yt-dlp"
fi
for tool in ffmpeg ffprobe; do
  if [ ! -x "$BIN/$tool" ]; then
    echo "② 下載 $tool（影音處理引擎）…"
    curl -L --progress-bar -o "$BIN/$tool.zip" \
      "https://ffmpeg.martin-riedl.de/redirect/latest/macos/${ARCH}/release/${tool}.zip"
    unzip -oq "$BIN/$tool.zip" -d "$BIN"
    rm -f "$BIN/$tool.zip"
    chmod +x "$BIN/$tool"
  fi
done

# ── 3. 每次啟動都同步最新版網頁與服務程式（跟公開網站保持一致）──
echo "③ 同步最新版程式…"
curl -sfL -o "$TOOLDIR/serve_ytdl.py.new" "$BASE/serve_ytdl.py" \
  && mv "$TOOLDIR/serve_ytdl.py.new" "$TOOLDIR/serve_ytdl.py" \
  || echo "   （離線或下載失敗，沿用現有版本）"
curl -sfL -o "$TOOLDIR/media-toolkit.html.new" "$BASE/media-toolkit.html" \
  && mv "$TOOLDIR/media-toolkit.html.new" "$TOOLDIR/media-toolkit.html" \
  || true
if [ ! -f "$TOOLDIR/serve_ytdl.py" ]; then
  echo "❗ 第一次安裝需要網路連線，請連網後再試。"
  echo "（按任意鍵關閉）"; read -k1; exit 1
fi

# ── 4. 每 7 天自動更新 yt-dlp（背景執行，不拖慢啟動）──
STAMP="$TOOLDIR/.last_update"
if [ ! -f "$STAMP" ] || [ $(( $(date +%s) - $(stat -f %m "$STAMP" 2>/dev/null || echo 0) )) -gt 604800 ]; then
  echo "（背景檢查引擎更新中，不影響使用…）"
  ( "$BIN/yt-dlp" -U >/dev/null 2>&1; touch "$STAMP" ) &
fi

# ── 5. 啟動服務並開啟網頁 ──
echo ""
echo "═══════════════════════════════════════"
echo "  影片下載服務啟動中（port ${PORT}）"
echo "  關閉此視窗即停止服務"
echo "═══════════════════════════════════════"
( sleep 2 && open "$URL" ) &
exec /usr/bin/python3 "$TOOLDIR/serve_ytdl.py" ${PORT} "$TOOLDIR"
