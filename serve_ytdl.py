#!/usr/bin/env python3
"""
影音小助手 — YouTube 下載本機服務
================================

在本機啟動一個小型 HTTP 伺服器：
  1. 以 COOP/COEP 標頭同源提供 media-toolkit.html（ffmpeg.wasm 需要）
  2. 提供 yt-dlp 後端 API，讓「YouTube 下載」卡片可解析並下載 mp4 / mp3

用法：
    python3 serve_ytdl.py [port] [dir]
    # 例：python3 serve_ytdl.py 8765 .
    # 然後瀏覽 http://localhost:8765/media-toolkit.html

依賴：yt-dlp、ffmpeg（皆已於本機安裝；brew install yt-dlp ffmpeg）
純標準函式庫，不需 pip 安裝額外套件。
"""
import http.server
import socketserver
import json
import os
import sys
import shutil
import tempfile
import subprocess
import threading
import urllib.parse

# ── 解析工具路徑（Finder 啟動時 PATH 可能缺 /opt/homebrew/bin）──
def _resolve(name):
    p = shutil.which(name)
    if p:
        return p
    for cand in (f'/opt/homebrew/bin/{name}', f'/usr/local/bin/{name}'):
        if os.path.exists(cand):
            return cand
    return name  # 交給系統，失敗時再回報

YTDLP = _resolve('yt-dlp')
FFMPEG = _resolve('ffmpeg')
FFMPEG_DIR = os.path.dirname(FFMPEG) if os.path.sep in FFMPEG else None

# 共用穩健性參數（retries / fragment-retries：斷線自動重試）
COMMON_ARGS = [
    '--no-warnings', '--no-playlist',
    '--retries', '5', '--fragment-retries', '10',
]

# YouTube 通道遞補順序：
#  1. 預設 client → 格式最齊全（1080p 以上都在這）
#  2. android → 預設被 403 節流時的備援（可能只剩低畫質，仍勝於失敗）
#  3. web_safari → HLS 備援
# YouTube 會輪流對不同通道做實驗（如 SABR-only），單押任何一個都會壞。
CLIENT_TRIES = [
    [],
    ['--extractor-args', 'youtube:player_client=android,web'],
    ['--extractor-args', 'youtube:player_client=web_safari'],
]


def _human_size(n):
    if not n or n <= 0:
        return None
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024:
            return f'{n:.1f}{unit}' if unit != 'B' else f'{int(n)}B'
        n /= 1024
    return f'{n:.1f}TB'


def _friendly_error(raw):
    """把 yt-dlp 的錯誤翻成使用者看得懂的訊息。"""
    low = raw.lower()
    if 'login required' in low or 'log in' in low or 'rate-limit' in low or 'not logged in' in low:
        return '此內容需要登入才能存取（私人帳號、限時動態或被平台限流）。目前僅支援公開影片。'
    if 'private' in low:
        return '這是私人影片，無法下載。'
    if 'unavailable' in low or 'removed' in low:
        return '影片不存在或已被移除。'
    if 'unsupported url' in low:
        return '不支援這個網址。請貼影片本身的連結（YouTube / Facebook / Instagram）。'
    if 'unable to obtain file audio codec' in low:
        return '這部影片沒有聲音軌，無法轉成 MP3。'
    return raw


