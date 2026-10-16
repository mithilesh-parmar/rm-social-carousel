"""Style E - "flat vector kinetic": solid brand-colour fields, squash-and-stretch pops,
circle/wipe transitions between phases, sliding-pill karaoke captions. Everything is
drawn as vectors at 2x and downsampled. Each beat template returns one or more *phases*
(background colour + draw function); the frame loop handles transitions.
"""
import math

import numpy as np
from PIL import Image, ImageChops, ImageDraw

from .. import geo
from ..fx import FPS, H, W, hx, lerp
from ..fx import pop, spring
from ..text import TextBlock
from .common import logo, resolve_media

S = 2
GREEN = hx('1E3C2B'); DEEP = hx('132A1D'); BLACKG = hx('0B100D'); GOLD = hx('A88B5C')
CREAM = hx('F5F0E6'); CORAL = hx('E07A5F'); SKY = hx('9CC5C0'); WHITE = (255, 255, 255)
MIDG = hx('2E5A41'); LGOLD = hx('D9C49A'); SAND = hx('E7D8B6'); BROWN = hx('6B4F33')
DSKY = hx('6FA39C'); LSKY = hx('CFE6E2'); LCORAL = hx('F4CDBF'); LGREEN = hx('3F7356')
DARK_BGS = (GREEN, DEEP)

def mix(a, b, u):
    u = max(0.0, min(1.0, u)); return tuple(int(round(a[i] + (b[i] - a[i]) * u)) for i in range(3))
def cl(x, a=0.0, b=1.0): return a if x < a else (b if x > b else x)
def U(t, a, d): return cl((t - a) / d) if d > 0 else (1.0 if t >= a else 0.0)
def eio(x): x = cl(x); return 4 * x * x * x if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def eo(x): x = cl(x); return 1 - (1 - x) ** 3
def expo(x): x = cl(x); return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)
def back(x, s=1.9): x = cl(x); return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
def out(t, t1, d=0.25): return 1 - eio(U(t, t1, d))
def fl(t, ph=0.0, a=6.0, f=1.6): return a * math.sin(t * f + ph)
def count(t, t0, d, target): return target * expo(U(t, t0, d))

ROLES = {'arch': ('display', 'Black'), 'black': ('sans', 'Black'), 'xb': ('sans', 'ExtraBold'),
         'bold': ('sans', 'Bold'), 'semi': ('sans', 'SemiBold'), 'med': ('sans', 'Medium')}

# ================================================================ canvas
_mask_cache = {}
class Cv:
    lang = 'en'
    def __init__(self, bg):
        self.bg = bg
        self.im = Image.new('RGB', (W * S, H * S), bg)
        self.d = ImageDraw.Draw(self.im)
    def poly(self, pts, col):
        p = np.asarray(pts, float) * S
        if len(p) < 3: return
        self.d.polygon([tuple(q) for q in p], fill=col)
    def circ(self, x, y, r, col, ry=None):
        ry = r if ry is None else ry
        if r <= 0 or ry <= 0: return
        self.d.ellipse([(x - r) * S, (y - ry) * S, (x + r) * S, (y + ry) * S], fill=col)
    def ring(self, x, y, r, col, w):
        if r <= 0 or w <= 0: return
        self.d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], outline=col, width=max(1, int(w * S)))
    def rr(self, cx, cy, w, h, r, col, sx=1.0, sy=1.0):
        w *= sx; h *= sy
        if w <= 1 or h <= 1: return
        r = min(r * min(sx, sy), w / 2, h / 2)
        self.d.rounded_rectangle([(cx - w / 2) * S, (cy - h / 2) * S, (cx + w / 2) * S, (cy + h / 2) * S], radius=max(0, r * S), fill=col)
    def line(self, pts, col, w, cap=True):
        p = [(a * S, b * S) for a, b in pts]
        if len(p) < 2 or w <= 0: return
        self.d.line(p, fill=col, width=max(1, int(w * S)), joint='curve')
        if cap:
            for q in (p[0], p[-1]):
                r = w * S / 2
                self.d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=col)
    def block(self, s, size, fk='arch', max_w=960, max_lines=2, lang=None):
        """cached TextBlock at 2x for string s"""
        role, wt = ROLES.get(fk, ('display', 'Black'))
        lang = lang or Cv.lang
        k = (s, size, fk, max_w, max_lines, lang)
        if k not in _mask_cache:
            tb = TextBlock(s, role, int(size * S), wt, max_w=max_w * S, lang=lang, max_lines=max_lines, lh=1.05)
            _mask_cache[k] = (tb, tb.mask())
            if len(_mask_cache) > 2500: _mask_cache.clear()
        return _mask_cache[k]
    def text(self, s, x, y, size, fk='arch', col=CREAM, sx=1.0, sy=1.0, alpha=1.0, anchor='m', rot=0.0, max_w=960, max_lines=2):
        """draw (wrapped, auto-shrunk) text centred vertically on y. returns width in px"""
        if sx <= 0.01 or sy <= 0.01 or alpha <= 0.01 or not s: return 0
        tb, m = self.block(s, size, fk, max_w, max_lines)
        cy = (tb.h + 12) / 2 if len(tb.lines) > 1 else 6 + tb.asc * 0.66
        if sx != 1.0 or sy != 1.0:
            m = m.resize((max(1, int(m.size[0] * sx)), max(1, int(m.size[1] * sy))), Image.BILINEAR); cy *= sy
        ox = 0
        if rot:
            w0, h0 = m.size
            m = m.rotate(rot, resample=Image.BICUBIC, expand=True)
            cy += (m.size[1] - h0) / 2; ox = (m.size[0] - w0) / 2
        if alpha < 1: m = m.point(lambda v: int(v * alpha))
        w = m.size[0]
        X_ = x * S
        if anchor == 'm': X_ -= w / 2
        elif anchor == 'r': X_ -= w - ox
        else: X_ -= ox
        self.im.paste(col, (int(X_), int(y * S - cy)), m)
        return w / S
    def text_w(self, s, size, fk='arch', max_w=960, max_lines=2):
        return self.block(s, size, fk, max_w, max_lines)[1].size[0] / S
    def paste(self, img, x, y, mask=None):
        self.im.paste(img, (int(x * S), int(y * S)), mask)

def X(pts, cx, cy, sx=1.0, sy=1.0, rot=0.0):
    p = np.asarray(pts, float)
    if rot:
        c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        p = p @ np.array([[c, s_], [-s_, c]])
    return np.stack([cx + p[:, 0] * sx, cy + p[:, 1] * sy], 1)
def ell(rx, ry, n=64, a0=0, a1=360):
    a = np.radians(np.linspace(a0, a1, n)); return np.stack([np.cos(a) * rx, np.sin(a) * ry], 1)
def rrpts(w, h, r, n=8):
    r = min(r, w / 2, h / 2); pts = []
    for (cx, cy, a0) in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for a in np.linspace(a0, a0 + 90, n):
            pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
    return np.array(pts)
def bez(p0, p1, p2, u):
    u = np.asarray(u)[..., None]; p0, p1, p2 = map(np.asarray, (p0, p1, p2))
    return (1 - u) ** 2 * p0 + 2 * (1 - u) * u * p1 + u * u * p2

# ================================================================ geo (degrees)
_WORLD = None
def world_rings():
    """[(name, ndarray deg)], India drawn from its states when available"""
    global _WORLD
    if _WORLD is None:
        _WORLD = []
        for f in geo.world():
            rr = f['rings']
            if f['name'] == 'India':
                try: rr = [r for st in geo.states('India') for r in st['rings']]
                except FileNotFoundError: pass
            for r in rr: _WORLD.append((f['name'], np.array(r, float)))
    return _WORLD

