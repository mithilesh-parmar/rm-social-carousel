"""Shared bits for styles: media probing, photo loading, logos, footage frame readers."""
import os
import subprocess

from PIL import Image

from ..config import BRAND_DIR, asset
from ..fx import FPS

_probe = {}
def probe(path):
    """-> (w, h, duration)"""
    if path not in _probe:
        out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                       'stream=width,height:format=duration', '-of', 'default=nw=1', path]).decode()
        d = dict(l.split('=', 1) for l in out.split() if '=' in l)
        _probe[path] = (int(d['width']), int(d['height']), float(d.get('duration', 0) or 0))
    return _probe[path]

def is_video(path):
    return os.path.splitext(path)[1].lower() in ('.mp4', '.mov', '.m4v', '.webm', '.mkv')

def resolve_media(ref, base=None):
    p = asset(ref, base)
    if not os.path.exists(p):
        raise FileNotFoundError('footage/photo not found: %s (assets dir: set RMVIDEO_ASSETS or --assets)' % p)
    return p

def logo(kind='horizontal', width=None):
    im = Image.open(os.path.join(BRAND_DIR, 'rm-psyllium-logo-%s.png' % kind)).convert('RGBA')
    if width:
        im = im.resize((int(width), int(im.height * width / im.width)), Image.LANCZOS)
    return im

def tint(im, col):
    """recolour an RGBA logo, keeping alpha"""
    out = Image.new('RGBA', im.size, tuple(col) + (0,))
    out.putalpha(im.getchannel('A'))
    return out

def video_reader(path, start, n, size, vf='fps=30'):
    """yield n raw rgb24 frames (bytes) from `path` starting at `start` s, looping if short.
    Never freezes: -stream_loop keeps feeding frames past the clip end."""
    w, h = size
    cmd = ['ffmpeg', '-v', 'error', '-stream_loop', '-1', '-ss', '%.3f' % start, '-i', path,
           '-t', '%.3f' % (n / FPS + 0.5), '-vf', vf, '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    fs = w * h * 3; last = None
    try:
        for _ in range(n):
            b = p.stdout.read(fs)
            if len(b) < fs: b = last
            last = b
            yield b
    finally:
        p.kill(); p.wait()