def build_info(url):
    """呼叫 yt-dlp -J 取得 metadata，整理成前端好用的畫質清單（多通道遞補）。"""
    last_err = '解析失敗'
    data = None
    for client_args in CLIENT_TRIES:
        cmd = [YTDLP, '-J'] + COMMON_ARGS + client_args + [url]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            break
        last_err = (proc.stderr or proc.stdout or last_err).strip().splitlines()[-1]
    if data is None:
        raise RuntimeError(_friendly_error(last_err))

    duration = data.get('duration') or 0
    formats = data.get('formats') or []

    # 找出最佳純音訊（估算合併後大小 & mp3 來源）
    best_audio = 0
    for f in formats:
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
            sz = f.get('filesize') or f.get('filesize_approx') or 0
            if not sz and f.get('abr') and duration:
                sz = f['abr'] * 1000 / 8 * duration
            best_audio = max(best_audio, sz or 0)

    # 依高度歸納可用影片畫質（取每個高度中檔案最小的 mp4/avc 優先）
    # FB 等平台的格式常無 height、只有 sd/hd 之類的 format_id → 以 format_id 呈現
    by_h = {}
    no_height = {}
    for f in formats:
        if f.get('vcodec') == 'none':
            continue
        sz = f.get('filesize') or f.get('filesize_approx') or 0
        if not sz and f.get('tbr') and duration:
            sz = f['tbr'] * 1000 / 8 * duration
        h = f.get('height')
        if h:
            prev = by_h.get(h)
            # 優先 mp4/avc1（相容性最好），其次比較是否已有資料
            is_mp4 = (f.get('ext') == 'mp4') and str(f.get('vcodec', '')).startswith('avc')
            if prev is None or (is_mp4 and not prev['mp4']) or (sz and not prev['size']):
                by_h[h] = {'height': h, 'width': f.get('width'),
                           'size': sz, 'mp4': is_mp4}
        else:
            fid = f.get('format_id') or 'video'
            label = (f.get('format_note') or fid).upper()
            no_height[fid] = {'label': label, 'size': sz}

    video_opts = []
    for h in sorted(by_h, reverse=True):
        e = by_h[h]
        total = (e['size'] or 0) + (best_audio or 0)
        # 畫質慣例以「短邊」為準：直式 1080×1920 應叫 1080p 而非 1920p
        eff = min(e['width'], h) if e.get('width') else h
        tag = ' (4K)' if eff >= 2160 else (' (2K)' if eff >= 1440 else '')
        video_opts.append({
            'quality': h,
            'label': f'{eff}p{tag}',
            'sizeText': _human_size(total),
        })
    if not video_opts:
        # 無高度資訊時退回 format_id 清單（hd 排前面）
        for fid in sorted(no_height, key=lambda k: no_height[k]['label'], reverse=False):
            video_opts.append({
                'quality': fid,
                'label': no_height[fid]['label'],
                'sizeText': _human_size(no_height[fid]['size']),
            })
        video_opts.sort(key=lambda o: {'HD': 0, 'SD': 1}.get(o['label'], 2))

    audio_opts = [
        {'quality': '320', 'label': '320k (.mp3)',
         'sizeText': _human_size(320 * 1000 / 8 * duration) if duration else None},
        {'quality': '128', 'label': '128k (.mp3)',
         'sizeText': _human_size(128 * 1000 / 8 * duration) if duration else None},
    ]

    return {
        'ok': True,
        'title': data.get('title') or '',
        'uploader': data.get('uploader') or data.get('channel') or '',
        'duration': duration,
        'durationText': data.get('duration_string') or '',
        'thumbnail': data.get('thumbnail') or '',
        'video': video_opts,
        'audio': audio_opts,
    }


def run_download(url, kind, quality, outdir):
    """下載到 outdir，回傳最終檔案路徑（多通道遞補：預設→android→web_safari）。"""
    out_tmpl = os.path.join(outdir, '%(title).100B.%(ext)s')

    if kind == 'audio':
        aq = '0' if str(quality) == '320' else f'{quality}K'
        tail = ['-x', '--audio-format', 'mp3', '--audio-quality', aq, url]
    else:
        q = str(quality)
        if q.isdigit():
            fmt = (f'bv*[height<={q}][ext=mp4]+ba[ext=m4a]/'
                   f'bv*[height<={q}]+ba/b[height<={q}]/b')
        else:
            # FB 等平台的 sd/hd 直接用 format_id（多半已含音訊）
            fmt = f'{q}+ba/{q}/b'
        tail = ['-f', fmt, '--merge-output-format', 'mp4', url]

    last_err = '下載失敗'
    for client_args in CLIENT_TRIES:
        # 清掉上一輪的殘檔，避免撿到失敗的半成品
        for f in os.listdir(outdir):
            try:
                os.remove(os.path.join(outdir, f))
            except OSError:
                pass

        base = [YTDLP] + COMMON_ARGS + client_args + \
               ['--no-part', '-o', out_tmpl, '--windows-filenames']
        if FFMPEG_DIR:
            base += ['--ffmpeg-location', FFMPEG_DIR]

        proc = subprocess.run(base + tail, capture_output=True, text=True, timeout=1800)
        if proc.returncode == 0:
            files = [f for f in os.listdir(outdir) if not f.startswith('.')]
            if files:
                files.sort(key=lambda f: os.path.getsize(os.path.join(outdir, f)),
                           reverse=True)
                return os.path.join(outdir, files[0])
            last_err = '下載完成但找不到輸出檔'
        else:
            last_err = (proc.stderr or proc.stdout or last_err).strip().splitlines()[-1]
            # 無聲音軌之類的內容問題，換通道也不會好 → 直接回報
            if 'unable to obtain file audio codec' in last_err.lower():
                break

    raise RuntimeError(_friendly_error(last_err))