def globe(cv, cx, cy, R, lon0, lat0, hl_names, india=GOLD, land=GREEN, ocean=SKY):
    cv.circ(cx, cy + R * 0.06, R, mix(cv.bg, BLACKG, 0.12))
    cv.circ(cx, cy, R, ocean)
    l0, p0 = math.radians(lon0), math.radians(lat0)
    sp0, cp0 = math.sin(p0), math.cos(p0)
    for name, r in world_rings():
        l, p = np.radians(r[:, 0]), np.radians(r[:, 1])
        cp = np.cos(p); dl = l - l0
        c = sp0 * np.sin(p) + cp0 * cp * np.cos(dl)
        if c.max() <= 0: continue
        x = cp * np.sin(dl); y = cp0 * np.sin(p) - sp0 * cp * np.cos(dl)
        bk = c < 0
        if bk.any():
            n = np.hypot(x, y) + 1e-9; x = np.where(bk, x / n, x); y = np.where(bk, y / n, y)
        cv.poly(np.stack([cx + x * R, cy - y * R], 1), india if name in hl_names else land)
    cv.ring(cx, cy, R, mix(ocean, BLACKG, 0.25), 6)

def gproj(lon, lat, lon0, lat0):
    l, p, l0, p0 = map(math.radians, (lon, lat, lon0, lat0))
    x = math.cos(p) * math.sin(l - l0)
    y = math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l - l0)
    c = math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l - l0)
    return x, -y, c

def eq_map(cv, lonc, latc, sc, cx, cy, colfn):
    for name, d in world_rings():
        pts = np.stack([cx + (d[:, 0] - lonc) * sc, cy - (d[:, 1] - latc) * sc], 1)
        if pts[:, 0].max() < -20 or pts[:, 0].min() > W + 20: continue
        col = colfn(name)
        if col is not None: cv.poly(pts, col)
def eqp(lon, lat, lonc, latc, sc, cx, cy): return cx + (lon - lonc) * sc, cy - (lat - latc) * sc

_ST = {}
def states_arr(country):
    if country not in _ST:
        _ST[country] = [(f['name'], [np.array(r, float) for r in f['rings']]) for f in geo.states(country)
                        if f['name'] not in ('Andaman and Nicobar', 'Lakshadweep')]
    return _ST[country]
def reg_p(lon, lat, lonc, latc, sc, cx, cy, k):
    return cx + (lon - lonc) * sc * k, cy - (lat - latc) * sc
def draw_states(cv, country, lonc, latc, sc, cx, cy, colfn, outline=None, ow=2.0, popfn=None):
    k = geo.kx(latc)
    for name, rings in states_arr(country):
        col = colfn(name)
        kk = popfn(name) if popfn else (1.0, None)
        for r in rings:
            pts = np.stack([cx + (r[:, 0] - lonc) * sc * k, cy - (r[:, 1] - latc) * sc], 1)
            if kk[0] != 1.0 and kk[1] is not None:
                c0 = np.array(kk[1]); pts = c0 + (pts - c0) * kk[0]
            cv.poly(pts, col)
            if outline: cv.line([tuple(q) for q in pts] + [tuple(pts[0])], outline, ow, cap=False)
def state_centroid(country, name):
    for n, rings in states_arr(country):
        if n == name:
            a = np.concatenate(rings); return a[:, 0].mean(), a[:, 1].mean()
    return None

# ================================================================ icons
def jar(cv, cx, cy, k=1.0, sx=1.0, sy=1.0, body=GREEN, lid=GOLD, label=CREAM, leaf=GOLD):
    if sx < 0.02: return
    a, b = k * sx, k * sy
    base = cy + 150 * b
    def P(x, y): return (cx + x * a, base + (y - 150) * b)
    def RR(x0, y0, x1, y1, r, col):
        cv.d.rounded_rectangle([P(x0, y0)[0] * S, P(x0, y0)[1] * S, P(x1, y1)[0] * S, P(x1, y1)[1] * S], radius=int(r * min(a, b) * S), fill=col)
    RR(-110, -110, 110, 150, 40, body); RR(-90, -160, 90, -100, 16, lid); RR(-100, -60, 100, 80, 14, label)
    cv.poly(np.array([P(x, y) for x, y in [(-30, 30), (-10, -8), (25, -30), (20, 5), (-5, 28)]]), leaf)
    cv.line([P(-34, 36), P(12, -12)], body, 5 * min(a, b))
    RR(70, -100, 86, -70, 8, mix(body, WHITE, 0.25))

def capsule(cv, cx, cy, L, r, rot, c1, c2):
    a = math.radians(rot); ux, uy = math.cos(a), math.sin(a)
    cv.line([(cx - ux * L / 2, cy - uy * L / 2), (cx, cy)], c1, r * 2); cv.line([(cx, cy), (cx + ux * L / 2, cy + uy * L / 2)], c2, r * 2)

def pin(cv, x, y, s=1.0, col=CORAL, dot=CREAM):
    if s <= 0.02: return
    pts = np.concatenate([ell(30, 30, 40, 150, 390), [[0, 58]]]) * s
    cv.poly(X(pts, x, y - 62 * s), col); cv.circ(x, y - 62 * s, 12 * s, dot)

def snowflake(cv, cx, cy, R, rot, col):
    w = R * 0.14
    for i in range(6):
        a = math.radians(rot + i * 60); ux, uy = math.cos(a), math.sin(a)
        cv.line([(cx, cy), (cx + ux * R, cy + uy * R)], col, w)
        bx, by = cx + ux * R * .55, cy + uy * R * .55
        for s_ in (-1, 1):
            b_ = a + s_ * math.radians(45)
            cv.line([(bx, by), (bx + math.cos(b_) * R * 0.32, by + math.sin(b_) * R * 0.32)], col, w)
    cv.circ(cx, cy, w * 0.9, col)

def dunes(cv, cx, cy, wd, t):
    cv.circ(cx + wd * 0.18, cy - wd * 0.12, wd * 0.17 * (1 + 0.04 * math.sin(t * 4)), CORAL)
    xs = np.linspace(-wd / 2, wd / 2, 40)
    for off, ph, amp, col in ((0.06, 0.1, 0.09, LGOLD), (0.16, 0.45, 0.07, GOLD)):
        y1 = cy + wd * off - np.sin((xs / wd + ph) * math.pi * 2) * wd * amp
        cv.poly(np.concatenate([np.stack([cx + xs, y1], 1), [[cx + wd / 2, cy + wd * 0.32], [cx - wd / 2, cy + wd * 0.32]]]), col)

def cloud(cv, cx, cy, s, col):
    for (x, y, r) in ((-50, 10, 38), (-10, -18, 50), (40, 0, 40), (0, 22, 34)):
        cv.circ(cx + x * s, cy + y * s, r * s, col)
    cv.rr(cx, cy + 30 * s, 180 * s, 50 * s, 25 * s, col)

def drop(cv, x, y, s, col):
    cv.poly(X(np.concatenate([ell(10, 10, 20, -30, 210), [[0, -26]]]) * s, x, y), col)

def check(cv, cx, cy, s, col=GOLD, tick=CREAM):
    if s <= 0.02: return
    cv.circ(cx, cy, 44 * s, col)
    cv.line([(cx - 19 * s, cy + 1 * s), (cx - 5 * s, cy + 16 * s), (cx + 21 * s, cy - 14 * s)], tick, 10 * s)

