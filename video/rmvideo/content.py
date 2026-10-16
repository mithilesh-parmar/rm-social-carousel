"""Script loading/validation, cue markers, translatable-string walking, content rules, glossary."""
import copy
import hashlib
import json
import os
import re

import yaml

from .config import load_yaml

CUE_RE = re.compile(r'\[\[([A-Za-z0-9_\-]+)\]\]')

# keys whose string values are viewer-facing copy (translated); everything else is config.
# NB `name` is never translated: it is a geo/data identifier (state, country, place).
TKEYS = {'tagline', 'cta', 'region', 'say', 'headline', 'headline2', 'kicker', 'label', 'sub', 'title', 'text', 'note',
         'format', 'result', 'left', 'right', 'caption', 'hashtags', 'unit', 'value_label', 'tag'}
# never translated even if the key matches (paths ending with these)
NO_T_PARENTS = {'stat', 'footage_meta'}

BEAT_TYPES = {'hook', 'title', 'big_stat', 'world_map_arcs', 'region_map', 'checklist', 'ratio',
              'diagram', 'footage', 'endcard'}

class ScriptError(Exception):
    pass

def load_script(path):
    with open(path, encoding='utf-8') as fh:
        if path.endswith('.json'):
            s = json.load(fh)
        else:
            s = yaml.safe_load(fh)
    s['_path'] = os.path.abspath(path)
    s.setdefault('slug', os.path.splitext(os.path.basename(path))[0])
    s.setdefault('style', 'process')
    s.setdefault('languages', ['en'])
    s.setdefault('source_lang', 'en')
    apply_brand(s)
    validate(s)
    return s

def brand():
    return load_yaml('brand.yaml')['brand']

def apply_brand(s):
    """default-on brand sign-off + endcard CTA/url (standing rule: every video ends on the name)"""
    b = brand()
    so = b.get('signoff', {})
    if s.get('signoff') is False or not so.get('enabled', True):
        s['signoff'] = None
    else:
        user = s.get('signoff') if isinstance(s.get('signoff'), dict) else {}
        tag = so.get('tagline', {})
        s['signoff'] = {'name': b['name'], 'name_spoken': b.get('name_spoken', b['name']),
                        'tagline': user.get('tagline') or tag.get(s.get('source_lang', 'en')) or '',
                        'pause': float(user.get('pause', so.get('pause', 0.4))),
                        '_pinned': {k: v for k, v in tag.items()}}
    if s.get('endcard') is not False:
        ec = s.get('endcard') or {}
        ec.setdefault('url', b.get('url'))
        ec.setdefault('cta', b.get('cta'))
        s['endcard'] = ec

def scene_beats(sc):
    if 'beats' in sc: return sc['beats']
    if 'beat' in sc: return [sc['beat']]
    return [{'type': 'footage'}]

def validate(s):
    errs = []
    if not s.get('scenes'): errs.append('script has no scenes')
    if s['style'] not in ('process', 'flat'): errs.append('style must be "process" or "flat", got %r' % s['style'])
    ids = set()
    for i, sc in enumerate(s.get('scenes', [])):
        sid = sc.get('id') or 'scene%d' % i
        sc['id'] = sid
        if sid in ids: errs.append('duplicate scene id %r' % sid)
        ids.add(sid)
        if not sc.get('say'): errs.append('scene %r has no "say" line' % sid)
        for b in scene_beats(sc):
            if b.get('type') not in BEAT_TYPES:
                errs.append('scene %r: unknown beat type %r (known: %s)' % (sid, b.get('type'), ', '.join(sorted(BEAT_TYPES))))
        cues = [m.group(1) for m in CUE_RE.finditer(sc.get('say', ''))]
        if len(cues) != len(set(cues)): errs.append('scene %r repeats a cue marker' % sid)
    ec = s.get('endcard')
    if ec is not None and not ec.get('url'): errs.append('endcard needs a url')
    if errs:
        raise ScriptError('%s:\n  - %s' % (s.get('_path', 'script'), '\n  - '.join(errs)))

def strip_cues(text):
    """-> (clean text, [(cue, char_pos_in_clean_text)])"""
    out, cues, last = [], [], 0
    pos = 0
    for m in CUE_RE.finditer(text):
        seg = text[last:m.start()]
        out.append(seg); pos += len(seg)
        cues.append((m.group(1), pos))
        last = m.end()
    out.append(text[last:])
    clean = ''.join(out)
    # collapse double spaces left by markers
    fixed = re.sub(r'  +', ' ', clean)
    if fixed != clean:  # remap positions
        mp, j = [], 0
        for k, ch in enumerate(clean):
            mp.append(j)
            if not (ch == ' ' and k > 0 and clean[k - 1] == ' '): j += 1
        mp.append(j)
        cues = [(c, mp[p]) for c, p in cues]
    return fixed.strip(), cues

# ---------------------------------------------------------------- translatable strings
def _walk(node, path, out, parent_key=None):
    if isinstance(node, dict):
        for k, v in node.items():
            if k.startswith('_'): continue
            if k in NO_T_PARENTS: continue
            _walk(v, path + [k], out, k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _walk(v, path + [i], out, parent_key)
    elif isinstance(node, str) and parent_key in TKEYS and node.strip():
        out['.'.join(map(str, path))] = node

def collect_strings(s):
    out = {}
    for k in ('scenes', 'endcard', 'post'):
        if s.get(k): _walk(s[k], [k], out)
    if s.get('signoff') and s['signoff'].get('tagline'):
        out['signoff.tagline'] = s['signoff']['tagline']   # the brand name itself is never translated
    return out

def apply_strings(s, strings):
    s2 = copy.deepcopy(s)
    for path, val in strings.items():
        node = s2; parts = path.split('.')
        for p in parts[:-1]:
            node = node[int(p)] if isinstance(node, list) else node[p]
        last = parts[-1]
        if isinstance(node, list): node[int(last)] = val
        else: node[last] = val
    return s2

def strings_hash(strings):
    return hashlib.sha256(json.dumps(strings, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

# ---------------------------------------------------------------- rules + glossary
def load_rules():
    return load_yaml('rules.yaml')['rules']

def check_rules(strings, lang='en'):
    """-> list of {rule, why, path, match, text}"""
    found = []
    for rule in load_rules():
        for pat in rule['patterns']:
            rx = re.compile(pat, re.I)
            for path, txt in strings.items():
                for m in rx.finditer(txt):
                    found.append({'rule': rule['id'], 'why': rule['why'], 'lang': lang, 'path': path,
                                  'match': m.group(0), 'text': txt})
    return found

def glossary_terms():
    return load_yaml('glossary.yaml')['keep']

def check_glossary(src, dst):
    """terms present in the source line must survive verbatim in the translation"""
    probs = []
    for path, s in src.items():
        d = dst.get(path, '')
        for term in sorted(glossary_terms(), key=len, reverse=True):
            if re.search(r'(?<![\w.])' + re.escape(term) + r'(?![\w])', s):
                if term not in d and term.lower() not in d.lower():
                    probs.append('%s: glossary term "%s" missing from translation' % (path, term))
        sc = sorted(CUE_RE.findall(s)); dc = sorted(CUE_RE.findall(d))
        if sc != dc:
            probs.append('%s: cue markers %s became %s' % (path, sc, dc))
    return probs
