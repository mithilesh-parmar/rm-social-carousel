"""Multi-script text engine for the video renderers.

Every piece of on-screen copy (headlines, labels, captions) goes through here so a
translated script renders correctly in Latin, Cyrillic, Devanagari, Arabic (RTL, shaped
by libraqm) and CJK (character-level wrapping).

Fonts are picked per *run of characters*: each style role ("serif", "display", "hand",
...) is a stack of font files; a run uses the first font in the stack whose cmap covers
it. So a Hindi headline in the "serif" role falls through Playfair Display (no
Devanagari) to Noto Sans Devanagari automatically, and a Latin brand name inside an
Arabic caption still renders in the style's Latin face.
"""
import os
import re
import unicodedata

from PIL import Image, ImageDraw, ImageFont, features

from .config import FONT_DIR

HAS_RAQM = features.check('raqm')
LAYOUT = ImageFont.Layout.RAQM if HAS_RAQM else ImageFont.Layout.BASIC

WEIGHTS = {'Regular': 400, 'Medium': 500, 'SemiBold': 600, 'Bold': 700, 'ExtraBold': 800, 'Black': 900}

DEVA = 'NotoSansDevanagari[wdth,wght].ttf'
ARAB = 'NotoSansArabic[wdth,wght].ttf'
CJK = 'NotoSansSC[wght].ttf'
INTER = 'Inter[opsz,wght].ttf'

# role -> list of (font file, fixed weight or None = use requested weight)
STACKS = {
    'sans':    [(INTER, None), (DEVA, None), (ARAB, None), (CJK, None)],
    'serif':   [('PlayfairDisplay[wght].ttf', None), (DEVA, None), (ARAB, None), (CJK, None), (INTER, None)],
    'display': [('ArchivoBlack-Regular.ttf', None), (INTER, 'Black'), (DEVA, 'Black'), (ARAB, 'Black'), (CJK, 'Black')],
    'hand':    [('PermanentMarker-Regular.ttf', None), ('Caveat[wght].ttf', 'Bold'), ('Kalam-Bold.ttf', None),
                (ARAB, 'Bold'), (CJK, 'Bold'), (INTER, 'Bold')],
    'script':  [('Caveat[wght].ttf', 'Bold'), ('Kalam-Bold.ttf', None), (ARAB, 'SemiBold'), (CJK, 'Medium'), (INTER, 'SemiBold')],
    'mono':    [('IBMPlexMono-Medium.ttf', None), (DEVA, 'Medium'), (ARAB, 'Medium'), (CJK, 'Medium'), (INTER, 'Medium')],
}

RTL_LANGS = {'ar', 'he', 'fa', 'ur'}
CJK_LANGS = {'zh', 'ja', 'ko', 'zh-CN', 'zh-TW'}

# ---------------------------------------------------------------- font loading + coverage
_cmaps = {}
def _cmap(path):
    if path not in _cmaps:
        from fontTools.ttLib import TTFont
        try:
            _cmaps[path] = set(TTFont(path, lazy=True).getBestCmap().keys())
        except Exception:
            _cmaps[path] = set()
    return _cmaps[path]

_fonts = {}
def _font(fname, size, weight):
    k = (fname, int(size), weight)
    if k not in _fonts:
        path = os.path.join(FONT_DIR, fname)
        if not os.path.exists(path):
            _fonts[k] = None
            return None
        f = ImageFont.truetype(path, int(size), layout_engine=LAYOUT)
        try:
            axes = f.get_variation_axes()
            vals = []
            for ax in axes:
                nm = ax.get('name', b'')
                nm = nm.decode() if isinstance(nm, bytes) else str(nm)
                if nm.lower().startswith('weight') or nm == 'wght':
                    vals.append(max(ax['minimum'], min(ax['maximum'], WEIGHTS.get(weight, 700))))
                elif nm.lower().startswith('optical') or nm == 'opsz':
                    vals.append(max(ax['minimum'], min(ax['maximum'], 32)))
                else:
                    vals.append(ax.get('default', ax['minimum']))
            if vals:
                f.set_variation_by_axes(vals)
        except Exception:
            pass  # static font
        _fonts[k] = f
    return _fonts[k]

def stack(role, size, weight='Bold'):
    """[(ImageFont, cmap_set)] for a role, missing files skipped"""
    out = []
    for fname, fixed in STACKS.get(role, STACKS['sans']):
        f = _font(fname, size, fixed or weight)
        if f is not None:
            out.append((f, _cmap(os.path.join(FONT_DIR, fname))))
    return out

def missing_fonts():
    names = {f for st in STACKS.values() for f, _ in st}
    return sorted(n for n in names if not os.path.exists(os.path.join(FONT_DIR, n)))

# ---------------------------------------------------------------- script helpers
def is_rtl_char(c):
    return unicodedata.bidirectional(c) in ('R', 'AL')

def is_cjk_char(c):
    o = ord(c)
    return (0x3000 <= o <= 0x30FF or 0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF or
            0xF900 <= o <= 0xFAFF or 0xFF00 <= o <= 0xFFEF or 0xAC00 <= o <= 0xD7AF)

