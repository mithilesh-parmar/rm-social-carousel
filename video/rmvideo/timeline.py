"""Timeline: the localised script + tts timings resolved into absolute beat windows,
cue times and caption groups. Styles render from this object only."""
from .config import load_yaml
from .content import glossary_terms, scene_beats
from .text import measure

class Beat:
    def __init__(self, scene, spec, t0, t1, cues, index):
        self.scene = scene          # localised scene dict
        self.spec = spec            # beat params (localised strings)
        self.type = spec['type']
        self.t0, self.t1 = t0, t1
        self.cues = cues            # scene cues (absolute seconds)
        self.index = index          # global beat index

    def cue(self, name, frac=None, default=None):
        """absolute time of a cue; else t0 + frac * duration; else default"""
        if name and name in self.cues and self.t0 - 0.05 <= self.cues[name] <= self.t1 + 0.05:
            return self.cues[name]
        if name and name in self.cues:
            return self.cues[name]
        if frac is not None:
            return self.t0 + frac * (self.t1 - self.t0)
        return self.t0 if default is None else default

    @property
    def dur(self):
        return self.t1 - self.t0

    def get(self, k, d=None):
        return self.spec.get(k, d)

class Timeline:
    def __init__(self, script, tl, lang_info):
        self.script, self.tl, self.lang = script, tl, lang_info
        self.code = lang_info['code']
        self.rtl = bool(lang_info.get('rtl'))
        self.cjk = bool(lang_info.get('cjk'))
        self.total = tl['total']
        self.speech_end = tl.get('speech_end', tl['duration'])
        self.words = tl['words']
        self.scenes = []
        self.beats = []
        for sc, st in zip(script['scenes'], tl['scenes']):
            assert sc['id'] == st['id'], 'timeline out of sync with script (re-run tts)'
            specs = scene_beats(sc)
            t0, t1 = st['t0'], st['t1']
            # split scene among its beats: explicit start_cue wins, else weights
            starts = []
            ws = [float(b.get('weight', 1)) for b in specs]
            acc = 0
            for b, w in zip(specs, ws):
                if b.get('start_cue') and b['start_cue'] in st['cues']:
                    starts.append(st['cues'][b['start_cue']] - 0.15)
                else:
                    starts.append(t0 + (t1 - t0) * acc / sum(ws))
                acc += w
            starts[0] = t0
            for k, b in enumerate(specs):
                e = starts[k + 1] if k + 1 < len(specs) else t1
                self.beats.append(Beat(sc, b, starts[k], e, st['cues'], len(self.beats)))
            self.scenes.append({'id': sc['id'], 't0': t0, 't1': t1, 'cues': st['cues'], 'scene': sc})
        ec = script.get('endcard')
        self.signoff = tl.get('signoff')
        self.endcard = None
        if ec:
            last = self.scenes[-1]
            nar_end = tl.get('narration_end', self.speech_end)
            start = last['cues'].get('end', max(last['t0'], nar_end - 1.3))
            so = self.signoff or {}
            self.endcard = dict(ec, t0=start, t1=self.total,
                                logo_t=so.get('name_t0', start + 0.6),        # logo animates in on the spoken name
                                tagline_t=so.get('name_t1', start + 1.2),
                                tagline=(script.get('signoff') or {}).get('tagline'),
                                brand=(script.get('signoff') or {}).get('name', 'RM Psyllium'))
        self.captions = build_caption_groups(self.words, [s['t0'] for s in self.scenes], self.total, self.cjk,
                                             lang=self.code)

    def beat_at(self, t):
        b = self.beats[0]
        for x in self.beats:
            if t >= x.t0 - 1e-6: b = x
        return b

    def scene_index(self, t):
        k = 0
        for i, s in enumerate(self.scenes):
            if t >= s['t0'] - 1e-6: k = i
        return k

    def ui(self, key, default=''):
        return self.lang.get('ui', {}).get(key, default)

# words a caption group should not end on (they belong with the next word)
NOBREAK_AFTER = {
    'ru': {'в', 'во', 'и', 'с', 'со', 'на', 'о', 'об', 'к', 'ко', 'у', 'по', 'для', 'от', 'из', 'за', 'а', 'но',
           'не', 'до', 'при', 'без', 'над', 'под', 'что', 'как'},
}
CJK_HARD = '，。？！、：；,.?!:;…'
CJK_BAD_START = set('的中了地得里上们吗呢吧')     # particles/suffixes that belong to the previous chunk
CJK_BAD_END = set('在和与把被从向为对将约')        # prepositions/conjunctions that lead into the next chunk

def _is_ascii_alnum(ch):
    return ch.isascii() and ch.isalnum()

def merge_latin_runs(words):
    """CJK timelines: 'RM' + 'Psyllium' -> one caption word 'RM Psyllium' (shown with its space)"""
    out = []
    for w in words:
        if out and out[-1]['w'][-1:] and _is_ascii_alnum(out[-1]['w'][-1]) and _is_ascii_alnum(w['w'][:1] or ' ') \
                and out[-1].get('scene') == w.get('scene'):
            # display letters the voice spelled out ('R','M' of 'RM') rejoin without a space
            sep = '' if len(out[-1]['w'].split(' ')[-1]) == 1 and len(w['w']) == 1 else ' '
            out[-1] = dict(out[-1], w=out[-1]['w'] + sep + w['w'], t1=w['t1'])
        else:
            out.append(dict(w))
    return out

