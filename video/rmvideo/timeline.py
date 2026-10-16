"""Timeline: the localised script + tts timings resolved into absolute beat windows,
cue times and caption groups. Styles render from this object only."""
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
        self.captions = build_caption_groups(self.words, [s['t0'] for s in self.scenes], self.total, self.cjk)

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

def build_caption_groups(words, scene_starts, total, cjk=False, max_words=3, max_w=860, size=58):
    """-> [{t0, t1, words:[{w,t0,t1}]}]"""
    phrases = [g.split() for g in glossary_terms() if ' ' in g]
    groups, cur = [], []
    maxw = 7 if cjk else max_words
    for i, w in enumerate(words):
        if cur:
            prev = words[i - 1]
            gap = w['t0'] - prev['t1']
            newscene = any(prev['t0'] < s <= w['t0'] + 1e-6 for s in scene_starts)
            sep = '' if cjk else ' '
            width = measure(sep.join(x['w'] for x in cur + [w]), 'sans', size, 'Bold')
            nchars = sum(len(x['w']) for x in cur + [w])
            keep = any(len(p) > 1 and cur[-1]['w'].strip('.,') == p[0] and w['w'].strip('.,!?') == p[1] for p in phrases)
            limit = len(cur) >= maxw or (cjk and nchars > 12)
            if not keep and (limit or gap > 0.28 or newscene or width > max_w or prev['w'][-1:] in '.?!。？！'):
                groups.append(cur); cur = []
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