def ship(cv, cx, cy, s, rot=0.0, hull=CORAL, flip=False):
    if s <= 0.02: return
    f = -1 if flip else 1
    def T(p): return X(np.array(p, float) * [f, 1], cx, cy, s, s, rot)
    cv.poly(T([(-120, 0), (130, 0), (100, 45), (-100, 45)]), hull)
    cols = [GOLD, GREEN, SKY if cv.bg != SKY else CREAM, GOLD, CREAM if cv.bg != CREAM else LGOLD]
    for i, c in enumerate(cols):
        x0 = -90 + i * 34; cv.poly(T([(x0, -2), (x0 + 30, -2), (x0 + 30, -34), (x0, -34)]), c)
    for i, c in enumerate(cols[1:4]):
        x0 = -73 + i * 34; cv.poly(T([(x0, -36), (x0 + 30, -36), (x0 + 30, -64), (x0, -64)]), c)
    cv.poly(T([(82, -2), (112, -2), (112, -66), (82, -66)]), CREAM if cv.bg != CREAM else WHITE)

def plant(cv, bx, by, s, t, grow=1.0, stem=LGREEN, leaf=MIDG, spike=GOLD):
    if grow <= 0.01: return
    for i, a in enumerate([-70, -50, -30, -12, 12, 30, 50, 70]):
        L = (150 + 40 * (i % 3)) * s * grow; ang = math.radians(a + math.sin(t * 1.6 + i) * 3 - 90)
        tip = (bx + math.cos(ang) * L, by + math.sin(ang) * L); mid = (bx + math.cos(ang) * L * .5, by + math.sin(ang) * L * .5)
        nx, ny = -math.sin(ang) * 12 * s, math.cos(ang) * 12 * s
        cv.poly([(bx, by), (mid[0] + nx, mid[1] + ny), tip, (mid[0] - nx, mid[1] - ny)], leaf if i % 2 else mix(leaf, stem, 0.5))
    for i, (a, L) in enumerate([(-22, 330), (-8, 420), (6, 380), (20, 300), (-34, 250)]):
        g = cl((grow - i * 0.08) / 0.6)
        if g <= 0: continue
        ang = math.radians(a + math.sin(t * 2.0 + i * 1.3) * 4 - 90)
        L2 = L * s * eo(g); top = (bx + math.cos(ang) * L2, by + math.sin(ang) * L2)
        cv.line([(bx, by), top], stem, 7 * s)
        sk = 70 * s * eo(cl(g * 1.4 - 0.4))
        if sk > 2:
            cx_, cy_ = bx + math.cos(ang) * (L2 + sk * .5), by + math.sin(ang) * (L2 + sk * .5)
            pts = X(ell(sk * 0.62, 15 * s, 30), 0, 0) @ np.array([[math.cos(ang), math.sin(ang)], [-math.sin(ang), math.cos(ang)]]) + [cx_, cy_]
            cv.poly(pts, spike)

def gear(cv, cx, cy, R, rot, col, hole):
    pts = []
    for i in range(40):
        a = math.radians(rot + i * 9); r_ = R if (i % 4) in (0, 1) else R * 0.78
        pts.append((cx + math.cos(a) * r_, cy + math.sin(a) * r_))
    cv.poly(pts, col); cv.circ(cx, cy, R * 0.35, hole)

def sack(cv, cx, cy, s, col):
    cv.poly(X([(-26, -20), (26, -20), (34, 30), (-34, 30)], cx, cy, s, s), col)
    cv.rr(cx, cy + 30 * s, 68 * s, 22 * s, 10 * s, col)
    cv.poly(X([(-14, -20), (14, -20), (8, -32), (-8, -32)], cx, cy, s, s), col)

def mill(cv, cx, cy, k, t):
    cv.rr(cx + 250 * k, cy - 10 * k, 120 * k, 360 * k, 60 * k, LGOLD)
    cv.poly(X([(-60, -170), (60, -170), (0, -235)], cx + 250 * k, cy - 10 * k, k, k), GOLD)
    cv.rr(cx - 60 * k, cy + 40 * k, 520 * k, 300 * k, 14 * k, GREEN)
    saw = []
    for i in range(5):
        x0 = cx - 320 * k + i * 104 * k
        saw += [(x0, cy - 110 * k), (x0 + 104 * k, cy - 170 * k), (x0 + 104 * k, cy - 110 * k)]
    cv.poly([(cx - 320 * k, cy - 108 * k)] + saw + [(cx + 200 * k, cy - 108 * k)], GOLD)
    for i in range(4): cv.rr(cx - 250 * k + i * 95 * k, cy - 30 * k, 60 * k, 70 * k, 8 * k, CREAM)
    gear(cv, cx - 170 * k, cy + 110 * k, 70 * k, t * 60, GOLD, GREEN)
    gear(cv, cx - 70 * k, cy + 150 * k, 42 * k, -t * 100 + 9, CORAL, GREEN)
    cv.rr(cx - 60 * k, cy + 195 * k, 760 * k, 14 * k, 7 * k, mix(CREAM, GREEN, 0.3))

def draw_icon(cv, name, x, y, t, r=92):
    cv.circ(x, y, r, CREAM)
    k = r / 92
    if name == 'winter': snowflake(cv, x, y, 62 * k, t * 40, DSKY)
    elif name == 'soil': dunes(cv, x, y - 4 * k, 170 * k, t)
    elif name in ('norain', 'rain', 'water'):
        cloud(cv, x, y - 20 * k, 0.75 * k, SKY)
        for j in range(3):
            ph = (t * 1.4 + j * 0.33) % 1; drop(cv, x - 40 * k + j * 40 * k, y + 30 * k + ph * 40 * k, 0.8 * k, DSKY)
        if name == 'norain':
            cv.ring(x, y, 86 * k, CORAL, 14 * k)
            a = math.radians(-45); rr_ = 80 * k
            cv.line([(x - math.cos(a) * rr_, y - math.sin(a) * rr_), (x + math.cos(a) * rr_, y + math.sin(a) * rr_)], CORAL, 14 * k)
    elif name == 'sun':
        cv.circ(x, y, 36 * k, GOLD)
        for i in range(8):
            a = math.radians(i * 45 + t * 20)
            cv.line([(x + math.cos(a) * 50 * k, y + math.sin(a) * 50 * k), (x + math.cos(a) * 70 * k, y + math.sin(a) * 70 * k)], GOLD, 8 * k)
    else:
        check(cv, x, y, 1.1 * k, GREEN)

def glass(cv, cx, cy, k, t, level, gel, flakes_t):
    hw_t, hw_b, h = 190 * k, 150 * k, 520 * k
    top, bot = cy - h / 2, cy + h / 2
    cv.poly([(cx - hw_t - 10 * k, top), (cx + hw_t + 10 * k, top), (cx + hw_b + 10 * k, bot + 10 * k), (cx - hw_b - 10 * k, bot + 10 * k)], DSKY)
    cv.poly([(cx - hw_t, top), (cx + hw_t, top), (cx + hw_b, bot), (cx - hw_b, bot)], hx('E9F3F1'))
    def hw(y): return hw_b + (hw_t - hw_b) * (bot - y) / h
    ly = bot - h * level
    xs = np.linspace(-1, 1, 30); wob = np.sin(xs * 3 + t * 5) * (4 + 10 * gel) * k
    col = mix(SKY, hx('E2CF9E'), gel)
    cv.poly([(cx + x * hw(ly) * 0.995, ly + w) for x, w in zip(xs, wob)] + [(cx + hw_b, bot), (cx - hw_b, bot)], col)
    rng = np.random.RandomState(3)
    for j in range(16):
        fx, fy0 = rng.uniform(-0.8, 0.8), rng.uniform(0.1, 0.9)
        ta = flakes_t + j * 0.04
        if t < ta: continue
        yy = lerp(top - 220 * k, bot - (bot - ly) * fy0, eo(U(t, ta, 0.55)))
        sw = 1 + 2.2 * gel
        cv.poly(X(ell(12 * k * sw, 6 * k * sw, 16), cx + fx * hw(min(yy, bot)) * 0.8, yy + math.sin(t * 2 + j) * 3, 1, 1, j * 37 + t * 20),
                hx('F7EBC9') if gel < 0.5 else mix(hx('F7EBC9'), col, 0.5))
    if gel > 0.3:
        for j in range(8):
            ph = (t * 0.5 + j / 8) % 1; yy = lerp(bot - 20 * k, ly + 20 * k, ph)
            cv.ring(cx + math.sin(j * 2.1 + t) * hw(yy) * 0.6, yy, (6 + j % 3 * 4) * k, WHITE, 3 * k)
    cv.poly([(cx - hw_t + 30 * k, top + 30 * k), (cx - hw_t + 50 * k, top + 30 * k), (cx - hw_b + 40 * k, bot - 40 * k), (cx - hw_b + 22 * k, bot - 40 * k)], WHITE)

