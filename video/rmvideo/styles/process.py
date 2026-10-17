"""Style D - "annotated factory": real factory footage as the hero, Vox-style paper
annotations on top (torn paper cards, marker circles/arrows, highlighter swipes,
handwritten labels). Each beat type below is a reusable template driven by the script.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from .. import geo
from ..fx import (DEEP, FPS, GOLD, GREEN, H, TAN, TAN_D, W, arrow_pts, card, check_pts, circle_pts,
                  clamp, draw_hl, drift, e_back, e_in3, e_io3, e_out3, e_outexpo, grain_frames, halftone_fill, lerp,
                  lerpc, make_paper, paste_c, paste_tl, pr, rot_pt, shadowed, stroke)
from ..text import TextBlock
from .common import is_video, logo, probe, resolve_media, video_reader

MARK = (244, 205, 110)   # warm marker gold for use on footage
INK = (252, 246, 232)
ORANGE = (198, 120, 40)
SRC_GREY = (120, 108, 86)

# ================================================================ paper maps
class PaperMap:
    """torn paper map card for a lon/lat bbox. mode 'world' (halftone land) or 'states'."""
    def __init__(self, bbox, out_w, seed, mode='world', country='India', ss=2):
        lon0, lat0, lon1, lat1 = bbox
        self.bbox, self.mode, self.country = bbox, mode, country
        self.k = 1.0 if mode == 'world' else geo.kx((lat0 + lat1) / 2)
        self.sc = out_w / ((lon1 - lon0) * self.k)
        self.size = (int(out_w), int((lat1 - lat0) * self.sc))
        self.ss = ss
        self._hl = {}
        self.base = self._build_base(seed)
        self.sprite = shadowed(self.base, (12, 18), 16, 0.45)

    def proj(self, lon, lat):
        return (lon - self.bbox[0]) * self.k * self.sc, (self.bbox[3] - lat) * self.sc

    def _pp(self, ring):
        s = self.ss
        return [((lo - self.bbox[0]) * self.k * self.sc * s, (self.bbox[3] - la) * self.sc * s) for lo, la in ring]

    def _country_rings(self, name):
        if name == self.country and self.mode != 'world-plain':
            try:
                return [r for st in geo.states(name) for r in st['rings']]
            except FileNotFoundError:
                pass
        return [r for f in geo.world() if f['name'] == name for r in f['rings']]

    def _build_base(self, seed):
        s = self.ss; w, h = self.size[0] * s, self.size[1] * s
        if self.mode == 'world':
            img = Image.new('RGBA', (w, h), (238, 232, 216, 255))
            d = ImageDraw.Draw(img)
            for lon in range(-180, 181, 30):
                x = self._pp([(lon, 0)])[0][0]
                for y in range(0, h, 24 * s): d.line([(x, y), (x, y + 10 * s)], fill=(205, 192, 162, 255), width=2 * s)
            for lat in range(-60, 81, 30):
                y = self._pp([(0, lat)])[0][1]
                for x in range(0, w, 24 * s): d.line([(x, y), (x + 10 * s, y)], fill=(205, 192, 162, 255), width=2 * s)
            land = Image.new('L', (w, h), 0); dl = ImageDraw.Draw(land)
            rings = []
            for f in geo.world():
                rr = self._country_rings(f['name']) if f['name'] == self.country else f['rings']
                for r in rr:
                    p = self._pp(r); rings.append(p); dl.polygon(p, fill=255)
            sh = Image.new('L', (w, h), 0); sh.paste(land, (5 * s, 7 * s))
            sh = sh.filter(ImageFilter.GaussianBlur(5 * s)).point(lambda v: int(v * 0.30))
            shl = Image.new('RGBA', (w, h), (60, 44, 20, 0)); shl.putalpha(sh); img.alpha_composite(shl)
            la = np.zeros((h, w, 4), np.uint8); la[..., :3] = TAN
            yy, xx = np.mgrid[0:h, 0:w]
            c = 10 * s
            la[(((xx % c) - c / 2) ** 2 + ((yy % c) - c / 2) ** 2) < 5 * s * s, :3] = (214, 199, 168)
            la[..., 3] = np.asarray(land)
            img.alpha_composite(Image.fromarray(la))
            d = ImageDraw.Draw(img)
            for p in rings: d.line(p + [p[0]], fill=TAN_D + (255,), width=2 * s)
        else:
            img = Image.new('RGBA', (w, h), (232, 236, 226, 255)); d = ImageDraw.Draw(img)
            for y in range(0, h, 22 * s): d.line([(0, y), (w, y + 6 * s)], fill=(222, 228, 216, 255), width=2 * s)
            for f in geo.world():
                if f['name'] == self.country: continue
                for r in f['rings']:
                    d.polygon(self._pp(r), fill=(229, 220, 198, 255), outline=(196, 182, 150, 255))
            srings = [self._pp(r) for st in geo.states(self.country) for r in st['rings']]
            for p in srings: d.line(p + [p[0]], fill=GREEN + (255,), width=9 * s)
            for p in srings: d.polygon(p, fill=(240, 228, 200, 255))
            for p in srings: d.line(p + [p[0]], fill=(200, 182, 140, 255), width=2 * s)
        img = img.resize(self.size, Image.LANCZOS)
        img.putalpha(Image.fromarray(np.minimum(np.asarray(img.getchannel('A')),
                                                np.asarray(torn_mask_cached(self.size, seed)))))
        return img

    def highlight(self, names, kind='country', col=(190, 160, 105), dot=(150, 120, 72)):
        key = (tuple(sorted(names)), kind, col)
        if key not in self._hl:
            s = self.ss; w, h = self.size[0] * s, self.size[1] * s
            m = Image.new('L', (w, h), 0); md = ImageDraw.Draw(m)
            rings = []
            if kind == 'state':
                rings = [r for st in geo.states(self.country) if st['name'] in names for r in st['rings']]
            else:
                for n in names: rings += self._country_rings(n)
            for r in rings: md.polygon(self._pp(r), fill=255)
            lay = halftone_fill(m, col, dot, cell=12 * s)
            if kind == 'state':
                ld = ImageDraw.Draw(lay)
                for r in rings:
                    p = self._pp(r); ld.line(p + [p[0]], fill=GREEN + (255,), width=6 * s)
            lay = lay.resize(self.size, Image.LANCZOS)
            lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.getchannel('A')), np.asarray(self.base.getchannel('A')))))
            self._hl[key] = lay
        return self._hl[key]

_tm = {}
def torn_mask_cached(size, seed):
    from ..fx import torn_mask
    k = (size, seed)
    if k not in _tm: _tm[k] = torn_mask(size[0], size[1], 9, seed)
    return _tm[k]

class Placed:
    """a paper map pasted on screen: projects lon/lat -> screen"""
    def __init__(self, pm, cx, cy, z):
        self.pm, self.z = pm, z
        sw, sh = pm.sprite.size
        self.ox = cx - sw * z / 2 + (sw - pm.size[0]) / 2 * z
        self.oy = cy - sh * z / 2 + (sh - pm.size[1]) / 2 * z

    def __call__(self, lon, lat):
        x, y = self.pm.proj(lon, lat)
        return self.ox + x * self.z, self.oy + y * self.z

    def layer(self, cv, lay, alpha):
        if alpha <= 0: return
        if abs(self.z - 1) > 0.003:
            lay = lay.resize((int(lay.width * self.z), int(lay.height * self.z)), Image.BILINEAR)
        paste_tl(cv, lay, self.ox, self.oy, alpha)

def place_map(cv, pm, t, t_in, t_out, cy, zoom=0.05, dur=None):
    pin = pr(t, t_in - 0.02, 0.5, e_back); pout = pr(t, t_out, 0.32, e_in3)
    z = (0.9 + 0.1 * pin) * (1.0 + zoom * pr(t, t_in, dur or max(0.5, t_out - t_in), e_io3))
    cx = W / 2 + 5 * math.sin(t * 1.2)
    y = cy + (1 - pr(t, t_in, 0.5, e_out3)) * 500 + pout * 1400
    a = clamp(pin * 3) * (1 - pout)
    paste_c(cv, pm.sprite, cx, y, z, a)
    return Placed(pm, cx, y, z), a

# ================================================================ icons (paper style)
def _icon_bg(r=86, col=(236, 222, 190)):
    ss = 2; im = Image.new('RGBA', (r * 2 * ss, r * 2 * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([0, 0, r * 2 * ss - 1, r * 2 * ss - 1], fill=col + (255,))
    return im, d, ss, r

def icon(name):
    im, d, ss, r = _icon_bg()
    c = r * ss
    if name == 'winter':
        for k in range(6):
            a = k * math.pi / 3; L = 56 * ss
            d.line([(c, c), (c + L * math.cos(a), c + L * math.sin(a))], fill=GREEN + (255,), width=7 * ss)
            bx, by = c + L * .55 * math.cos(a), c + L * .55 * math.sin(a)
            for s_ in (0.6, -0.6):
                d.line([(bx, by), (bx + 18 * ss * math.cos(a + s_), by + 18 * ss * math.sin(a + s_))], fill=GREEN + (255,), width=6 * ss)
        d.ellipse([c - 11 * ss, c - 11 * ss, c + 11 * ss, c + 11 * ss], fill=GOLD + (255,))
    elif name == 'soil':
        R = r * 2 * ss
        m = Image.new('L', im.size, 0); ImageDraw.Draw(m).ellipse([0, 0, R - 1, R - 1], fill=255)
        lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        for k, (yb, col) in enumerate([(0.55, (205, 172, 112)), (0.68, (180, 146, 92)), (0.82, (150, 118, 72))]):
            pts = [(x, R * (yb + 0.06 * math.sin(x / R * 6.28 * 0.9 + k * 1.7))) for x in range(0, R + 1, 6)]
            ld.polygon(pts + [(R, R), (0, R)], fill=col + (255,))
        ld.ellipse([R * 0.62, R * 0.16, R * 0.86, R * 0.40], fill=GOLD + (255,))
        lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.getchannel('A')), np.asarray(m))))
        im.alpha_composite(lay)
    elif name in ('norain', 'rain', 'water'):
        for (x, y, rr) in [(-26, 4, 26), (4, -12, 32), (32, 6, 24)]:
            d.ellipse([c + (x - rr) * ss, c + (y - rr) * ss, c + (x + rr) * ss, c + (y + rr) * ss], fill=GREEN + (255,))
        d.rounded_rectangle([c - 52 * ss, c + 2 * ss, c + 56 * ss, c + 30 * ss], radius=14 * ss, fill=GREEN + (255,))
        for x in (-28, 0, 28):
            d.line([(c + x * ss, c + 42 * ss), (c + (x - 6) * ss, c + 60 * ss)], fill=(120, 160, 175, 255), width=6 * ss)
        if name == 'norain':
            d.line([(c - 60 * ss, c + 62 * ss), (c + 60 * ss, c - 58 * ss)], fill=(160, 50, 40, 255), width=9 * ss)
    elif name == 'sun':
        d.ellipse([c - 30 * ss, c - 30 * ss, c + 30 * ss, c + 30 * ss], fill=GOLD + (255,))
        for k in range(8):
            a = k * math.pi / 4
            d.line([(c + 42 * ss * math.cos(a), c + 42 * ss * math.sin(a)), (c + 62 * ss * math.cos(a), c + 62 * ss * math.sin(a))], fill=GOLD + (255,), width=7 * ss)
    else:  # generic tick
        d.line([(c - 34 * ss, c + 2 * ss), (c - 8 * ss, c + 28 * ss), (c + 44 * ss, c - 36 * ss)], fill=GREEN + (255,), width=12 * ss)
    return im.resize((r * 2, r * 2), Image.LANCZOS)

def pin_sprite(s=1.0):
    ss = 3; w, h = int(70 * s), int(96 * s)
    im = Image.new('RGBA', (w * ss, h * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    R = w * ss / 2
    d.ellipse([0, 0, w * ss - 1, w * ss - 1], fill=GREEN + (255,))
    d.polygon([(R * 0.28, R * 1.55), (R * 1.72, R * 1.55), (R, h * ss - 1)], fill=GREEN + (255,))
    d.ellipse([R * 0.55, R * 0.55, R * 1.45, R * 1.45], fill=GOLD + (255,))
    return shadowed(im.resize((w, h), Image.LANCZOS), (5, 8), 6, 0.35)

# ================================================================ the style
class ProcessStyle:
    name = 'process'

    def __init__(self, tl, assets=None):
        self.tl, self.assets = tl, assets
        self.lang = tl.code
        self.rtl = tl.rtl
        self.total = tl.total
        self.NF = int(round(tl.total * FPS))
        self._build_shots()
        self._build_grade()
        self.GRAIN = grain_frames()
        self.PIN = pin_sprite(1.0)
        self.PAPER = None
        self._spr = {}
        lg = logo('horizontal'); lg = lg.resize((int(lg.width * 0.40), int(lg.height * 0.40)), Image.LANCZOS)
        c = card(lg.width + 48, lg.height + 34, 501, col=(252, 249, 242), amp=3)
        c.alpha_composite(lg, (24, 17))
        self.LOGO_TAB = shadowed(c.rotate(-1.5, Image.BICUBIC, expand=True), (5, 8), 7, 0.35)
        self.beats = [BEATS[b.type](self, b) for b in tl.beats]
        self.end = EndCard(self, tl.endcard) if tl.endcard else None
        self._caps = None

    # ------------------------------------------------------------ footage shots
    def _build_shots(self):
        self.shots = []
        for sc in self.tl.scenes:
            fl = sc['scene'].get('footage') or []
            t0, t1 = sc['t0'], sc['t1']
            if not fl:
                self.shots.append(dict(kind='paper', t0=t0, t1=t1, annotate=[])); continue
            ws = [float(f.get('weight', 1)) for f in fl]
            acc = 0
            for f, w in zip(fl, ws):
                a = t0 + (t1 - t0) * acc / sum(ws); acc += w
                b = t0 + (t1 - t0) * acc / sum(ws)
                path = resolve_media(f['src'], self.assets)
                s = dict(f, t0=a, t1=b, path=path, kind='v' if is_video(path) else 'p', annotate=f.get('annotate', []))
                if s['kind'] == 'v':
                    s['size'] = probe(path)[:2]; s['clip'] = probe(path)[2] or 1e9
                else:
                    im = Image.open(path).convert('RGB')
                    s['img'] = ImageEnhance.Color(im).enhance(1.06); s['size'] = im.size
                sw, sh = s['size']
                s.setdefault('focus', [sw / 2, sh / 2]); s.setdefault('zoom', 1.0)
                s.setdefault('zoom_to', s['zoom'] * 1.07); s.setdefault('pan', [0, 0]); s.setdefault('in', 0.0)
                self.shots.append(s)
        self.shots[-1]['t1'] = self.total + 0.1
        for s in self.shots:
            s['f0'] = int(round(s['t0'] * FPS)); s['f1'] = int(round(s['t1'] * FPS))

    def shot_at(self, fi):
        for s in self.shots:
            if s['f0'] <= fi < s['f1']: return s
        return self.shots[-1]

    def cam(self, s, t):
        sw, sh = s['size']
        u = clamp((t - s['t0']) / max(0.01, s['t1'] - s['t0']))
        u = lerp(u, e_io3(u), 0.35)
        z = lerp(s['zoom'], s['zoom_to'], u)
        ch = sh / z; cw = ch * W / H
        if cw > sw: cw = sw; ch = cw * H / W
        cx = s['focus'][0] + s['pan'][0] * (u - 0.5); cy = s['focus'][1] + s['pan'][1] * (u - 0.5)
        cx = clamp(cx, cw / 2, sw - cw / 2); cy = clamp(cy, ch / 2, sh - ch / 2)
        return cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2

    def _build_grade(self):
        def curve(v, gain, lift):
            x = v / 255.0
            x = x + 0.10 * (x - 0.5) * (1 - abs(2 * x - 1))
            x = lift + (1 - lift - 0.015) * x
            return int(clamp(x * gain) * 255)
        self.LUT = [curve(v, 1.035, 0.035) for v in range(256)] + [curve(v, 1.0, 0.03) for v in range(256)] + \
                   [curve(v, 0.93, 0.03) for v in range(256)]
        yy, xx = np.mgrid[0:H, 0:W]
        v = ((xx - W / 2) / (W / 2)) ** 2 * 0.55 + ((yy - H / 2) / (H / 2)) ** 2 * 0.45
        self.VIG = np.clip(256 * (1 - 0.30 * np.clip(v - 0.15, 0, 1.4) ** 1.2), 0, 256).astype(np.uint16)[..., None]

    def grade(self, im):
        a = np.asarray(im.point(self.LUT), np.uint16)
        return Image.fromarray(((a * self.VIG) >> 8).astype(np.uint8))

    @staticmethod
    def blur_bg(im):
        sm = im.resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3.2))
        return ImageEnhance.Brightness(sm.resize((W, H), Image.BICUBIC)).enhance(0.62)

    # ------------------------------------------------------------ frame sources (parent process)
    def frames(self, f0, f1):
        for s in self.shots:
            a, b = max(f0, s['f0']), min(f1, s['f1'])
            if a >= b: continue
            if s['kind'] != 'v':
                for fi in range(a, b): yield fi, None
            else:
                off = (a - s['f0']) / FPS
                ss = (s['in'] + off) % max(0.1, s['clip'])
                vf = 'fps=30,eq=saturation=1.06,unsharp=5:5:0.35'
                for k, raw in enumerate(video_reader(s['path'], ss, b - a, s['size'], vf)):
                    yield a + k, raw

    # ------------------------------------------------------------ drawing helpers
    def tb(self, key, *a, **k):
        kk = (key,) + tuple(a) + tuple(sorted((x, str(y)) for x, y in k.items()))
        if kk not in self._spr:
            k.setdefault('lang', self.lang)
            self._spr[kk] = TextBlock(*a, **k)
        return self._spr[kk]

    def headline(self, cv, t, text, y, t_in, t_out, size=84, hl_t=None, rot=-1.2, maxw=900, role='serif', weight='Bold'):
        if not text or t < t_in - 0.01 or t > t_out + 0.35: return
        key = ('hs', text, size, rot)
        if key not in self._spr:
            tb = TextBlock(text, role, size, weight, fill=DEEP, max_w=maxw, lang=self.lang, max_lines=3)
            c = card(tb.w + 90, tb.h + 54, 120 + len(text) % 50, col=(253, 251, 245), amp=5)
            self._spr[key] = (tb, shadowed(c.rotate(rot, Image.BICUBIC, expand=True), (8, 12), 12, 0.35))
        tb, sp = self._spr[key]
        pin = pr(t, t_in, 0.5, e_outexpo); pout = pr(t, t_out, 0.32, e_in3)
        d = -1 if self.rtl else 1
        x = W / 2 + d * ((1 - pin) * -1150 + pout * 1150)
        paste_c(cv, sp, x, y + tb.h / 2 + 4, 1, 1)
        hp = pr(t, hl_t if hl_t is not None else t_in + 0.45, 0.35)
        tb.draw(cv, x, y, 1, hl={i: hp for i in tb.emph}, hlseed=11)

    def label(self, cv, text, x, y, alpha, size=66, col=INK, rot=-3, maxw=760):
        a = clamp(alpha)
        if a <= 0 or not text: return
        k = ('lab', text, size, col, rot)
        if k not in self._spr:
            tb = TextBlock(text, 'hand', size, 'Bold', fill=col, max_w=maxw, lang=self.lang, max_lines=2)
            pad = 30
            s = Image.new('RGBA', (tb.w + pad * 2, tb.h + pad * 2), (0, 0, 0, 0))
            tb.draw(s, s.width / 2, pad)
            shade = 0 if col == DEEP else 0.85
            sh = Image.new('RGBA', s.size, (15, 10, 4, 0))
            sh.putalpha(s.getchannel('A').filter(ImageFilter.GaussianBlur(5)).point(lambda v: int(v * shade)))
            out = Image.new('RGBA', (s.width + 6, s.height + 8), (0, 0, 0, 0))
            out.alpha_composite(sh, (4, 6)); out.alpha_composite(s, (0, 0))
            self._spr[k] = out.rotate(rot, Image.BICUBIC, expand=True)
        sp = self._spr[k]
        x = clamp(x, sp.width / 2 + 10, W - sp.width / 2 - 10)
        paste_c(cv, sp, x, y + (1 - a) * 12, 0.94 + 0.06 * a, a)

    def mstroke(self, cv, pts, p, width=9, col=MARK):
        if p <= 0: return
        stroke(cv, [(x + 3, y + 4) for x, y in pts], p, width + 3, (20, 14, 6), 0.45)
        stroke(cv, pts, p, width, col)

    def marrow(self, cv, p0, p1, p, bend=0.25, width=7, col=INK, head=30):
        pts = arrow_pts(p0, p1, bend)
        self.mstroke(cv, pts, pr(p, 0, 0.8, clamp), width, col)
        hp = pr(p, 0.8, 0.2, clamp)
        if hp > 0:
            (ax, ay), (bx, by) = pts[-4], pts[-1]
            ang = math.atan2(by - ay, bx - ax)
            for sg in (1, -1):
                q = (bx - head * math.cos(ang + sg * 0.55), by - head * math.sin(ang + sg * 0.55))
                self.mstroke(cv, [(bx, by), q], hp, width, col)

    def source_line(self, text):
        return ('%s: %s' % (self.tl.ui('source', 'Source'), text)).upper() if self.lang in ('en', 'de', 'es', 'fr', 'pt', 'id', 'tr', 'ru') \
            else '%s: %s' % (self.tl.ui('source', 'Source'), text)

    # ------------------------------------------------------------ annotations on footage
    def annotations(self, cv, t, s, box):
        if not s.get('annotate'): return
        dur = s['t1'] - s['t0']
        x0, y0, x1, y1 = box
        def s2s(x, y): return (x - x0) * W / (x1 - x0), (y - y0) * H / (y1 - y0)
        circ = None
        for k, a in enumerate(s['annotate']):
            ta = s['t0'] + a.get('when', 0.15) * dur
            if a['type'] == 'circle':
                cx, cy = s2s(*a['at'])
                rx = a['r'][0] * W / (x1 - x0); ry = a['r'][1] * H / (y1 - y0)
                circ = (cx, cy, rx, ry)
                self.mstroke(cv, circle_pts(cx, cy, rx, ry, seed=k + 3), pr(t, ta, 0.6, clamp), 10)
            elif a['type'] == 'label':
                lx, ly = a['xy']
                self.label(cv, a.get('text', ''), lx, ly, pr(t, ta, 0.45, e_out3), a.get('size', 68))
                if a.get('arrow'):
                    p0, p1 = a['arrow']
                    if p1 == 'circle' and circ:
                        p1 = (circ[0] - circ[2] * 0.5 * (1 if lx < circ[0] else -1), circ[1] + circ[3] * 1.0)
                    elif p1 == 'circle':
                        continue
                    self.marrow(cv, tuple(p0), tuple(p1), pr(t, ta + 0.15, 0.45), 0.3 if p1[0] > p0[0] else -0.3)

    # ------------------------------------------------------------ captions
    def captions(self, cv, t):
        for g in self.tl.captions:
            if not (g['t0'] <= t < g['t1']): continue
            key = ('cap', g['t0'])
            if key not in self._spr:
                toks = [(w['w'], not self.tl.cjk) for w in g['words']]
                tb = TextBlock(toks, 'sans', 58, 'Bold', fill=DEEP, max_w=880, lang=self.lang, max_lines=2)
                s = card(tb.w + 56, tb.h + 26, 90 + tb.w % 7, col=(253, 251, 245), amp=3)
                self._spr[key] = (tb, shadowed(s, (5, 8), 8, 0.4))
                if len(self._spr) > 3000: self._spr.clear()
            tb, slip = self._spr[key]
            a = pr(t, g['t0'], 0.12) * (1 - pr(t, g['t1'] - 0.08, 0.08))
            rise = (1 - pr(t, g['t0'], 0.18)) * 14
            y = 1470
            paste_c(cv, slip, W / 2, y + tb.h / 2 + rise + 2, 1.0, a * 0.97)
            cur = -1
            for i, w in enumerate(g['words']):
                if t >= w['t0'] - 0.03: cur = i
            hl = {cur: pr(t, g['words'][cur]['t0'] - 0.03, 0.12, e_out3)} if cur >= 0 and cur < tb.n else None
            tb.draw(cv, W / 2, y + rise, a, hl=hl, hlseed=7)
            break

    # ------------------------------------------------------------ frame
    def blur_amount(self, t):
        b = 0.0
        for bt in self.beats:
            if bt.b.t0 - 0.6 <= t <= bt.b.t1 + 0.6:
                b = max(b, bt.blur(t))
        if self.end: b = max(b, self.end.blur(t))
        return clamp(b)

    def render(self, arg):
        fi, raw = arg
        t = fi / FPS
        s = self.shot_at(fi)
        if s['kind'] == 'paper':
            if self.PAPER is None: self.PAPER = make_paper(W, H)
            cv = self.PAPER.copy(); box = (0, 0, W, H)
        else:
            if s['kind'] == 'p':
                src = s['img']
            else:
                src = Image.frombytes('RGB', tuple(s['size']), raw) if raw else Image.new('RGB', tuple(s['size']), DEEP)
            box = self.cam(s, t)
            cv = src.resize((W, H), Image.BICUBIC, box=box)
        bl = self.blur_amount(t)
        if bl > 0.01:
            bb = self.blur_bg(cv)
            cv = bb if bl > 0.99 else Image.blend(cv, bb, bl)
        cv = self.grade(cv)
        if bl < 0.5: self.annotations(cv, t, s, box)
        for bt in self.beats:
            if bt.b.t0 - 0.05 <= t <= bt.b.t1 + 0.4:
                bt.draw(cv, t)
        if self.end and t >= self.end.t0 - 0.2:
            self.end.draw(cv, t)
        else:
            paste_tl(cv, self.LOGO_TAB, 26, 52, 0.95 * pr(t, 0, 0.4))
        self.captions(cv, t)
        a = np.asarray(cv, np.int16) + self.GRAIN[(fi // 2) % 4]
        return np.clip(a, 0, 255).astype(np.uint8)

    def still(self, t):
        fi = int(round(t * FPS))
        raw = next(self.frames(fi, fi + 1))[1]
        return Image.fromarray(self.render((fi, raw)))

# ================================================================ beat templates
class BeatR:
    def __init__(self, P, b):
        self.P, self.b, self.s = P, b, b.spec
    def blur(self, t): return 0.0
    def draw(self, cv, t): pass
    @property
    def out_t(self): return self.b.t1 - 0.3

def stat_card(P, cv, key, t, num_txt, label, source, cx, cy, t_in, t_out, w=860, rot=-1.5, hl_t=None):
    if t < t_in - 0.01 or t > t_out + 0.35: return
    k = ('stat', key)
    if k not in P._spr:
        sb = TextBlock(label or '', 'sans', 40, 'SemiBold', fill=DEEP, max_w=w - 100, lang=P.lang, max_lines=3) if label else None
        h = 240 + (sb.h if sb else 0) + (50 if source else 0)
        c = card(w, h, 200 + len(key), col=(252, 249, 242), amp=4)
        if sb: sb.draw(c, w / 2, 235)
        if source:
            st = TextBlock(P.source_line(source), 'mono', 21, 'Medium', fill=SRC_GREY, max_w=w - 80, lang=P.lang)
            st.draw(c, w / 2, h - 34 - st.h / 2)
        P._spr[k] = (c, h)
    base, h = P._spr[k]
    base = base.copy()
    nb = TextBlock(num_txt, 'serif', 178, 'Black', fill=GREEN, max_w=w - 60, lang='en')
    if hl_t is not None:
        draw_hl(base, w / 2 - nb.w / 2 - 16, 70, nb.w + 32, 120, pr(t, hl_t, 0.4), 4)
    nb.draw(base, w / 2, 128 - nb.asc * 0.62 - 6)
    sp = shadowed(base.rotate(rot, Image.BICUBIC, expand=True), (10, 16), 14, 0.38)
    pin = pr(t, t_in, 0.55, e_back); pout = pr(t, t_out, 0.32, e_in3)
    paste_c(cv, sp, cx, cy + (1 - pr(t, t_in, 0.5, e_out3)) * 260 + pout * 500, 0.86 + 0.14 * pin,
            clamp(pin * 3) * (1 - pout))


def fmt_num(v, fmt='{v}'):
    return fmt.replace('{v}', '{:,}'.format(int(round(v))))

class HookR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        self.pin = self.s.get('pin')
        if self.pin:
            ctry = self.pin.get('country', 'India')
            try:
                rings = [r for st in geo.states(ctry) for r in st['rings']]
            except FileNotFoundError:
                rings = [r for f in geo.world() if f['name'] == ctry for r in f['rings']]
            lo0, la0, lo1, la1 = geo.bbox(rings)
            try:
                geo.states(ctry); mode = 'states'
            except FileNotFoundError:
                mode = 'world'
            self.map = PaperMap((lo0 - 1.5, la0 - 1.0, lo1 + 1.5, la1 + 1.0), 860, 81, mode, ctry)
        self.t_h2 = b.cue('h2', 0.45)
        self.t_pin = b.cue('pin', 0.7) if self.pin else None
    def blur(self, t):
        if not self.pin: return 0
        return pr(t, self.t_pin - 0.7, 0.3) * (1 - pr(t, self.b.t1 - 0.1, 0.3))
    def draw(self, cv, t):
        P, b = self.P, self.b
        end1 = self.t_h2 - 0.1
        P.headline(cv, t, self.s.get('headline'), 230, b.t0 + 0.12, end1 - 0.3 if self.s.get('headline2') else self.out_t)
        P.headline(cv, t, self.s.get('headline2'), 230, end1 + 0.05, (self.t_pin - 0.75) if self.pin else self.out_t, size=82)
        if self.pin:
            tin = self.t_pin - 0.6
            pl, a = place_map(cv, self.map, t, tin, b.t1 - 0.05, 820)
            if a <= 0: return
            px, py = pl(self.pin['lon'], self.pin['lat'])
            P.mstroke(cv, circle_pts(px, py, 120, 105, seed=4), pr(t, self.t_pin - 0.25, 0.6, clamp), 9, ORANGE)
            if t > self.t_pin - 0.1:
                paste_c(cv, P.PIN, px, py - 34, pr(t, self.t_pin - 0.1, 0.4, e_back), a)
            P.label(cv, self.pin.get('label'), px + 190, py - 230, pr(t, self.t_pin, 0.45) * a, 64)

class TitleR(BeatR):
    def draw(self, cv, t):
        P, b = self.P, self.b
        h2 = b.cue('h2', 0.45) if self.s.get('headline2') else b.t1
        P.headline(cv, t, self.s.get('headline'), 300, b.t0 + 0.02, h2 - 0.35, size=124, rot=1.0, weight='Black')
        P.headline(cv, t, self.s.get('headline2'), 230, h2 - 0.15, self.out_t, size=84,
                   hl_t=h2 + 0.6)

class BigStatR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        self.map = self.s.get('map')
        self.tn = b.cue('n', 0.35 if self.map else 0.1)
        if self.map:
            self.wm = P.__dict__.setdefault('_world_map', None) or PaperMap((-128, -38, 102, 72), 1000, 77, 'world')
            P._world_map = self.wm
    def blur(self, t):
        if not self.map: return 0
        return pr(t, self.b.t0 - 0.4, 0.3) * (1 - pr(t, self.tn + 0.3, 0.4))
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        if self.map:
            tout = self.tn + 0.35
            pl, a = place_map(cv, self.wm, t, b.t0, tout, 620)
            if a > 0:
                names = geo.country_names(self.map.get('highlight'))
                pl.layer(cv, self.wm.highlight(names), pr(t, b.t0 + 0.15, 0.5) * a)
                if 'lon' in self.map:
                    ix, iy = pl(self.map['lon'], self.map['lat'])
                    P.mstroke(cv, circle_pts(ix, iy - 10, 95, 95, seed=7), pr(t, b.t0 + 0.25, 0.6, clamp), 8, ORANGE)
                    P.label(cv, self.map.get('label'), ix - 190, iy - 150, pr(t, b.t0 + 0.5, 0.45) * a, 58, col=DEEP, rot=-4)
        v = s.get('value', 0)
        cnt = v * pr(t, self.tn + 0.1, 0.9, e_out3)
        txt = fmt_num(cnt, s.get('format', '{v}'))
        cy = 860 if not s.get('note') else 900
        P.headline(cv, t, s.get('headline'), 240, b.t0 + 0.1, self.out_t)
        stat_card(P, cv, 'st%d' % b.index, t, txt, s.get('label'), (b.scene.get('stat') or {}).get('source'),
                  W / 2, cy, self.tn - 0.2, b.t1 - 0.25, hl_t=self.tn + 0.6)
        if s.get('note'):
            tnote = b.cue(s.get('note_cue', 'note'), 0.7)
            a = pr(t, tnote - 0.05, 0.45) * (1 - pr(t, b.t1 - 0.3, 0.2))
            P.label(cv, s['note'], 760, 520, a, 60, rot=4)

class WorldArcsR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        self.wm = getattr(P, '_world_map', None) or PaperMap((-128, -38, 102, 72), 1000, 77, 'world')
        P._world_map = self.wm
        tg = self.s.get('targets', [])
        for k, x in enumerate(tg):
            x['_t'] = b.cue(x.get('cue'), 0.25 + 0.5 * k / max(1, len(tg)))
    def blur(self, t):
        return pr(t, self.b.t0 - 0.3, 0.3) * (1 - pr(t, self.b.t1 - 0.1, 0.3))
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        pl, a = place_map(cv, self.wm, t, b.t0, b.t1 - 0.1, 880, zoom=0.04)
        if a > 0:
            o = s.get('origin', {'lon': 79, 'lat': 22})
            pl.layer(cv, self.wm.highlight(geo.country_names(o.get('highlight', 'India'))), a)
            ix, iy = pl(o['lon'], o['lat'])
            for k, x in enumerate(s.get('targets', [])):
                tt = x['_t'] - 0.55
                names = geo.country_names(x.get('countries') or x.get('region'))
                if names:
                    pl.layer(cv, self.wm.highlight(names, col=(206, 170, 120), dot=(168, 130, 80)), pr(t, tt + 0.6, 0.4) * a * 0.8)
                tx, ty = pl(x['lon'], x['lat'])
                p = pr(t, tt, 0.7, e_io3)
                pts = arrow_pts((ix, iy), (tx, ty), -0.3, 60)
                stroke(cv, pts, p, 8, ORANGE, a)
                if p >= 0.99:
                    paste_c(cv, P.PIN, tx, ty - 30, pr(t, tt + 0.7, 0.35, e_back), a)
                P.label(cv, x.get('label', x.get('name')), tx + (40 if x['lon'] < 0 else 0), ty - 90, pr(t, tt + 0.5, 0.45) * a, 58, col=DEEP, rot=-4)
        P.headline(cv, t, s.get('headline'), 240, b.t0 + 0.05, self.out_t)

class RegionR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        ctry = self.s.get('country', 'India')
        regs = self.s.get('regions', [])
        if self.s.get('bbox'):
            bb = self.s['bbox']
        else:
            rings = [r for st in geo.states(ctry) if st['name'] in [x['name'] for x in regs] for r in st['rings']]
            lo0, la0, lo1, la1 = geo.bbox(rings); bb = (lo0 - 2.5, la0 - 2, lo1 + 2.5, la1 + 2)
        self.map = PaperMap(bb, 980, 83, 'states', ctry)
        for k, x in enumerate(regs):
            x['_t'] = b.cue(x.get('cue'), 0.1 + 0.35 * k)
            if 'lon' not in x:
                st = [f for f in geo.states(ctry) if f['name'] == x['name']]
                x['lon'], x['lat'] = geo.centroid(st[0]['rings']) if st else (0, 0)
    def blur(self, t):
        return pr(t, self.b.t0 - 0.3, 0.3) * (1 - pr(t, self.b.t1 - 0.1, 0.3))
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        pl, a = place_map(cv, self.map, t, b.t0, b.t1 - 0.1, 880, zoom=0.06)
        if a > 0:
            for x in s.get('regions', []):
                pl.layer(cv, self.map.highlight([x['name']], 'state'), pr(t, x['_t'] - 0.1, 0.45) * a)
            for x in s.get('regions', []):
                lx, ly = pl(x['lon'], x['lat'])
                P.label(cv, x.get('label', x['name']), lx, ly, pr(t, x['_t'] + 0.1, 0.45) * a, 50, col=DEEP, rot=-4)
            ck = s.get('check')
            if ck:
                x, y = pl(ck['lon'], ck['lat'])
                stroke(cv, check_pts(x, y, 1.6), pr(t, b.cue('check', 0.8) - 0.1, 0.4, clamp), 13, GREEN, a)
        P.headline(cv, t, s.get('headline'), 230, b.t0 + 0.1, self.out_t, hl_t=b.cue('check', 0.8))

class ChecklistR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        items = self.s.get('items', [])
        self.cards = []
        for i, it in enumerate(items):
            w, h = 940, 230
            c = card(w, h, 60 + i)
            c.alpha_composite(icon(it.get('icon', 'tick')), (40, (h - 172) // 2))
            tt = TextBlock(it.get('text', ''), 'serif', 58, 'Bold', fill=DEEP, max_w=520, lang=P.lang, max_lines=2,
                           align='start')
            sub = TextBlock(it['sub'], 'sans', 32, 'Medium', fill=GREEN, max_w=520, lang=P.lang, align='start') if it.get('sub') else None
            th = tt.h + (sub.h + 6 if sub else 0)
            ty = (h - th) / 2
            tt.draw(c, 0, ty, x_left=250)
            if sub: sub.draw(c, 0, ty + tt.h + 6, x_left=252)
            ImageDraw.Draw(c).rounded_rectangle([812, h / 2 - 42, 896, h / 2 + 42], radius=10, outline=(190, 172, 135), width=4)
            rot = [-1.4, 1.1, -0.8, 1.3][i % 4]
            self.cards.append((shadowed(c.rotate(rot, Image.BICUBIC, expand=True), (9, 13), 13, 0.3), rot,
                               b.cue(it.get('cue'), 0.1 + 0.8 * i / max(1, len(items)))))
        n = len(items)
        top = 560 if n <= 3 else 480
        gap = min(270, (1330 - top) / max(1, n - 1)) if n > 1 else 0
        self.ys = [top + i * gap for i in range(n)]
    def draw(self, cv, t):
        P, b = self.P, self.b
        P.headline(cv, t, self.s.get('headline'), 220, b.t0 + 0.02, self.out_t, rot=-1.0)
        for (sp, rot, ti), y in zip(self.cards, self.ys):
            ti -= 0.25
            if not (ti - 0.01 <= t <= b.t1 + 0.3): continue
            pin = pr(t, ti, 0.5, e_back); pout = pr(t, b.t1 - 0.1, 0.32, e_in3)
            x = W / 2 + (1 - pr(t, ti, 0.5, e_outexpo)) * 900 - pout * 1200
            paste_c(cv, sp, x, y, 0.9 * (0.9 + 0.1 * pin), clamp(pin * 3))
            ox, oy = rot_pt(384 * 0.9, 0, rot)
            stroke(cv, check_pts(x + ox, y + oy, 0.9), pr(t, ti + 0.45, 0.35, clamp), 10, GREEN)

class RatioR(BeatR):
    def __init__(self, P, b):
        super().__init__(P, b)
        self.tf = b.cue('from', 0.35); self.tt = b.cue('to', 0.7)
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        P.headline(cv, t, s.get('headline'), 230, b.t0 + 0.05, self.tf - 0.4, size=74)
        t_in, t_out = self.tf - 0.25, b.t1 - 0.15
        if t < t_in - 0.01 or t > t_out + 0.35: return
        w, h = 900, 540
        fr, to = s.get('from', {}), s.get('to', {})
        k = ('ratio', b.index)
        if k not in P._spr:
            c = card(w, h, 311, col=(252, 249, 242), amp=4)
            src = (b.scene.get('stat') or {}).get('source')
            if src:
                st = TextBlock(P.source_line(src), 'mono', 21, 'Medium', fill=SRC_GREY, max_w=w - 80, lang=P.lang)
                st.draw(c, w / 2, h - 34 - st.h / 2)
            P._spr[k] = c
        c = P._spr[k].copy()
        bg = (252, 249, 242)
        p1 = pr(t, t_in + 0.15, 0.4)
        n1 = TextBlock('%s %s' % ('{:,}'.format(fr.get('value', 0)), fr.get('unit', '')), 'serif', 116, 'Black',
                       fill=lerpc(bg, GREEN, p1), max_w=560, lang=P.lang)
        n1.draw(c, 0, 52, x_left=60)
        l1 = TextBlock(fr.get('label', ''), 'script', 92, 'Bold', fill=lerpc(bg, (120, 90, 60), p1), max_w=260, lang=P.lang)
        l1.draw(c, 0, 62, x_left=min(w - l1.w - 50, 60 + n1.w + 24))
        bx0, bx1, by = 70, w - 70, 215
        d = ImageDraw.Draw(c)
        d.rounded_rectangle([bx0, by, bx1, by + 34], radius=8, fill=lerpc(bg, (214, 196, 160), p1))
        frac = to.get('value', 0) / max(1e-6, fr.get('value', 1))
        p2 = pr(t, self.tt - 0.05, 0.7, e_io3)
        if p2 > 0:
            d.rounded_rectangle([bx0, by, bx0 + (bx1 - bx0) * frac * p2 + 1, by + 34], radius=8, fill=GREEN)
            v2 = to.get('value', 0) * pr(t, self.tt, 0.8, e_out3)
            n2 = TextBlock('%s %s' % ('{:,}'.format(int(round(v2))), to.get('unit', '')), 'serif', 116, 'Black',
                           fill=lerpc(bg, GREEN, pr(t, self.tt, 0.35)), max_w=520, lang=P.lang)
            draw_hl(c, 50, 300, n2.w + 30, 110, pr(t, self.tt + 0.2, 0.45), 9)
            n2.draw(c, 0, 272, x_left=60)
            l2 = TextBlock(to.get('label', ''), 'script', 92, 'Bold', fill=lerpc(bg, (120, 90, 60), pr(t, self.tt, 0.35)),
                           max_w=220, lang=P.lang)
            l2.draw(c, 0, 282, x_left=min(w - 230 - l2.w, 60 + n2.w + 24))
            pct = TextBlock('%d%%' % round(frac * 100), 'sans', 54, 'Bold', fill=lerpc(bg, GOLD, pr(t, self.tt + 0.4, 0.35)), max_w=200, lang='en')
            pct.draw(c, 0, 290, x_left=w - 70 - pct.w)
        sp = shadowed(c.rotate(1.3, Image.BICUBIC, expand=True), (10, 16), 14, 0.38)
        pin = pr(t, t_in, 0.55, e_back); pout = pr(t, t_out, 0.32, e_in3)
        paste_c(cv, sp, W / 2, 760 + (1 - pr(t, t_in, 0.5, e_out3)) * 260 + pout * 500, 0.86 + 0.14 * pin,
                clamp(pin * 3) * (1 - pout))

class DiagramR(BeatR):
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        if s.get('left') and s.get('result'):
            text = '%s + %s = *%s*' % (s['left'], s.get('right', ''), s['result']) if s.get('right') else '%s = *%s*' % (s['left'], s['result'])
        else:
            text = s.get('headline', '')
        P.headline(cv, t, text, 240, b.t0 + 0.05, self.out_t, size=88, hl_t=b.cue(s.get('result_cue', 'gel'), 0.5))
        if s.get('note'):
            tn = b.cue(s.get('note_cue', 'soak'), 0.25)
            P.label(cv, s['note'], W / 2, 1180, pr(t, tn - 0.1, 0.45) * (1 - pr(t, b.cue(s.get('sub_cue', 'fibre'), 0.75) - 0.3, 0.25)), 64)
        if s.get('sub'):
            ts = b.cue(s.get('sub_cue', 'fibre'), 0.75)
            P.label(cv, s['sub'], W / 2, 1300, pr(t, ts - 0.1, 0.45) * (1 - pr(t, b.t1 - 0.2, 0.2)), 56)

class FootageR(BeatR):
    def draw(self, cv, t):
        P, b, s = self.P, self.b, self.s
        endt = P.end.t0 - 0.3 if P.end else self.out_t
        P.headline(cv, t, s.get('headline'), 230, b.t0 + 0.02, min(self.out_t, endt), size=60)
        loc = s.get('location')
        if loc:
            tp = pr(t, b.cue(loc.get('cue'), 0.4) - 0.2, 0.45, e_back) * (1 - pr(t, endt, 0.3))
            if tp > 0:
                k = ('tag', b.index)
                if k not in P._spr:
                    txt = loc.get('label') or loc.get('name', '')
                    tb = TextBlock(txt, 'hand', 56, 'Bold', fill=DEEP, max_w=760, lang=P.lang, max_lines=1)
                    c = card(tb.w + 150, 130, 611, col=(252, 249, 242), amp=4)
                    tb.draw(c, (tb.w + 150) / 2 + 30, 65 - tb.h / 2)
                    P._spr[k] = (shadowed(c.rotate(2, Image.BICUBIC, expand=True), (8, 12), 10, 0.4), tb.w + 150)
                sp, cw = P._spr[k]
                paste_c(cv, sp, W / 2 + 20, 1220, 0.9 + 0.1 * tp, clamp(tp * 2))
                paste_c(cv, P.PIN, W / 2 + 20 - cw / 2 + 55, 1200, 0.8 * tp, clamp(tp * 2))

class EndcardBeatR(BeatR):
    def blur(self, t): return pr(t, self.b.t0 - 0.2, 0.4)
    def draw(self, cv, t):
        if self.P.end: self.P.end.draw(cv, t, self.b.t0)

class EndCard:
    """CTA + url on a paper sheet; the logo pops in exactly on the spoken brand name and the
    sign-off tagline writes in under it."""
    W_, H_ = 900, 1040
    def __init__(self, P, ec):
        self.P, self.ec = P, ec
        self.t0 = ec['t0']
        w, h = self.W_, self.H_
        self.blank = card(w, h, 77, amp=8)
        c = Image.new('RGBA', (w, h), (0, 0, 0, 0))   # lower block (CTA/url/place), slides down when the logo lands
        d = ImageDraw.Draw(c)
        d.line([(w / 2 - 60, 600), (w / 2 + 60, 600)], fill=GOLD, width=4)
        y = 630
        if ec.get('cta'):
            cta = TextBlock(ec['cta'], 'serif', 50, 'Bold', fill=DEEP, max_w=w - 120, lang=P.lang, max_lines=3)
            cta.draw(c, w / 2, y); y += cta.h + 14
        self.url_y = y
        self.url = TextBlock(ec['url'], 'sans', 60, 'Bold', fill=GREEN, max_w=w - 100, lang='en')
        y += self.url.h + 22
        if ec.get('place') or ec.get('sub'):
            txt = ec.get('sub') or ''
            if ec.get('place'): txt = (txt + '  ·  ' if txt else '') + (ec['place'].upper() if P.lang == 'en' else ec['place'])
            TextBlock(txt, 'mono', 22, 'Medium', fill=(110, 100, 80), max_w=w - 80, lang=P.lang, max_lines=2).draw(c, w / 2, min(y, h - 80))
        self.lower = c
        lg = logo('stacked')
        sc = min(1.35, 380 / lg.height, (w - 160) / lg.width)
        self.logo = lg.resize((int(lg.width * sc), int(lg.height * sc)), Image.LANCZOS)
        self.tag = TextBlock(ec['tagline'], 'script', 64, 'Bold', fill=(120, 90, 60), max_w=w - 100, lang=P.lang, max_lines=2) \
            if ec.get('tagline') else None
    def blur(self, t):
        return pr(t, self.t0 - 0.3, 0.4)
    def draw(self, cv, t, t0=None):
        t0 = self.t0 if t0 is None else t0
        ec = pr(t, t0 - 0.1, 0.5, e_out3)
        if ec <= 0: return
        c = self.blank.copy()
        lt = self.ec['logo_t']
        dy = lerp(-300, 0, pr(t, lt - 0.4, 0.5, e_io3))   # CTA starts centred, makes room for the logo
        c.alpha_composite(self.lower, (0, int(dy)))
        lp = pr(t, lt - 0.12, 0.55, e_back)          # logo lands on the name
        if lp > 0:
            lg = self.logo
            s_ = max(0.05, 0.6 + 0.4 * lp)
            l2 = lg.resize((max(1, int(lg.width * s_)), max(1, int(lg.height * s_))), Image.BILINEAR)
            paste_tl(c, l2, (self.W_ - l2.width) / 2, 265 - l2.height / 2 + (1 - clamp(lp)) * 40, clamp(lp * 2))
        if self.tag:
            self.tag.draw(c, self.W_ / 2, 528 - self.tag.h / 2, pr(t, self.ec['tagline_t'] - 0.05, 0.45))
        self.url.draw(c, self.W_ / 2, self.url_y + dy, 1, hl={0: pr(t, t0 + 0.9, 0.45)})
        sp = shadowed(c, (12, 18), 18, 0.35)
        sx, sy = drift(t, 0.6, 6)
        cy = lerp(2500, 800, ec) + sy
        paste_c(cv, sp, W / 2 + sx, cy, 0.9, 1)

BEATS = {'hook': HookR, 'title': TitleR, 'big_stat': BigStatR, 'world_map_arcs': WorldArcsR, 'region_map': RegionR,
         'checklist': ChecklistR, 'ratio': RatioR, 'diagram': DiagramR, 'footage': FootageR, 'endcard': EndcardBeatR}
