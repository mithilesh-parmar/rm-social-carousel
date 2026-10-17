"""tts step: edge-tts narration + word timings -> auto-timed scenes.

* Narration = every scene's `say`, joined. Cue markers ([[name]]) are stripped first and
  remembered by character position.
* The pronunciation lexicon (data/lexicon.yaml) rewrites display text -> spoken text
  (e.g. "Sidhpur" is spoken "Sidpur"); a character map keeps both in sync so captions
  show the display spelling.
* edge-tts WordBoundary events are aligned back to the display text; scene t0/t1 and
  cue times fall out of that, so a translation (longer/shorter) re-times itself.
"""
import asyncio
import contextlib
import hashlib
import json
import os
import re
import subprocess
import time

from .config import WORK_DIR, dump_json, lang_info, load_yaml, read_json
from .content import strip_cues
from .text import is_cjk_char

PROXY_VARS = ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy')

@contextlib.contextmanager
def _no_proxy_env():
    # aiohttp (used by edge-tts) rejects some proxy URLs found in sandbox envs; the
    # edge-tts websocket connects directly.
    saved = {k: os.environ.pop(k) for k in PROXY_VARS if k in os.environ}
    if os.environ.get('RMVIDEO_TTS_PROXY'):
        os.environ['HTTPS_PROXY'] = os.environ['RMVIDEO_TTS_PROXY']
    try:
        yield
    finally:
        os.environ.pop('HTTPS_PROXY', None)
        os.environ.update(saved)

# ---------------------------------------------------------------- lexicon
def lexicon(lang):
    out = []
    for e in load_yaml('lexicon.yaml')['entries']:
        if e.get('langs') and lang not in e['langs']: continue
        out.append((e['display'], e['spoken']))
    # one display form -> first matching entry wins (lang-specific entries listed after
    # generic ones override them)
    best = {}
    for d, s in out: best[d] = s
    return sorted(best.items(), key=lambda x: -len(x[0]))

def apply_lexicon(disp, lang, extra=()):
    """-> spoken text, sp2disp (len(spoken)+1 ints), disp2sp (len(disp)+1 ints)"""
    reps = []
    taken = [False] * len(disp)
    for d, s in list(extra) + lexicon(lang):
        for m in re.finditer(r'(?<![\w])' + re.escape(d) + r'(?![\w])', disp):
            if any(taken[m.start():m.end()]): continue
            for k in range(m.start(), m.end()): taken[k] = True
            reps.append((m.start(), m.end(), s))
    reps.sort()
    spoken, sp2d, d2sp = [], [], [0] * (len(disp) + 1)
    i = 0
    def emit_plain(a, b):
        for k in range(a, b):
            d2sp[k] = len(spoken); sp2d.append(k); spoken.append(disp[k])
    for a, b, s in reps:
        emit_plain(i, a)
        base = len(spoken)
        for k in range(a, b): d2sp[k] = base
        for j, ch in enumerate(s):
            sp2d.append(a + (j * (b - a)) // max(1, len(s))); spoken.append(ch)
        i = b
    emit_plain(i, len(disp))
    d2sp[len(disp)] = len(spoken); sp2d.append(len(disp))
    return ''.join(spoken), sp2d, d2sp

# ---------------------------------------------------------------- edge-tts
async def _synth(text, voice, rate, mp3):
    import edge_tts
    words = []
    try:
        c = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary')
    except TypeError:
        c = edge_tts.Communicate(text, voice, rate=rate)
    with open(mp3, 'wb') as f:
        async for ch in c.stream():
            if ch['type'] == 'audio':
                f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                words.append({'t0': round(ch['offset'] / 1e7, 3), 't1': round((ch['offset'] + ch['duration']) / 1e7, 3),
                              'w': ch['text']})
    return words

def synth(text, voice, rate, mp3, tries=3):
    last = None
    for k in range(tries):
        try:
            with _no_proxy_env():
                w = asyncio.run(_synth(text, voice, rate, mp3))
            if w: return w
            last = RuntimeError('edge-tts returned no word boundaries')
        except Exception as e:  # network hiccups
            last = e
        time.sleep(2 + 3 * k)
    raise RuntimeError('edge-tts failed for voice %s: %s' % (voice, last))

def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'csv=p=0', path]).decode().strip())

# ---------------------------------------------------------------- alignment
def _norm(s):
    return re.sub(r'[\W_]+', '', s.lower())