# ================================================================ shared UI
def kicker(cv, t, t0, s, dark, t1=None):
    p = eo(U(t, t0, 0.35))
    if t1 is not None: p *= out(t, t1, 0.2)
    if p <= 0.01 or not s: return
    w = cv.text_w(s, 34, 'xb', 820, 1)
    x0 = 540 - (w + 40) / 2
    cv.rr(x0 + 8, 318, 16 * p, 16 * p, 8, CORAL)
    cv.text(s, x0 + 36 + (1 - p) * 30, 318, 34, 'xb', GOLD if dark else GREEN, alpha=p, anchor='l', max_w=820, max_lines=1)

def pill(cv, t, ta, x, y, txt, size=44, bg=GREEN, fg=CREAM, k=1.0, max_w=900):
    if t < ta or not txt: return
    sx, sy = pop(t, ta, k)
    w = cv.text_w(txt, size, 'arch', max_w, 1) + 60
    x = cl(x, w / 2 + 24, W - w / 2 - 24)
    cv.rr(x, y, w, size * 1.85, size * 0.92, bg, sx, sy)
    cv.text(txt, x, y + 2, size, 'arch', fg, sx, sy, max_w=max_w, max_lines=1)

def upper(s, lang):
    return s.upper() if lang in ('en', 'de', 'es', 'fr', 'pt', 'ru', 'id', 'tr', 'it') else s

def num(v, fmt='{v}'):
    return fmt.replace('{v}', '{:,}'.format(int(round(v))))

# ================================================================ beat templates -> phases
class Phase:
    def __init__(self, t0, bg, fn, dark=None):
        self.t0, self.bg, self.fn = t0, bg, fn
        self.dark = bg in DARK_BGS if dark is None else dark

class FB:
    def __init__(self, F, b):
        self.F, self.b, self.s = F, b, b.spec
        self.L = F.lang
    def src(self, cv, t, t0, t1, dark):
        st = (self.b.scene.get('stat') or {}).get('source')
        if not st: return
        a = eo(U(t, t0, 0.4)) * out(t, t1 - 0.25, 0.25)
        if a <= 0.01: return
        cv.text('%s: %s' % (self.F.tl.ui('source', 'Source'), st), 540, 1540, 21, 'med', mix(cv.bg, CREAM if dark else GREEN, 0.75), alpha=a, max_w=900, max_lines=1)
    def phases(self): return [Phase(self.b.t0, CREAM, self.draw)]

class HookF(FB):
    def phases(self):
        b = self.b
        self.tg = b.cue('h2', 0.37) - 0.2
        self.tp = b.cue('pin', 0.72) - 0.2
        return [Phase(b.t0, CREAM, self.draw)]
    def draw(self, cv, t):
        b, s = self.b, self.s
        tg, tp = self.tg, self.tp
        jo = U(t, tg - 0.04, 0.32)
        if jo < 1:
            k = 1 - eio(jo)
            sx, sy = pop(t, b.t0 + 0.1)
            jar(cv, 540, 800 + fl(t, 0, 8), 1.45 * k, sx, sy)
            for i, (x, ph, bd, lid) in enumerate([(250, 1, MIDG, CORAL), (830, 2, GOLD, GREEN)]):
                sx2, sy2 = pop(t, b.t0 + 0.6 * (tg - b.t0) + i * 0.12)
                jar(cv, x, 860 + fl(t, ph, 8), 0.95 * k, sx2, sy2, body=bd, lid=lid, label=CREAM, leaf=GREEN if i else GOLD)
            for i, (x, y, rot, a0) in enumerate([(300, 480, 30, 0.25), (800, 520, -25, 0.35), (230, 1180, -40, 0.45), (860, 1190, 55, 0.52), (540, 400, 80, 0.6)]):
                sp = spring(t, b.t0 + a0 * (tg - b.t0)) * k
                if sp > 0.02:
                    capsule(cv, x + fl(t, i, 10), y + fl(t, i + 2, 12), 120 * sp, 26 * sp, rot + 15 * math.sin(t * 2 + i),
                            CORAL if i % 2 else GOLD, CREAM if i % 2 == 0 else GREEN)
        pn = s.get('pin') or {'lon': 78, 'lat': 22}
        if t >= tg:
            sx, sy = pop(t, tg, 1.0, 0.15)
            ru = eio(U(t, tg + 0.1, max(0.6, tp - tg - 0.2)))
            lon0 = lerp(-95, pn['lon'] + 4, ru); lat0 = lerp(5, pn['lat'] - 2, ru)
            z = lerp(1, 1.32, eio(U(t, tp + 0.7, 0.9)))
            R = 330 * sx * z; cy = 820 + 60 * eio(U(t, tp + 0.7, 0.9))
            globe(cv, 540, cy, R, lon0, lat0, geo.country_names(pn.get('country', 'India')))
            x, y, c = gproj(pn['lon'], pn['lat'], lon0, lat0)
            if t >= tp and c > 0:
                dropy = (1 - eo(U(t, tp, 0.35))) * -200
                pin(cv, 540 + x * R, cy + y * R + dropy, 1.3 * spring(t, tp))
            pill(cv, t, tp + 0.8, 540, 420, upper(pn.get('title', pn.get('name', '')), self.L), 64)
        kicker(cv, t, tp - 0.4, s.get('kicker'), False, tp + 0.7)

class TitleF(FB):
    def phases(self):
        b = self.b
        if self.s.get('headline2'):
            self.h2 = b.cue('h2', 0.4)
            return [Phase(b.t0, CORAL, self.p1), Phase(self.h2 - 0.25, DEEP, self.p2)]
        return [Phase(b.t0, CORAL, self.p1)]
    def p1(self, cv, t):
        b, s = self.b, self.s
        hd = s.get('headline', '')
        q = hd.rstrip()[-1:] in '?？؟'
        if q:
            sx, sy = pop(t, b.t0)
            cv.text('?', 540, 700 + fl(t, 0, 14, 3), 560, 'arch', CREAM, sx, sy, rot=12 * math.sin(t * 4.5), max_w=900)
        body = hd.rstrip('?？؟ ').replace('*', '') if q else hd.replace('*', '')
        a, bb = pop(t, b.t0 + 0.15)
        cv.text(upper(body, self.L) + ('?' if q and self.L != 'ar' else ('؟' if q else '')), 540, 1160 if q else 900, 130, 'arch', CREAM,
                a, bb, max_w=920, max_lines=3)
    def p2(self, cv, t):
        s = self.s; h2 = self.h2
        tb = TextBlock(s['headline2'], 'sans', 10, lang=self.L)
        words = [it[0] for it in tb.items]
        emph = [w for i, w in enumerate(words) if i in tb.emph]
        rest = ' '.join(w for i, w in enumerate(words) if i not in tb.emph).rstrip('.')
        g = eo(U(t, h2, 1.0))
        plant(cv, 540, 1100, 1.25, t, g)
        cv.rr(540, 1112, 420 * g, 36, 18, GOLD)
        if emph:
            kicker(cv, t, h2, upper(rest, self.L), True)
            pill(cv, t, h2 + 0.6, 540, 520, upper(' '.join(emph).strip('.!'), self.L), 120, CORAL, CREAM, 1.0)
        else:
            pill(cv, t, h2 + 0.3, 540, 520, s['headline2'].replace('*', ''), 60, CORAL, CREAM)