def _inherits(c):
    return unicodedata.category(c).startswith('M') or c in '\u200c\u200d'

def runs(token, fonts):
    """split a token into (text, font) runs by cmap coverage"""
    out = []
    for c in token:
        if out and (_inherits(c) or c.isspace()):
            out[-1][0] += c; continue
        fi = len(fonts) - 1
        for i, (_, cm) in enumerate(fonts):
            if ord(c) in cm:
                fi = i; break
        if out and out[-1][1] == fi:
            out[-1][0] += c
        else:
            out.append([c, fi])
    return [(t, fonts[i][0]) for t, i in out]

def tokenize_marked(text, lang='en'):
    """-> (tokens [(word, space_before)], emphasised token indices). *word* marks emphasis."""
    toks, emph = [], set()
    parts = text.split('*')
    if len(parts) % 2 == 0: parts = [text.replace('*', '')]   # unbalanced: ignore markup
    for k, seg in enumerate(parts):
        if not seg: continue
        tt = tokenize(seg, lang)
        if tt and toks and tt[0][0] != '\n':
            spc = seg[:1].isspace() or (k > 0 and parts[k - 1][-1:].isspace())
            tt[0] = (tt[0][0], spc)
        for w in tt:
            if k % 2 == 1 and w[0] != '\n': emph.add(sum(1 for x in toks if x[0] != '\n'))
            toks.append(w)
    return toks, emph

def tokenize(text, lang='en'):
    """-> list of (word, space_before). '|' forces a line break (returned as ('\\n', False))."""
    out = []
    for m in re.finditer(r'\S+', text.replace('\n', ' | ')):
        w = m.group(0)
        sp = m.start() > 0
        if w == '|':
            out.append(('\n', False)); continue
        if any(is_cjk_char(c) for c in w):
            # character-level units for CJK; latin/digit runs stay whole; closing punctuation sticks
            parts = re.findall(r'[A-Za-z0-9%.,+\-₹$€/]+|.', w)
            first = True
            for p in parts:
                if out and not first and p in '，。、！？：；」』）》%' and out[-1][0] != '\n':
                    out[-1] = (out[-1][0] + p, out[-1][1])
                else:
                    out.append((p, sp if first else False))
                first = False
        else:
            out.append((w, sp))
    return out

# ---------------------------------------------------------------- word sprites
_wcache = {}
def word_sprite(word, role, size, weight, col, pad=6):
    """RGBA sprite of one token. returns (sprite, advance_width, ascent)"""
    k = (word, role, int(size), weight, tuple(col))
    if k in _wcache: return _wcache[k]
    fonts = stack(role, size, weight)
    rs = runs(word, fonts)
    rtl = any(is_rtl_char(c) for c in word)
    asc = max(f.getmetrics()[0] for _, f in rs) if rs else size
    desc = max(f.getmetrics()[1] for _, f in rs) if rs else size // 4
    widths = []
    for t, f in rs:
        d = 'rtl' if (rtl and any(is_rtl_char(c) for c in t) and HAS_RAQM) else None
        widths.append(f.getlength(t, direction=d) if d else f.getlength(t))
    wsum = sum(widths)
    im = Image.new('RGBA', (int(wsum) + pad * 2 + 2, asc + desc + pad * 2), tuple(col) + (0,))
    d = ImageDraw.Draw(im)
    order = list(range(len(rs)))
    if rtl: order.reverse()
    x = pad
    for i in order:
        t, f = rs[i]
        dirn = 'rtl' if (rtl and any(is_rtl_char(c) for c in t) and HAS_RAQM) else None
        if dirn:
            d.text((x, pad + asc), t, font=f, fill=tuple(col) + (255,), anchor='ls', direction=dirn)
        else:
            d.text((x, pad + asc), t, font=f, fill=tuple(col) + (255,), anchor='ls')
        x += widths[i]
    res = (im, wsum, asc)
    _wcache[k] = res
    if len(_wcache) > 6000: _wcache.clear()
    return res

def measure(word, role, size, weight='Bold'):
    return word_sprite(word, role, size, weight, (0, 0, 0))[1]