def align(spoken, bwords):
    """boundary words -> spoken char spans (sequential search)"""
    spans, cur = [], 0
    low = spoken.lower()
    for b in bwords:
        t = b['w'].strip().lower()
        i = low.find(t, cur, cur + len(t) + 60) if t else -1
        if i < 0 and _norm(t):
            # punctuation differences: search on the first alnum chunk
            m = re.search(r'\w+', t)
            i = low.find(m.group(0), cur, cur + len(t) + 60) if m else -1
        if i < 0:
            i = cur
        spans.append((i, min(len(spoken), i + max(1, len(t)))))
        cur = spans[-1][1]
    return spans

CJK_PUNCT = set('，。？！、：；…（）「」《》“”')

def build_words(disp, sp2d, bwords, spans, cjk):
    """display-level caption words [{w, a, b, t0, t1}] (a,b = display char span)"""
    bd = []
    for bw, (sa, sb) in zip(bwords, spans):
        da = sp2d[min(sa, len(sp2d) - 1)]; db = sp2d[min(max(sa, sb - 1), len(sp2d) - 1)] + 1
        bd.append((da, db, bw['t0'], bw['t1']))
    words = []
    if cjk:
        bd.sort()
        for k, (da, db, t0, t1) in enumerate(bd):
            nxt = bd[k + 1][0] if k + 1 < len(bd) else len(disp)
            e = db
            # keep trailing punctuation (incl. full-width ，。？！、) with the word: captions break on it
            while e < nxt and e < len(disp) and not disp[e].isalnum() and (not is_cjk_char(disp[e]) or disp[e] in CJK_PUNCT): e += 1
            if words and da < words[-1]['b']:
                da = words[-1]['b']
            txt = disp[da:e].strip()
            if txt:
                words.append({'w': txt, 'a': da, 'b': e, 't0': t0, 't1': t1})
            elif words:
                words[-1]['t1'] = max(words[-1]['t1'], t1)
        return words
    for m in re.finditer(r'\S+', disp):
        a, b = m.start(), m.end()
        hit = [x for x in bd if x[0] < b and x[1] > a]
        if hit:
            words.append({'w': m.group(0), 'a': a, 'b': b, 't0': min(x[2] for x in hit), 't1': max(x[3] for x in hit)})
        elif words and not re.search(r'\w', m.group(0)):
            words[-1]['w'] += ' ' + m.group(0); words[-1]['b'] = b   # stray punctuation / dash
        else:
            words.append({'w': m.group(0), 'a': a, 'b': b, 't0': None, 't1': None})
    # interpolate words the voice did not report
    for k, w in enumerate(words):
        if w['t0'] is None:
            prev = next((x for x in reversed(words[:k]) if x['t0'] is not None), None)
            nxt = next((x for x in words[k + 1:] if x['t0'] is not None), None)
            w['t0'] = prev['t1'] if prev else (nxt['t0'] - 0.3 if nxt else 0)
            w['t1'] = nxt['t0'] if nxt else w['t0'] + 0.3
    return words