class BigStatF(FB):
    def phases(self):
        ch = self.s.get('chart', 'dots')
        self.tn = self.b.cue('n', 0.3)
        bg = CREAM if ch == 'bar' else GREEN
        return [Phase(self.b.t0, bg, self.draw)]
    def draw(self, cv, t):
        b, s = self.b, self.s
        dark = cv.bg in DARK_BGS
        ch = s.get('chart', 'dots')
        tn = self.tn
        v = s.get('value', 0); fmt = s.get('format', '{v}')
        kicker(cv, t, b.t0 + 0.1, s.get('kicker'), dark)
        lines = (s.get('label') or '').split('|')
        if ch == 'donut':
            if s.get('tag'): pill(cv, t, b.t0, 330, 440, s['tag'], 40, MIDG, CREAM)
            if len(lines) > 1: pill(cv, t, b.cue('half', 0.7) + 0.6, 720, 440, lines[1].strip(), 36, CORAL, CREAM, max_w=560)
            cx, cy, R = 540, 830, 300
            ds, _ = pop(t, b.t0 + 0.15, 1.0, 0.05); Rr = R * ds
            if Rr > 2:
                bb = [(cx - Rr) * S, (cy - Rr) * S, (cx + Rr) * S, (cy + Rr) * S]
                cv.d.ellipse(bb, fill=MIDG)
                f = eio(U(t, tn, 2.0)) * v / 100.0
                if f > 0.001: cv.d.pieslice(bb, -90, -90 + 360 * f, fill=GOLD)
                cv.circ(cx, cy, Rr * 0.6, cv.bg)
                th = b.cue('half', 0.7)
                if t >= th and v >= 50:
                    sp = spring(t, th)
                    cv.line([(cx, cy + Rr * 0.55), (cx, cy + Rr * 1.08)], CREAM, 8 * sp)
                if t >= tn:
                    sx, sy = pop(t, tn, 1.0, 0.1)
                    cv.text(num(f * 100, fmt), cx, cy - 10, 130, 'arch', CREAM, sx * ds, sy * ds, max_w=380, max_lines=1)
            if t >= b.cue('half', 0.7) - 0.1:
                a, bb2 = pop(t, b.cue('half', 0.7) - 0.1, 1.2, 0.1)
                cv.text(lines[0].strip(), 540, 1250, 42, 'xb', CREAM, a, bb2, max_w=900)
            self.src(cv, t, tn + 0.3, b.t1 + 0.3, True)
            return
        if s.get('map') and ch != 'bar':
            up = eio(U(t, tn + 0.05, 0.5))
            cy = lerp(820, 1080, up); sc = lerp(5.6, 4.3, up)
            ms, _ = pop(t, b.t0 + 0.02, 1.2, 0.08)
            names = geo.country_names(s['map'].get('highlight'))
            eq_map(cv, 30, 22, sc * ms, 540, cy, lambda n: GOLD if n in names else MIDG)
            m = s['map']
            if 'lon' in m:
                ix, iy = eqp(m['lon'], m['lat'], 30, 22, sc * ms, 540, cy)
                pulse = (t * 1.2) % 1
                cv.ring(ix, iy, 40 + pulse * 120, mix(cv.bg, GOLD, 1 - pulse), 5)
        ny = 600 if ch != 'bar' else 620
        if t >= tn:
            sx, sy = pop(t, tn)
            cv.text(num(count(t, tn + 0.04, 0.75, v), fmt), 540, ny, 240, 'arch', CREAM if dark else GREEN, sx, sy, max_w=980, max_lines=1)
        if t >= tn + 0.8:
            sx, sy = pop(t, tn + 0.8, 1.2, 0.1)
            cv.text(' '.join(x.strip() for x in lines), 540, ny + 170, 46, 'xb', GOLD, sx, sy, max_w=940, max_lines=2)
        if ch == 'dots':
            k = int(round(v / 10))
            for i in range(10):
                sp = spring(t, tn + 0.9 + i * 0.05)
                on = i < k and t >= tn + 1.1 + i * 0.07
                cv.circ(540 + (i - 4.5) * 74, ny + 280, 22 * sp, GOLD if on else MIDG)
        elif ch == 'bar':
            bs = eo(U(t, b.t0, 0.4))
            if bs > 0:
                cv.rr(540, 980, 880 * bs, 84, 42, SAND)
                f = eio(U(t, tn + 0.9, 0.85)) * min(1, v / 100.0)
                if f > 0.02:
                    x1 = 100 + 880 * f
                    cv.rr((100 + x1) / 2, 980, x1 - 100, 84, 42, GOLD)
                    ship(cv, x1 - 10, 920 + fl(t, 0, 4, 5), 0.55, 4 * math.sin(t * 5))
            for i in range(9):
                sp = spring(t, tn + 0.3 + i * 0.06)
                sack(cv, 160 + i * 95, 1210 + fl(t, i, 4, 3), 1.15 * sp, GOLD if i < round(v / 100 * 9) else SAND)
        self.src(cv, t, tn + 0.3, b.t1 + 0.3, dark)

class WorldArcsF(FB):
    def phases(self): return [Phase(self.b.t0, SKY, self.draw, False)]
    def draw(self, cv, t):
        b, s = self.b, self.s
        lonc, latc, sc, cx, cy = -12, 30, 4.7, 540, 820
        ms, _ = pop(t, b.t0, 1.3, 0.06); sc *= ms
        o = s.get('origin', {'lon': 79, 'lat': 22})
        on = geo.country_names(o.get('highlight', 'India'))
        tg = s.get('targets', [])
        tts = [b.cue(x.get('cue'), 0.3 + 0.5 * k / max(1, len(tg))) for k, x in enumerate(tg)]
        hl = {}
        for x, tt in zip(tg, tts):
            if t >= tt:
                for n in geo.country_names(x.get('countries') or x.get('region')): hl[n] = CORAL
        eq_map(cv, lonc, latc, sc, cx, cy, lambda n: GOLD if n in on else hl.get(n, CREAM))
        I = eqp(o['lon'], o['lat'], lonc, latc, sc, cx, cy)
        for k, (x, tt) in enumerate(zip(tg, tts)):
            Q = eqp(x['lon'], x['lat'], lonc, latc, sc, cx, cy)
            ta = tt - 1.0 - 0.3 * k
            p = eio(U(t, ta, 1.0))
            if p > 0:
                C = ((I[0] + Q[0]) / 2, min(I[1], Q[1]) - (170 + 160 * k))
                pts = bez(I, C, Q, np.linspace(0, p, max(2, int(60 * p))))
                for j in range(0, len(pts) - 1, 2): cv.line([tuple(pts[j]), tuple(pts[j + 1])], GREEN, 6)
                hp = bez(I, C, Q, p); hp2 = bez(I, C, Q, max(0, p - 0.02))
                if p < 1: ship(cv, hp[0], hp[1] - 6, 0.42, math.degrees(math.atan2(hp[1] - hp2[1], hp[0] - hp2[0])) + 180, flip=True)
                else: cv.circ(Q[0], Q[1], 12, GREEN)
            pill(cv, t, tt, Q[0], Q[1] - 70, upper(x.get('label', x.get('name', '')), self.L), 44)
        cv.circ(I[0], I[1], 14 * spring(t, b.t0 + 0.05), GREEN)
        xs = np.linspace(0, W, 60)
        cv.poly(np.concatenate([np.stack([xs, 1200 + np.sin(xs / 90 + t * 2.4) * 10], 1), [[W, H], [0, H]]]), DSKY)
        ship(cv, lerp(1250, -250, (t - b.t0) / max(1, b.dur)), 1190 + fl(t, 0, 6, 3), 1.25, 2.5 * math.sin(t * 2.4), flip=True)
        cv.poly(np.concatenate([np.stack([xs, 1225 + np.sin(xs / 70 - t * 3) * 8], 1), [[W, H], [0, H]]]), mix(DSKY, GREEN, 0.15))
        self.src(cv, t, b.t0 + 0.6, b.t1 + 0.3, False)
        kicker(cv, t, b.t0 + 0.1, s.get('kicker'), False)

