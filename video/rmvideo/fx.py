"""Shared drawing / animation toolkit (easing, sprites, paper textures, hand strokes).

Lifted from the approved explainer prototypes (vox/process/flat renderers) and made
style-agnostic: nothing in here knows about a specific story.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

W, H, FPS = 1080, 1920, 30

# ---------------------------------------------------------------- brand palette
def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

GREEN = hx('1E3C2B'); DEEP = hx('0B100D'); GOLD = hx('A88B5C'); CREAM = hx('F5F0E6')
WHITE = (255, 255, 255); SHEET = (252, 249, 242); TAN = (228, 216, 190); TAN_D = (181, 162, 124)

# ---------------------------------------------------------------- easing / timing
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def lerp(a, b, p):
    return a + (b - a) * p

def e_out3(p):
    p = clamp(p); return 1 - (1 - p) ** 3

def e_io3(p):
    p = clamp(p); return 4 * p * p * p if p < .5 else 1 - (-2 * p + 2) ** 3 / 2

def e_outexpo(p):
    p = clamp(p); return 1 if p >= 1 else 1 - 2 ** (-10 * p)

def e_back(p, s=1.6):
    p = clamp(p) - 1; return 1 + (s + 1) * p ** 3 + s * p ** 2

def e_in3(p):
    p = clamp(p); return p ** 3

def lin(p):
    return clamp(p)

def pr(t, a, d, ease=e_out3):
    """eased progress of an animation that starts at a and lasts d seconds"""
    return ease((t - a) / d) if d > 0 else float(t >= a)

def vis(t, a, b, din=0.45, dout=0.3):
    return pr(t, a, din) * (1 - pr(t, b - dout, dout, e_io3))

def spring(t, t0, k=1.0):
    x = (t - t0) * k
    if x <= 0: return 0.0
    return 1 - math.exp(-x * 7.0) * math.cos(x * 14.0)

def pop(t, t0, k=1.0, sq=0.22):
    """squash & stretch entrance -> (sx, sy)"""
    s = spring(t, t0, k)
    x = max(0.0, (t - t0) * k)
    q = sq * math.exp(-x * 6) * math.sin(x * 20)
    return s * (1 + q), s * (1 - q)

def lerpc(c1, c2, p):
    p = clamp(p); return tuple(int(round(lerp(a, b, p))) for a, b in zip(c1, c2))

def drift(t, depth, ph=0.0):
    dx = 16 * math.sin(2 * math.pi * t / 9.3 + ph) + 6 * math.sin(2 * math.pi * t / 4.1 + 1.3 + ph)
    dy = 12 * math.cos(2 * math.pi * t / 11.7 + ph) + 5 * math.sin(2 * math.pi * t / 5.3 + 0.4 + ph)
    return dx * depth, dy * depth

# ---------------------------------------------------------------- sprite compositing (RGBA on RGB canvas)
_lut = {}
def with_alpha(s, a):
    if a >= 0.999: return s
    q = int(a * 128)
    if q not in _lut: _lut[q] = [int(v * q / 128) for v in range(256)]
    s = s.copy(); s.putalpha(s.getchannel('A').point(_lut[q])); return s

def paste_c(cv, s, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    if alpha <= 0.004 or scale <= 0.01: return
    if abs(rot) > 0.05: s = s.rotate(rot, Image.BICUBIC, expand=True)
    if abs(scale - 1) > 0.003:
        s = s.resize((max(1, int(s.width * scale)), max(1, int(s.height * scale))), Image.BILINEAR)
    s = with_alpha(s, alpha)
    cv.paste(s, (int(round(cx - s.width / 2)), int(round(cy - s.height / 2))), s)

def paste_tl(cv, s, x, y, alpha=1.0):
    if alpha <= 0.004: return
    s = with_alpha(s, alpha); cv.paste(s, (int(round(x)), int(round(y))), s)

def shadowed(s, off=(8, 12), blur=12, op=0.32, col=(45, 33, 15)):
    pad = blur * 2 + max(abs(off[0]), abs(off[1]))
    w, h = s.width + 2 * pad, s.height + 2 * pad
    out = Image.new('RGBA', (w, h), col + (0,))
    a = Image.new('L', (w, h), 0); a.paste(s.getchannel('A'), (pad + off[0], pad + off[1]))
    a = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * op))
    out.putalpha(a); out.alpha_composite(s, (pad, pad)); return out

def rot_pt(ox, oy, deg):
    a = math.radians(deg); return ox * math.cos(a) + oy * math.sin(a), -ox * math.sin(a) + oy * math.cos(a)

# ---------------------------------------------------------------- paper / torn edges
def noise1d(n, amp, seed, smooth=9):
    r = np.random.RandomState(seed % (2 ** 31))
    v = r.randn(n + smooth * 2)
    v = np.convolve(v, np.ones(smooth) / smooth, 'same')[smooth:smooth + n]
    v = v / (np.abs(v).max() + 1e-6) * amp
    return v + r.randn(n) * amp * 0.22

def torn_mask(w, h, amp, seed, ss=2):
    W2, H2, A = w * ss, h * ss, amp * ss
    step = 5 * ss; pts = []
    def edge(n): return noise1d(n, A, seed + len(pts) + n)
    nx, ny = max(2, W2 // step), max(2, H2 // step)
    e = edge(nx); pts += [(i * W2 / nx, A + e[i]) for i in range(nx)]
    e = edge(ny); pts += [(W2 - A - e[i], i * H2 / ny) for i in range(ny)]
    e = edge(nx); pts += [(W2 - i * W2 / nx, H2 - A - e[i]) for i in range(nx)]
    e = edge(ny); pts += [(A + e[i], H2 - i * H2 / ny) for i in range(ny)]
    m = Image.new('L', (W2, H2), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((w, h), Image.LANCZOS)

def card(w, h, seed=3, col=SHEET, amp=4):
    c = Image.new('RGBA', (int(w), int(h)), col + (255,)); c.putalpha(torn_mask(int(w), int(h), amp, seed))
    return c

def duotone(im, stops=((14, 34, 24), (30, 60, 43), (168, 139, 92), (246, 238, 220))):
    g = np.asarray(ImageOps.autocontrast(im.convert('L'), cutoff=1), dtype=np.float32) / 255.0
    xs = np.linspace(0, 1, len(stops)); st = np.array(stops, np.float32)
    out = np.stack([np.interp(g, xs, st[:, c]) for c in range(3)], -1)
    return Image.fromarray(out.astype(np.uint8))

def halftone_fill(mask, col, dot, cell=14):
    w, h = mask.size
    a = np.zeros((h, w, 4), np.uint8); a[..., :3] = col
    yy, xx = np.mgrid[0:h, 0:w]
    d = (((xx % cell) - cell / 2) ** 2 + (((yy + (xx // cell % 2) * cell // 2) % cell) - cell / 2) ** 2) < (cell * 0.22) ** 2
    a[d, :3] = dot
    a[..., 3] = np.asarray(mask)
    return Image.fromarray(a)

def make_paper(w, h, seed=11, base_col=CREAM):
    r = np.random.RandomState(seed)
    base = np.ones((h, w, 3), np.float32) * np.array(base_col, np.float32)
    def blot(sx, sy, amp):
        n = Image.fromarray((r.rand(sy, sx) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        return (np.asarray(n, np.float32) / 255 - 0.5) * 2 * amp
    lum = blot(9, 16, 7) + blot(40, 70, 3.5) + r.randn(h, w) * 2.6
    base += lum[..., None] * np.array([1.0, 0.97, 0.9])
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA')
    fib = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(fib)
    for _ in range(900):
        x, y = r.rand() * w, r.rand() * h; L = r.uniform(8, 40); a = r.uniform(0, 6.28)
        pts = [(x + L * k / 4 * math.cos(a + 0.3 * math.sin(k)), y + L * k / 4 * math.sin(a + 0.3 * math.sin(k))) for k in range(5)]
        c = (120, 100, 70, int(r.uniform(10, 28))) if r.rand() < .6 else (255, 255, 250, int(r.uniform(20, 50)))
        d.line(pts, fill=c, width=1)
    img.alpha_composite(fib)
    a = np.asarray(img.convert('RGB'), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    v = ((xx - w / 2) / (w / 2)) ** 2 * 0.6 + ((yy - h / 2) / (h / 2)) ** 2 * 0.5
    a *= (1 - 0.07 * np.clip(v, 0, 1.5))[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def grain_frames(n=4, amp=3.2, seed=5):
    rs = np.random.RandomState(seed)
    return [np.clip(rs.randn(H, W, 1) * amp, -9, 9).astype(np.int16) for _ in range(n)]

# ---------------------------------------------------------------- hand strokes
def stroke(cv, pts, p, width=9, col=GREEN, alpha=1.0):
    """progressively draw a hand-stroke polyline (screen coords), AA via 2x patch"""
    if p <= 0 or len(pts) < 2 or alpha <= 0: return
    n = max(2, int(len(pts) * clamp(p)))
    P = pts[:n]
    xs = [q[0] for q in P]; ys = [q[1] for q in P]
    pad = width * 2 + 4
    x0, y0 = int(min(xs) - pad), int(min(ys) - pad); x1, y1 = int(max(xs) + pad), int(max(ys) + pad)
    ss = 2
    patch = Image.new('RGBA', ((x1 - x0) * ss, (y1 - y0) * ss), tuple(col) + (0,))
    d = ImageDraw.Draw(patch)
    Q = [((x - x0) * ss, (y - y0) * ss) for x, y in P]
    d.line(Q, fill=tuple(col) + (255,), width=int(width * ss), joint='curve')
    r = width * ss / 2
    for qx, qy in (Q[0], Q[-1]): d.ellipse([qx - r, qy - r, qx + r, qy + r], fill=tuple(col) + (255,))
    patch = patch.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    paste_tl(cv, patch, x0, y0, alpha * 0.93)

def circle_pts(cx, cy, rx, ry, seed=1, turns=1.12, n=140, start=-2.2):
    r = random.Random(seed); ph = [r.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for i in range(n):
        a = start + turns * 2 * math.pi * i / (n - 1)
        k = 1 + 0.035 * math.sin(3 * a + ph[0]) + 0.02 * math.sin(5 * a + ph[1]) + 0.05 * i / n
        pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    return pts

def check_pts(cx, cy, s=1.0):
    a = (cx - 34 * s, cy + 2 * s); b = (cx - 8 * s, cy + 28 * s); c = (cx + 44 * s, cy - 36 * s)
    pts = [(lerp(a[0], b[0], i / 12), lerp(a[1], b[1], i / 12)) for i in range(13)]
    pts += [(lerp(b[0], c[0], i / 20), lerp(b[1], c[1], i / 20) + 2 * math.sin(i / 3)) for i in range(1, 21)]
    return pts

def arrow_pts(p0, p1, bend=0.25, n=40):
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    cx, cy = mx - dy * bend, my + dx * bend
    return [((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * cx + u * u * p1[0],
             (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * cy + u * u * p1[1]) for u in (i / (n - 1) for i in range(n))]

# ---------------------------------------------------------------- highlighter (marker swipe)
_hl = {}
def hl_sprite(w, h, seed=0, col=GOLD):
    k = (w, h, seed, col)
    if k not in _hl:
        ss = 2; im = Image.new('RGBA', (w * ss, h * ss), col + (0,))
        d = ImageDraw.Draw(im); r = random.Random(seed)
        top = [(x, r.uniform(0, h * 0.14) * ss) for x in range(0, w * ss + 1, 12)]
        bot = [(x, (h - r.uniform(0, h * 0.14)) * ss) for x in range(w * ss, -1, -12)]
        d.polygon(top + bot, fill=col + (153,))
        for _ in range(3):
            y = r.uniform(0.25, 0.75) * h * ss
            d.line([(0, y), (w * ss, y + r.uniform(-3, 3))], fill=(150, 122, 78, 60), width=3)
        _hl[k] = im.resize((w, h), Image.LANCZOS)
        if len(_hl) > 400: _hl.clear()
    return _hl[k]

def draw_hl(cv, x, y, w, h, p, seed=0, alpha=1.0, rtl=False):
    if p <= 0 or alpha <= 0.004 or w < 2 or h < 2: return
    s = hl_sprite(int(w), int(h), seed)
    cw = max(1, int(s.width * clamp(p)))
    if rtl:
        paste_tl(cv, s.crop((s.width - cw, 0, s.width, s.height)), int(x + s.width - cw), int(y), alpha)
    else:
        paste_tl(cv, s.crop((0, 0, cw, s.height)), int(x), int(y), alpha)