# ---------------------------------------------------------------- public
def run_tts(script, lang, force=False, log=print):
    info = lang_info(lang)
    voice = (script.get('voices') or {}).get(lang) or info['voice']
    rate = (script.get('rates') or {}).get(lang) or info.get('rate', '+0%')
    cjk = bool(info.get('cjk'))
    sep = '' if cjk else ' '
    disp, scene_spans, cues = '', [], []
    for sc in script['scenes']:
        clean, cs = strip_cues(sc['say'])
        if disp: disp += sep
        a = len(disp); disp += clean
        scene_spans.append((sc['id'], a, len(disp)))
        cues += [(sc['id'], name, a + p) for name, p in cs]
    spoken, sp2d, d2sp = apply_lexicon(disp, lang)
    so = script.get('signoff')
    so_disp = so_spoken = None
    if so:
        so_disp = '%s.%s%s' % (so['name'], '' if cjk else ' ', so.get('tagline', '')) if so.get('tagline') else so['name'] + '.'
        tag_sp = apply_lexicon(so.get('tagline', ''), lang)[0]
        name_sp = (so.get('_spoken_by_lang') or {}).get(lang) or so['name_spoken']
        so_spoken = '%s.%s%s' % (name_sp, '' if cjk else ' ', tag_sp) if tag_sp else name_sp + '.'
    key = hashlib.sha256(json.dumps([spoken, voice, rate, so_spoken, so and so['pause'], 3]).encode()).hexdigest()[:16]
    wd = os.path.join(WORK_DIR, script['slug'], lang)
    os.makedirs(wd, exist_ok=True)
    tl_path = os.path.join(wd, 'timeline.json')
    mp3 = os.path.join(wd, 'voice.mp3')
    if not force and os.path.exists(tl_path) and os.path.exists(mp3):
        tl = read_json(tl_path)
        if tl.get('key') == key:
            log('  [%s] tts cached (%.1fs, %s)' % (lang, tl['duration'], voice))
            return tl
    log('  [%s] tts: %s %s, %d chars' % (lang, voice, rate, len(spoken)))
    main_mp3 = os.path.join(wd, 'voice_main.mp3')
    bwords = synth(spoken, voice, rate, main_mp3)
    spans = align(spoken, bwords)
    words = build_words(disp, sp2d, bwords, spans, cjk)
    speech_end = max(b['t1'] for b in bwords)
    signoff = None
    if so:
        # the sign-off is synthesised on its own and placed after an exact pause, so
        # the brand name always lands cleanly as the very last spoken line
        so_mp3 = os.path.join(wd, 'voice_signoff.mp3')
        sw = synth(so_spoken, voice, rate, so_mp3)
        off = speech_end + so['pause'] - sw[0]['t0']
        sp_s, s2d, _ = apply_lexicon(so_disp, lang, extra=[(so['name'], name_sp)])
        sw_shift = [dict(b, t0=round(b['t0'] + off, 3), t1=round(b['t1'] + off, 3)) for b in sw]
        so_words = build_words(so_disp, s2d, sw_shift, align(sp_s, sw_shift), cjk)
        subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', main_mp3, '-i', so_mp3, '-filter_complex',
                               '[1:a]adelay=%d:all=1[s];[0:a][s]amix=inputs=2:duration=longest:normalize=0' % int(off * 1000),
                               '-c:a', 'libmp3lame', '-q:a', '2', mp3])
        name_words = [w for w in so_words if w['a'] < len(so['name']) + 1]
        signoff = {'t0': round(so_words[0]['t0'], 3), 'name_t0': round(name_words[0]['t0'], 3),
                   'name_t1': round(name_words[-1]['t1'], 3), 't1': round(so_words[-1]['t1'], 3),
                   'text': so_disp, 'spoken': so_spoken, 'pause': so['pause']}
        bwords = bwords + sw_shift
    else:
        subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', main_mp3, '-c', 'copy', mp3])
    dur = duration(mp3)
    # scenes
    scenes = []
    for k, (sid, a, b) in enumerate(scene_spans):
        ws = [w for w in words if a <= w['a'] < b]
        t0 = 0.0 if k == 0 else (ws[0]['t0'] if ws else scenes[-1]['t0'] + 0.5)
        scenes.append({'id': sid, 't0': round(t0, 3), 'a': a, 'b': b, 'cues': {}})
    hold = float((script.get('endcard') or {}).get('hold', 1.4))
    total = round(max(dur, max(b['t1'] for b in bwords)) + hold, 3)
    for k, s_ in enumerate(scenes):
        s_['t1'] = scenes[k + 1]['t0'] if k + 1 < len(scenes) else total
    for w in words:
        w['scene'] = next(k for k, (sid, a, b) in enumerate(scene_spans) if w['a'] < b or k == len(scene_spans) - 1)
    for sid, name, pos in cues:
        s_ = next(x for x in scenes if x['id'] == sid)
        w = next((w for w in words if w['a'] >= pos), None)
        s_['cues'][name] = round(w['t0'] if w else s_['t0'], 3)
    if signoff:
        for w in so_words:
            w['scene'] = len(scenes) - 1; w['signoff'] = True
        words = words + so_words
    tl = {'key': key, 'lang': lang, 'voice': voice, 'rate': rate, 'audio': mp3, 'duration': round(dur, 3),
          'speech_end': round(max(b['t1'] for b in bwords), 3), 'narration_end': round(speech_end, 3), 'total': total,
          'display_text': disp, 'spoken_text': spoken, 'scenes': scenes, 'signoff': signoff,
          'words': [{'w': w['w'], 't0': round(w['t0'], 3), 't1': round(w['t1'], 3), 'scene': w['scene'],
                     **({'signoff': True} if w.get('signoff') else {})} for w in words],
          'boundaries': bwords}
    dump_json(tl, tl_path)
    log('  [%s] voice %.1fs, %d words, scenes: %s%s' % (lang, dur, len(words), ', '.join('%s@%.1f' % (x['id'], x['t0']) for x in scenes),
                                                  (', signoff@%.1f' % signoff['t0']) if signoff else ''))
    return tl