class RegionF(FB):
    def phases(self): return [Phase(self.b.t0, GREEN, self.draw)]
    def draw(self, cv, t):
        b, s = self.b, self.s
        ctry = s.get('country', 'India')
        regs = s.get('regions', [])
        names = [r['name'] for r in regs]
        cents = [state_centroid(ctry, n) or (78, 22) for n in names]
        mlon = sum(c[0] for c in cents) / len(cents); mlat = sum(c[1] for c in cents) / len(cents)
        lon_all = [p[0] for _, rings in states_arr(ctry) for r in rings for p in r[::20]]
        lat_all = [p[1] for _, rings in states_arr(ctry) for r in rings for p in r[::20]]
        clon, clat = (min(lon_all) + max(lon_all)) / 2, (min(lat_all) + max(lat_all)) / 2
        sc0 = 900 / ((max(lon_all) - min(lon_all)) * geo.kx(clat))
        tz = b.cue(regs[-1].get('cue'), 0.4) + 0.3 if regs else b.t0 + 1
        z = eio(U(t, tz, 1.1))
        lonc = lerp(clon, mlon, z); latc = lerp(clat, mlat + 0.6, z); sc = lerp(sc0, sc0 * 1.75, z)
        ms, _ = pop(t, b.t0 + 0.01, 1.3, 0.05); sc *= ms
        cy = 860; k = geo.kx(latc)
        rt = {r['name']: b.cue(r.get('cue'), 0.1 + 0.3 * i) for i, r in enumerate(regs)}
        cent = {n: reg_p(c[0], c[1], lonc, latc, sc, 540, cy, k) for n, c in zip(names, cents)}
        shades = [GOLD, hx('C4A774'), LGOLD, CORAL]
        col = {n: shades[i % len(shades)] for i, n in enumerate(names)}
        draw_states(cv, ctry, lonc, latc, sc, 540, cy, lambda n: col[n] if n in rt and t >= rt[n] else MIDG, GREEN, 2.0,
                    lambda n: ((spring(t, rt[n]) * 0.12 + 0.88) if n in rt and t >= rt[n] else 1.0, cent.get(n)))
        for i, r in enumerate(regs):
            P = cent[r['name']]
            pill(cv, t, rt[r['name']] + 0.02, P[0], P[1] + (30 if i % 2 == 0 else -10), upper(r.get('label', r['name']), self.L), 40, CREAM, GREEN)
        if s.get('check'):
            tc = b.cue('check', 0.8)
            if t >= tc: check(cv, 540, 1290, 1.6 * spring(t, tc))
        kicker(cv, t, b.t0 + 0.05, s.get('kicker'), True)   # last, so the zooming map never covers it

class ChecklistF(FB):
    def draw(self, cv, t):
        b, s = self.b, self.s
        kicker(cv, t, b.t0 + 0.05, s.get('kicker') or s.get('headline'), False)
        items = s.get('items', [])
        cols = [LSKY, SAND, LCORAL, hx('DDE8D5')]
        n = len(items); gap = 300 if n <= 3 else 240
        for i, it in enumerate(items):
            ta = b.cue(it.get('cue'), 0.08 + 0.8 * i / max(1, n)) - 0.25
            if t < ta: continue
            y = 540 + i * gap
            x = lerp(1400, 540, back(U(t, ta, 0.5), 1.4))
            _, sy = pop(t, ta, 1.0, 0.12)
            yy = y + fl(t, i, 4, 2)
            cv.rr(x, yy, 900, 250 if n <= 3 else 200, 50, cols[i % 4], 1.0, max(0.2, sy))
            draw_icon(cv, it.get('icon', 'tick'), x - 300, yy, t, 92 if n <= 3 else 76)
            txt = it.get('text', '').replace('*', '')
            cv.text(txt, x + 30, yy, 54, 'black', GREEN, max_w=440, max_lines=2)
            check(cv, x + 360, yy, spring(t, ta + 0.9))

class RatioF(FB):
    def phases(self):
        self.tf = self.b.cue('from', 0.35); self.tt = self.b.cue('to', 0.7)
        return [Phase(self.b.t0, CREAM, self.p1), Phase(self.tf - 0.1, DEEP, self.p2)]
    def p1(self, cv, t):
        b, s = self.b, self.s
        kicker(cv, t, b.t0 + 0.05, s.get('kicker'), False)
        sx, sy = pop(t, b.t0 + 0.05)
        cx, cy = 540, 820 + fl(t, 0, 10, 2)
        sp = eio(U(t, b.t0 + 0.35 * (self.tf - b.t0), 0.55))
        rot = 25 + 8 * math.sin(t * 1.5)
        rx, ry = 165 * sx, 270 * sy
        if sp <= 0:
            cv.poly(X(ell(rx * 1.04, ry * 1.04, 80), cx + 10, cy + 14, 1, 1, rot), mix(CREAM, BLACKG, 0.1))
            cv.poly(X(ell(rx, ry, 80), cx, cy, 1, 1, rot), GOLD)
            cv.poly(X(ell(rx * 0.25, ry * 0.45, 40), cx - 50 * sx, cy - 60 * sy, 1, 1, rot), LGOLD)
        else:
            k = lerp(1, 0.78, sp)
            cv.poly(X(ell(rx * k, ry * k, 80), cx, cy, 1, 1, rot), BROWN)
            for side in (-1, 1):
                a0, a1 = (90, 270) if side < 0 else (-90, 90)
                sh = np.concatenate([ell(rx * 1.02, ry * 1.02, 50, a0, a1), ell(rx * 0.82, ry * 0.9, 50, a1, a0)])
                cv.poly(X(sh, cx + sp * 210 * side, cy - sp * 30, 1, 1, rot + side * 18 * sp), hx('EFE4C8'))
            to = s.get('to', {})
            pill(cv, t, b.t0 + 0.35 * (self.tf - b.t0) + 0.2, 540, 1230, upper(to.get('label', ''), self.L), 52, CORAL, CREAM)
        hl = (s.get('headline') or '').replace('*', '')
        a = eo(U(t, b.t0 + 0.1, 0.4))
        cv.text(hl, 540, 440, 50, 'xb', GREEN, alpha=a, max_w=900)
    def p2(self, cv, t):
        b, s = self.b, self.s
        fr, to = s.get('from', {}), s.get('to', {})
        frac = to.get('value', 0) / max(1e-6, fr.get('value', 1))
        tf, tt = self.tf, self.tt
        kicker(cv, t, tf, s.get('kicker'), True)
        if t >= tf:
            sx, sy = pop(t, tf, 1.1, 0.1)
            cv.text('%s %s %s' % (num(count(t, tf + 0.02, 0.7, fr.get('value', 0))), fr.get('unit', ''), fr.get('label', '')),
                    540, 450, 92, 'arch', CREAM, sx, sy, max_w=960, max_lines=1)
        bs, bsy = pop(t, tf - 0.05, 1.0, 0.18)
        cx, cy, side = 540, 820, 520
        sep = eio(U(t, tt, 0.6)); dim = eio(U(t, tt - 1.0, 0.6))
        ncol = max(2, int(round(1 / max(frac, 0.05)))) if frac > 0 else 4
        ncol = min(ncol, 10)
        for i in range(ncol):
            w = side / ncol; x = cx - side / 2 + w * (i + 0.5)
            if i == 0:
                col = mix(GOLD, CREAM, sep); xx = x - sep * 70; sc = 1 + 0.05 * sep
            else:
                col = mix(GOLD, mix(DEEP, GOLD, 0.35), dim); xx = x + sep * 20; sc = 1 - 0.06 * dim
            base = cy + side / 2; h = side * bsy * sc
            cv.rr(xx, base - h / 2, (w - 10) * bs * sc, h, 18, col)
        if t >= tt:
            sx, sy = pop(t, tt)
            cv.text('%s %s' % (num(count(t, tt + 0.04, 0.8, to.get('value', 0))), to.get('unit', '')), 420, 1200, 120, 'arch', CREAM, sx, sy, max_w=560, max_lines=1)
            pill(cv, t, tt + 1.0, 800, 1196, to.get('label', ''), 52, GOLD, GREEN, max_w=330)
            s_ = spring(t, tt + 0.4)
            cv.rr(cx - side / 2 - 5, 535, 130 * s_, 64 * s_, 32, CORAL)
            cv.text('%d%%' % round(frac * 100), cx - side / 2 - 5, 537, 36, 'arch', CREAM, s_, s_, max_w=200)
        self.src(cv, t, tf + 0.6, b.t1 + 0.3, True)