def cjk_keep_terms():
    try:
        return [t for t in (load_yaml('glossary.yaml').get('cjk_keep') or []) if t]
    except Exception:
        return []

def _cjk_split(phrase, max_chars):
    """split one punctuation-delimited phrase (list of words) into balanced chunks at word
    boundaries, never inside a protected term (glossary cjk_keep) and avoiding particles"""
    text = ''.join(w['w'] for w in phrase)
    n = len(text)
    if n <= max_chars or len(phrase) < 2:
        return [phrase]
    k = -(-n // max_chars)
    pos, acc = [], 0
    for w in phrase[:-1]:
        acc += len(w['w']); pos.append(acc)          # candidate cut after word i
    bad = set()
    for term in cjk_keep_terms():
        st = text.find(term)
        while st >= 0:
            bad.update(range(st + 1, st + len(term)))
            st = text.find(term, st + 1)
    def cost(p):
        c = 0.0
        if p in bad: c += 100
        if text[p:p + 1] in CJK_BAD_START: c += 6
        if text[p - 1:p] in CJK_BAD_END: c += 6
        return c
    best = None
    import itertools
    idx = list(range(len(pos)))
    for combo in itertools.combinations(idx, k - 1):
        cuts = [pos[i] for i in combo]
        edges = [0] + cuts + [n]
        lens = [b - a for a, b in zip(edges, edges[1:])]
        if max(lens) > max_chars + 3: continue
        sc = sum(cost(c) for c in cuts) + sum((l - n / k) ** 2 for l in lens) * 0.3
        if best is None or sc < best[0]: best = (sc, combo)
    if best is None:
        return _cjk_split(phrase, max_chars + 2)
    out, last = [], 0
    for i in best[1]:
        out.append(phrase[last:i + 1]); last = i + 1
    out.append(phrase[last:])
    return out

def build_caption_groups(words, scene_starts, total, cjk=False, max_words=3, max_w=860, size=58, lang=None):
    """-> [{t0, t1, words:[{w,t0,t1}]}]"""
    phrases = [g.split() for g in glossary_terms() if ' ' in g]
    groups, cur = [], []
    if cjk:
        words = merge_latin_runs(words)
        for i, w in enumerate(words):
            if cur:
                prev = words[i - 1]
                gap = w['t0'] - prev['t1']
                newscene = any(prev['t0'] < s <= w['t0'] + 1e-6 for s in scene_starts)
                if gap > 0.28 or newscene or prev['w'][-1:] in CJK_HARD or prev.get('signoff') != w.get('signoff'):
                    groups.append(cur); cur = []
            cur.append(w)
        if cur: groups.append(cur)
        groups = [c for g in groups for c in _cjk_split(g, 13)]
        # subtitle convention: no trailing ，。、：； (keep ？！)
        groups = [g[:-1] + [dict(g[-1], w=g[-1]['w'].rstrip('，。、：；,;:') or g[-1]['w'])] for g in groups]
    else:
        nob = NOBREAK_AFTER.get(lang or '', set())
        for i, w in enumerate(words):
            if cur:
                prev = words[i - 1]
                gap = w['t0'] - prev['t1']
                newscene = any(prev['t0'] < s <= w['t0'] + 1e-6 for s in scene_starts)
                width = measure(' '.join(x['w'] for x in cur + [w]), 'sans', size, 'Bold')
                keep = any(len(p) > 1 and cur[-1]['w'].strip('.,') == p[0] and w['w'].strip('.,!?') == p[1] for p in phrases)
                soft = cur[-1]['w'].lower().strip('.,!?') in nob and width <= max_w and len(cur) <= max_words
                limit = len(cur) >= max_words
                if not keep and ((not soft and (limit or width > max_w)) or gap > 0.28 or newscene
                                 or prev['w'][-1:] in '.?!'):
                    carry = []
                    if len(cur) > 1 and cur[-1]['w'].lower().strip('.,!?') in nob and gap <= 0.28 and not newscene:
                        carry = [cur.pop()]          # a dangling preposition/conjunction moves to the next group
                    groups.append(cur); cur = carry
            cur.append(w)
        if cur: groups.append(cur)
    out = []
    for gi, g in enumerate(groups):
        t0 = g[0]['t0'] - 0.05
        t1 = groups[gi + 1][0]['t0'] - 0.05 if gi + 1 < len(groups) else total
        t1 = min(t1, g[-1]['t1'] + 0.6)
        out.append({'t0': max(0, t0), 't1': t1, 'words': g})
    return out

def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return '%02d:%02d:%02d,%03d' % (h, m, s, ms)

def write_srt(timeline, path):
    sep = '' if timeline.cjk else ' '
    lines = []
    for i, g in enumerate(timeline.captions, 1):
        lines += [str(i), '%s --> %s' % (srt_time(g['t0']), srt_time(g['t1'])), sep.join(w['w'] for w in g['words']), '']
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