# ---------------------------------------------------------------- text blocks
class TextBlock:
    """Wrapped, multi-script block of words with per-word geometry (for highlights/karaoke).

    words: list of (word, space_before) or a plain string (tokenized).
    items: [word, x, y, w, line_index] in block coords (x from left; RTL lines already mirrored).
    """
    def __init__(self, text, role='sans', size=60, weight='Bold', fill=(11, 16, 13), max_w=960,
                 lh=1.15, align='center', colors=None, lang='en', max_lines=None, min_size=None):
        self.lang = lang
        self.rtl = lang.split('-')[0] in RTL_LANGS
        if isinstance(text, str):
            toks, self.emph = tokenize_marked(text, lang)
        else:
            toks, self.emph = list(text), set()
        self.role, self.weight, self.fill, self.colors = role, weight, fill, colors or {}
        size = int(size)
        min_size = int(min_size or size * 0.6)
        while True:
            self._layout(toks, size, max_w, lh, align)
            if (max_lines is None or len(self.lines) <= max_lines) and self.w <= max_w + 2 or size <= min_size:
                break
            size = max(min_size, int(size * 0.92))
        self.size = size

    def _layout(self, toks, size, max_w, lh, align):
        sp = measure(' ', self.role, size, self.weight) or size * 0.28
        lines = [[]]; cur = 0
        for wd, spb in toks:
            if wd == '\n':
                if lines[-1]: lines.append([])
                cur = 0; continue
            wl = measure(wd, self.role, size, self.weight)
            gap = sp if (lines[-1] and spb) else 0
            if lines[-1] and cur + gap + wl > max_w:
                lines.append([]); cur = 0; gap = 0
            lines[-1].append((wd, gap, wl)); cur += gap + wl
        lines = [L for L in lines if L] or [[]]
        fonts = stack(self.role, size, self.weight)
        asc = max([f.getmetrics()[0] for f, _ in fonts[:1]] + [word_sprite(w, self.role, size, self.weight, (0, 0, 0))[2] for L in lines for w, _, _ in L])
        desc = int(size * 0.32)
        self.asc, self.desc = asc, desc
        self.lhpx = int((asc + desc) * lh)
        widths = [sum(g + w for _, g, w in L) for L in lines]
        self.w = int(max(widths + [1])) + 2
        self.h = self.lhpx * len(lines)
        self.items = []; self.lines = lines
        idx = 0
        for li, L in enumerate(lines):
            lw = widths[li]
            # 'start' alignment = left for LTR, right for RTL
            if align == 'center': x0 = (self.w - lw) / 2
            elif align == 'start': x0 = self.w - lw if self.rtl else 0
            elif align == 'right': x0 = self.w - lw
            else: x0 = 0
            pos = []; x = 0
            for wd, g, wl in L:
                x += g; pos.append((wd, x, wl)); x += wl
            if self.rtl:
                # bidi-lite: runs of LTR tokens (Latin/digits) keep their internal order,
                # runs themselves flow right-to-left
                runs_, cur = [], []
                for k, (wd, g, wl) in enumerate(L):
                    ltr = not any(is_rtl_char(c) for c in wd) and any(c.isalnum() for c in wd)
                    if cur and cur[-1][3] == ltr and ltr:
                        cur.append((wd, g, wl, ltr))
                    else:
                        if cur: runs_.append(cur)
                        cur = [(wd, g, wl, ltr)]
                if cur: runs_.append(cur)
                pos = []; xr = x0 + lw
                for ri, run in enumerate(runs_):
                    if ri: xr -= run[0][1]
                    rw = sum(w for _, _, w, _ in run) + sum(g for _, g, _, _ in run[1:])
                    xl = xr - rw; xx = xl
                    for k, (wd, g, wl, _) in enumerate(run):
                        if k: xx += g
                        pos.append((wd, xx, wl)); xx += wl
                    xr = xl
            else:
                pos = [(wd, x0 + px, wl) for wd, px, wl in pos]
            for wd, px, wl in pos:
                self.items.append([wd, px, li * self.lhpx, wl, li]); idx += 1
        self.n = idx
        self._size = size

    def sprite(self, i, col=None):
        wd = self.items[i][0]
        c = col or self.colors.get(i, self.fill)
        return word_sprite(wd, self.role, self._size, self.weight, c)

    def draw(self, cv, cx, top, alpha=1.0, walpha=None, wdy=None, hl=None, hlseed=0, hl_fn=None, col=None, x_left=None):
        """paste onto an RGB canvas. hl: {word_index: progress} drawn with hl_fn(cv,x,y,w,h,p,seed,alpha,rtl)."""
        from .fx import paste_tl, draw_hl
        x0 = (cx - self.w / 2) if x_left is None else x_left
        if hl:
            fn = hl_fn or draw_hl
            for i, it in enumerate(self.items):
                p = hl.get(i, 0)
                if p <= 0: continue
                wa = walpha(i) if walpha else 1
                if wa <= 0.05: continue
                hh = int(self._size * 0.78)
                fn(cv, x0 + it[1] - 10, top + it[2] + self.asc - hh * 0.92 + (wdy(i) if wdy else 0), it[3] + 20, hh, p, hlseed + i, alpha * wa, self.rtl)
        for i, it in enumerate(self.items):
            a = alpha * (walpha(i) if walpha else 1)
            if a <= 0.004: continue
            sp, _, asc = self.sprite(i, col)
            dy = wdy(i) if wdy else 0
            paste_tl(cv, sp, x0 + it[1] - 6, top + it[2] + (self.asc - asc) - 6 + dy, a)

    def mask(self):
        """L mask of the whole block (for flat-colour compositing)"""
        m = Image.new('L', (self.w + 12, self.h + 12), 0)
        for i, it in enumerate(self.items):
            sp, _, asc = self.sprite(i, (255, 255, 255))
            m.paste(sp.getchannel('A'), (int(it[1]), int(it[2] + self.asc - asc)), sp.getchannel('A'))
        return m

    def word_box(self, i):
        it = self.items[i]
        return it[1], it[2], it[3], self.lhpx
