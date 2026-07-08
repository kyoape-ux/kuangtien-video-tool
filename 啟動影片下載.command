#!/bin/zsh
# ─────────────────────────────────────────────
#  影音小助手 · 影片下載服務 一鍵啟動器
#  雙擊本檔案即可：啟動本機服務 → 自動開啟網頁
# ─────────────────────────────────────────────
cd "$(dirname "$0")"

PORT=8765
URL="http://localhost:${PORT}/media-toolkit.html"

# 確保找得到 Homebrew 安裝的 yt-dlp / ffmpeg
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "❗ 找不到 yt-dlp，請先在終端機執行：brew install yt-dlp"
  echo "（按任意鍵關閉）"; read -k1; exit 1
fi

# ── 每 7 天自動更新 yt-dlp（背景執行，不拖慢啟動）──
# YouTube 會定期改版反下載機制，yt-dlp 靠更新跟上；引擎舊了才會壞
STAMP="$HOME/.ytdlp_last_update"
if [ ! -f "$STAMP" ] || [ $(( $(date +%s) - $(stat -f %m "$STAMP" 2>/dev/null || echo 0) )) -gt 604800 ]; then
  echo "（背景檢查 yt-dlp 更新中，不影響使用…）"
  ( brew upgrade yt-dlp >/dev/null 2>&1; touch "$STAMP" ) &
fi

# 若服務已在跑，直接開網頁就好
if lsof -ti:${PORT} >/dev/null 2>&1; then
  echo "服務已在執行中，直接開啟網頁…"
  open "$URL"
  exit 0
fi

echo "═══════════════════════════════════════"
echo "  影片下載服務啟動中（port ${PORT}）"
echo "  關閉此視窗即停止服務"
echo "═══════════════════════════════════════"

# 2 秒後自動開啟網頁（等服務起來）
( sleep 2 && open "$URL" ) &

exec python3 serve_ytdl.py ${PORT}