class DiagramF(FB):
    def draw(self, cv, t):
        b, s = self.b, self.s
        kicker(cv, t, b.t0 + 0.07, s.get('kicker'), False)
        tsoak = b.cue(s.get('note_cue', 'soak'), 0.2); tgel = b.cue(s.get('result_cue', 'gel'), 0.5)
        tfib = b.cue(s.get('sub_cue', 'fibre'), 0.75)
        m = eio(U(t, tfib - 0.85, 0.5))
        gs, _ = pop(t, b.t0, 1.1, 0.1)
        gx = lerp(540, 300, m); k = lerp(1.0, 0.72, m) * gs
        level = lerp(0.55, 0.62, eio(U(t, tsoak - 0.5, 0.8)))
        level = lerp(level, 0.86, eio(U(t, tgel - 1.1, 0.9)))
        gel = eio(U(t, tsoak - 0.5, 1.6))
        glass(cv, gx, 830, k, t, level, gel, b.t0 + 0.13)
        pill(cv, t, tgel - 0.6, gx, 470 if m < 0.5 else 530, upper(s.get('result', ''), self.L), 60 * (1 - 0.25 * m), CORAL, CREAM)
        if t >= tsoak - 0.5 and m < 0.99:
            a = eo(U(t, tsoak - 0.5, 0.3)) * (1 - m)
            cv.text(s.get('note', ''), gx, 1150, 40, 'bold', DSKY, alpha=a, max_w=900)
        if t >= tfib - 0.8:
            sp = spring(t, tfib - 0.8)
            cv.text('=', 545, 830, 130, 'arch', GOLD, sp, sp)
            sx, sy = pop(t, tfib - 0.57)
            jar(cv, 790, 830 + fl(t, 0, 8), 1.0, sx, sy)
        if t >= tfib + 0.05:
            a, bb = pop(t, tfib + 0.05)
            cv.text(s.get('sub', ''), 540, 1170, 44, 'xb', GREEN, a, bb, max_w=920)

class FootageF(FB):
    def phases(self):
        b = self.b
        loc = self.s.get('location')
        self.tl_ = b.cue(loc.get('cue'), 0.45) - 0.6 if loc else None
        ph = [Phase(b.t0, CREAM, self.p1)]
        if loc: ph.append(Phase(self.tl_, CREAM, self.p2))
        self.photos = []
        for p in (self.s.get('photos') or [])[:2]:
            try: self.photos.append(resolve_media(p, self.F.assets))
            except FileNotFoundError: pass
        return ph
    def photo(self, path, w, h):
        k = ('ph', path, w, h)
        if k not in self.F.cache:
            im = Image.open(path).convert('RGB')
            r = max(w * S / im.size[0], h * S / im.size[1])
            im = im.resize((int(im.size[0] * r) + 1, int(im.size[1] * r) + 1), Image.LANCZOS)
            l = (im.size[0] - w * S) // 2; tp = (im.size[1] - h * S) // 2
            im = im.crop((l, tp, l + w * S, tp + h * S))
            m = Image.new('L', im.size, 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=28 * S, fill=255)
            self.F.cache[k] = (im, m)
        return self.F.cache[k]
    def p1(self, cv, t):
        b, s = self.b, self.s
        kicker(cv, t, b.t0 + 0.05, s.get('kicker'), False)
        sx, sy = pop(t, b.t0 + 0.05, 1.0, 0.12)
        mill(cv, 540, 640 + (1 - sy) * 60, 0.95 * min(sx, 1.3) * (sy if sy < 1 else 1), t)
        for i, path in enumerate(self.photos):
            ta = b.t0 + 0.8 + 0.25 * i
            if t < ta: continue
            p = back(U(t, ta, 0.5), 1.5)
            im, m = self.photo(path, 420, 300)
            rot = (-4, 4)[i]; xx = lerp(-300 if i == 0 else 1380, (300, 780)[i], p); y = 1050 + fl(t, i, 5, 2)
            mm = m.rotate(rot, expand=True, resample=Image.BICUBIC); ii = im.rotate(rot, expand=True, resample=Image.BICUBIC)
            cv.poly(X(rrpts(444, 324, 34), xx, y, 1, 1, -rot), WHITE)
            cv.paste(ii, xx - ii.size[0] / S / 2, y - ii.size[1] / S / 2, mm)
        if not self.s.get('location'):
            cv.text((s.get('headline') or '').replace('*', ''), 540, 1330, 50, 'xb', GREEN, alpha=eo(U(t, b.t0 + 0.3, 0.4)), max_w=900)
    def p2(self, cv, t):
        loc = self.s['location']; t0 = self.tl_
        mx = lerp(1300, 540, back(U(t, t0, 0.55), 1.2))
        lonc, latc = loc.get('lon', 72.4) - 0.5, loc.get('lat', 23.9) - 1.3
        ctry = loc.get('country', 'India')
        hl = (loc.get('state') or (loc.get('region') or '').split(',')[0]).strip()
        try:
            draw_states(cv, ctry, lonc, latc, 92, mx, 800, lambda n: GOLD if n == hl else hx('E3D7BE'), CREAM, 3)
        except FileNotFoundError:
            pass
        k = geo.kx(latc)
        P = reg_p(loc['lon'], loc['lat'], lonc, latc, 92, mx, 800, k)
        if t >= t0 + 0.15:
            ps = spring(t, t0 + 0.15)
            cv.circ(P[0], P[1], 16 * ps, GREEN)
            pin(cv, P[0], P[1] + (1 - eo(U(t, t0 + 0.15, 0.35))) * -250, 1.6 * ps)
        pill(cv, t, t0 + 0.05, 540, 330, upper(loc.get('title', loc.get('name', '')), self.L), 60)
        if t >= t0 + 1.0 and loc.get('region'):
            sx, sy = pop(t, t0 + 1.0)
            cv.text(upper(loc['region'], self.L), 540, 1230, 50, 'arch', GREEN, sx, sy, max_w=900, max_lines=1)

class EndcardF(FB):
    def phases(self): return []