class Handler(http.server.SimpleHTTPRequestHandler):
    # ── COOP/COEP：讓 media-toolkit 的 ffmpeg.wasm(SharedArrayBuffer) 可用 ──
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        super().end_headers()

    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw or b'{}')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip('/') == '/api/ytdl/health':
            ver = None
            try:
                ver = subprocess.run([YTDLP, '--version'], capture_output=True,
                                     text=True, timeout=10).stdout.strip()
            except Exception:
                pass
            self._send_json({
                'ok': bool(ver),
                'ytdlp': ver,
                'ffmpeg': bool(shutil.which(FFMPEG) or os.path.exists(FFMPEG)),
            })
            return
        return super().do_GET()

    def do_POST(self):
        try:
            if self.path.rstrip('/') == '/api/ytdl/info':
                body = self._read_json()
                url = (body.get('url') or '').strip()
                if not url:
                    return self._send_json({'ok': False, 'error': '請輸入網址'}, 400)
                return self._send_json(build_info(url))

            if self.path.rstrip('/') == '/api/ytdl/download':
                body = self._read_json()
                url = (body.get('url') or '').strip()
                kind = body.get('kind') or 'video'
                quality = body.get('quality')
                if not url or quality is None:
                    return self._send_json({'ok': False, 'error': '參數不足'}, 400)
                tmpdir = tempfile.mkdtemp(prefix='ytdl_')
                try:
                    path = run_download(url, kind, quality, tmpdir)
                    self._stream_file(path)
                finally:
                    shutil.rmtree(tmpdir, ignore_errors=True)
                return

            self._send_json({'ok': False, 'error': 'not found'}, 404)
        except subprocess.TimeoutExpired:
            self._send_json({'ok': False, 'error': '處理逾時，請改用較低畫質或稍後再試'}, 504)
        except Exception as e:
            self._send_json({'ok': False, 'error': str(e)}, 500)

    def _stream_file(self, path):
        fname = os.path.basename(path)
        size = os.path.getsize(path)
        ext = os.path.splitext(fname)[1].lower()
        ctype = {'.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
                 '.m4a': 'audio/mp4', '.webm': 'video/webm'}.get(ext, 'application/octet-stream')
        quoted = urllib.parse.quote(fname)
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(size))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Disposition',
                         f"attachment; filename*=UTF-8''{quoted}")
        self.end_headers()
        with open(path, 'rb') as f:
            shutil.copyfileobj(f, self.wfile, length=1024 * 256)

    def log_message(self, fmt, *args):
        # 只記錄 API 呼叫，靜音靜態檔案雜訊
        if '/api/' in self.path:
            sys.stderr.write('[ytdl] ' + (fmt % args) + '\n')


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    directory = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
    os.chdir(directory)

    print('影音小助手 · YouTube 下載服務')
    print(f'  yt-dlp : {YTDLP}')
    print(f'  ffmpeg : {FFMPEG}')
    print(f'  目錄   : {directory}')
    print(f'  網址   : http://localhost:{port}/media-toolkit.html')
    print('  Ctrl+C 停止\n')
    try:
        ThreadingServer(('127.0.0.1', port), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