class EndF:
    """CTA + url first; the logo springs in on the spoken brand name, tagline under it."""
    def __init__(self, F, ec):
        self.F, self.ec = F, ec
        lg = logo('stacked')
        w = 560
        lg = lg.resize((w * S, int(lg.height * w * S / lg.width)), Image.LANCZOS)
        self.logo_a = lg.getchannel('A')
    def draw(self, cv, t):
        ec = self.ec
        lt = ec['logo_t']
        dy = lerp(-330, 0, eio(U(t, lt - 0.35, 0.5)))
        sx, sy = pop(t, lt - 0.05, 0.9, 0.15)
        if sx > 0.02:
            a = self.logo_a
            aa = a.resize((max(1, int(a.size[0] * sx)), max(1, int(a.size[1] * sy))), Image.BILINEAR)
            cv.paste(CREAM, 540 - aa.size[0] / S / 2, 580 - aa.size[1] / S / 2 + fl(t, 0, 6, 2), aa)
        if ec.get('tagline') and t >= ec['tagline_t'] - 0.05:
            a2, b2 = pop(t, ec['tagline_t'] - 0.05, 1.2, 0.1)
            cv.text(ec['tagline'], 540, 895, 46, 'xb', LGOLD, a2, b2, max_w=900, max_lines=2)
        if ec.get('cta'):
            a, b_ = pop(t, ec['t0'] + 0.15, 1.2, 0.08)
            cv.text(ec['cta'], 540, 1030 + dy, 50, 'black', CREAM, a, b_, max_w=900, max_lines=3)
        if t >= ec['t0'] + 0.5:
            a2, b2 = pop(t, ec['t0'] + 0.5)
            cv.rr(540, 1170 + dy, 520, 104, 52, GOLD, a2, b2)
            cv.text(ec['url'], 540, 1172 + dy, 54, 'arch', GREEN, a2, b2, max_w=480, max_lines=1)
        if ec.get('sub') and t >= ec['t0'] + 0.9:
            cv.text(ec['sub'], 540, 1262 + dy, 32, 'semi', LGOLD, alpha=eo(U(t, ec['t0'] + 0.9, 0.4)), max_w=900, max_lines=1)
        for i in range(7):
            if i == 3: continue
            s_ = spring(t, ec['t0'] + i * 0.07)
            x = 120 + i * 140; y = 380 + (i % 2) * 40 + fl(t, i, 12, 1.4)
            cv.poly(X(ell(14 * s_, 24 * s_, 24), x, y if i % 3 else y + 1060, 1, 1, 30 + i * 20 + t * 15), GOLD)

BEATS = {'hook': HookF, 'title': TitleF, 'big_stat': BigStatF, 'world_map_arcs': WorldArcsF, 'region_map': RegionF,
         'checklist': ChecklistF, 'ratio': RatioF, 'diagram': DiagramF, 'footage': FootageF, 'endcard': EndcardF}

# ================================================================ the style
class FlatStyle:
    name = 'flat'
    TR = 0.42

    def __init__(self, tl, assets=None):
        self.tl, self.assets = tl, assets
        self.lang = tl.code; Cv.lang = tl.code
        self.total = tl.total
        self.NF = int(round(tl.total * FPS))
        self.cache = {}
        self.phases = []
        for b in tl.beats:
            self.phases += BEATS[b.type](self, b).phases()
        self.end = EndF(self, tl.endcard) if tl.endcard else None
        if self.end:
            self.phases.append(Phase(tl.endcard['t0'], GREEN, self.end.draw))
        self.phases.sort(key=lambda p: p.t0)
        self.phases[0].t0 = 0.0
        for i, p in enumerate(self.phases):
            p.kind = None if i == 0 else ('circle' if i % 2 else 'wipe')
            p.dirn = 1 if (i // 2) % 2 == 0 else -1

    def frames(self, f0, f1):
        for fi in range(f0, f1): yield fi, None

    def phase_index(self, t):
        k = 0
        for i, p in enumerate(self.phases):
            if t >= p.t0: k = i
        return k

    def render_phase(self, i, t):
        p = self.phases[i]
        cv = Cv(p.bg)
        p.fn(cv, t)
        return cv

    def frame(self, t):
        i = self.phase_index(t)
        p = self.phases[i]
        u = (t - p.t0) / self.TR if p.kind else 1.0
        if i > 0 and u < 1:
            A = self.render_phase(i - 1, t); B = self.render_phase(i, t)
            m = Image.new('L', (W * S, H * S), 0); d = ImageDraw.Draw(m)
            q = eio(u)
            if p.kind == 'circle':
                o = (540, 860); r = q * 2300
                d.ellipse([(o[0] - r) * S, (o[1] - r) * S, (o[0] + r) * S, (o[1] + r) * S], fill=255)
            else:
                sl = 500
                if p.dirn > 0:
                    x = lerp(W + sl, -sl - 50, q)
                    d.polygon([(x * S, 0), ((W + 2 * sl) * S, 0), ((W + 2 * sl) * S, H * S), ((x + sl) * S, H * S)], fill=255)
                else:
                    x = lerp(-sl, W + sl + 50, q)
                    d.polygon([(x * S, 0), (-2 * sl * S, 0), (-2 * sl * S, H * S), ((x - sl) * S, H * S)], fill=255)
            A.im.paste(B.im, (0, 0), m)
            cv = A; dark = p.dark if q > 0.5 else self.phases[i - 1].dark
        else:
            cv = self.render_phase(i, t); dark = p.dark
        self.captions(cv, t, dark)
        return cv.im.reduce(S)

    def captions(self, cv, t, dark):
        for g in self.tl.captions:
            if not (g['t0'] <= t < g['t1']): continue
            key = ('cap', g['t0'])
            if key not in self.cache:
                toks = [(w['w'], not self.tl.cjk) for w in g['words']]
                tb = TextBlock(toks, 'sans', 66 * S, 'Black', max_w=900 * S, lang=self.lang, max_lines=2, lh=1.1)
                self.cache[key] = (tb, tb.mask())
            tb, m = self.cache[key]
            act = 0
            for j, w in enumerate(g['words']):
                if t >= w['t0'] - 0.03: act = j
            act = min(act, tb.n - 1)
            sx, _ = pop(t, g['t0'], 1.6, 0.12)
            sc = 0.7 + 0.3 * min(sx, 1.08)
            y0 = 1405
            if sc <= 0.05: return
            ms = m.resize((max(1, int(m.width * sc)), max(1, int(m.height * sc))), Image.BILINEAR)
            X0 = 540 * S - ms.width / 2; Y0 = y0 * S - (tb.asc * 0.66 + 6) * sc if len(tb.lines) == 1 else y0 * S - ms.height / 2
            # pill under the active word, sliding from the previous one
            prev = max(0, act - 1)
            mv = eo(U(t, g['words'][act]['t0'] - 0.03, 0.12)) if act > 0 else 1.0
            bx = [tb.items[j][1] for j in (prev, act)]; bw = [tb.items[j][3] for j in (prev, act)]; by = [tb.items[j][2] for j in (prev, act)]
            px = X0 + (lerp(bx[0] + bw[0] / 2, bx[1] + bw[1] / 2, mv) + 6) * sc
            py = Y0 + (lerp(by[0], by[1], mv) + 6 + tb.asc * 0.62) * sc
            pw = (lerp(bw[0], bw[1], mv) + 34 * S) * sc; ph = 94 * S * sc
            box = (int(px - pw / 2), int(py - ph / 2), int(px + pw / 2), int(py + ph / 2))
            cv.d.rounded_rectangle(box, radius=int(ph / 2), fill=GOLD)
            base = CREAM if dark else GREEN
            cv.im.paste(base, (int(X0), int(Y0)), ms)
            full = Image.new('L', cv.im.size, 0); full.paste(ms, (int(X0), int(Y0)))
            bw_, bh_ = box[2] - box[0], box[3] - box[1]
            if bw_ > 2 and bh_ > 2:
                pm = Image.new('L', (bw_, bh_), 0)
                ImageDraw.Draw(pm).rounded_rectangle([0, 0, bw_ - 1, bh_ - 1], radius=int(bh_ / 2), fill=255)
                cv.im.paste(BLACKG, box, ImageChops.multiply(full.crop(box), pm))
            return

    def render(self, arg):
        fi, _ = arg
        return np.asarray(self.frame(fi / FPS))

    def still(self, t):
        return self.frame(t)
