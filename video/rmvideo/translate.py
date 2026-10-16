"""translate step: script strings -> <slug>.<lang>.json (cached, reviewed, committed).

Translations are cached in video/scripts/translations/<slug>.<lang>.json together with a
hash of the English source strings. A cached file is reused as long as the source has
not changed, so renders are reproducible without an API key and a human can review/edit
the translation before it is rendered. When the source changes the file is stale and is
re-translated (needs ANTHROPIC_API_KEY, via the repo's provider plumbing in js/translate.mjs).

Every translation (cached or fresh) is re-checked: glossary terms kept, cue markers kept,
content rules (data/rules.yaml) - any rule hit blocks that language.
"""
import datetime
import json
import os
import subprocess

from .config import TRANSLATIONS_DIR, VIDEO_DIR, dump_json, lang_info, read_json
from .content import (apply_strings, check_glossary, check_rules, collect_strings, glossary_terms,
                      load_rules, strings_hash)

class TranslationError(Exception):
    pass

def cache_path(slug, lang):
    return os.path.join(TRANSLATIONS_DIR, '%s.%s.json' % (slug, lang))

def _llm_translate(script, lang, src):
    info = lang_info(lang)
    ids = list(src.keys())
    payload = {
        'lang': lang, 'langName': info['name'],
        'items': [{'id': 's%d' % i, 'text': src[k]} for i, k in enumerate(ids)],
        'glossary': glossary_terms(),
        'rules': [{'id': r['id'], 'why': r['why']} for r in load_rules()],
        'context': script.get('topic', ''),
    }
    bridge = os.path.join(VIDEO_DIR, 'js', 'translate.mjs')
    env = dict(os.environ)
    if any(env.get(k) for k in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy')):
        env.setdefault('NODE_USE_ENV_PROXY', '1')   # let Node's fetch honour the proxy like curl/python do
        env.setdefault('NODE_NO_WARNINGS', '1')
    r = subprocess.run(['node', bridge], input=json.dumps(payload, ensure_ascii=False), capture_output=True,
                       text=True, cwd=os.path.dirname(VIDEO_DIR), timeout=600, env=env)
    if r.returncode != 0:
        raise TranslationError('translator failed for %s:\n%s' % (lang, (r.stderr or r.stdout)[-3000:]))
    out = json.loads(r.stdout)
    items = out['items']
    return {k: items['s%d' % i] for i, k in enumerate(ids)}, out.get('model'), out.get('provider')

def translate(script, lang, force=False, allow_stale=False, log=print):
    """-> localised script dict (raises TranslationError on rule/glossary failures)"""
    src = collect_strings(script)
    src_rules = check_rules(src, script['source_lang'])
    if src_rules:
        raise TranslationError(format_rule_hits(src_rules, 'source script'))
    if lang == script['source_lang']:
        return script
    h = strings_hash(src)
    p = cache_path(script['slug'], lang)
    data = read_json(p) if os.path.exists(p) else None
    if data and not force and data.get('source_hash') == h:
        strings = data['strings']
        log('  [%s] using reviewed translation %s' % (lang, os.path.relpath(p)))
    elif data and not force and allow_stale:
        strings = {k: data['strings'].get(k, v) for k, v in src.items()}
        log('  [%s] WARNING: translation is stale (source changed); --allow-stale given, missing lines fall back to English' % lang)
    else:
        if not os.environ.get('ANTHROPIC_API_KEY') and not os.environ.get('OPENAI_API_KEY'):
            raise TranslationError('[%s] no up-to-date translation at %s and no ANTHROPIC_API_KEY to create one' % (lang, p))
        log('  [%s] translating %d strings with the LLM...' % (lang, len(src)))
        strings, model, provider = _llm_translate(script, lang, src)
        dump_json({'slug': script['slug'], 'lang': lang, 'source_hash': h, 'model': model, 'provider': provider,
                   'created': datetime.datetime.now().isoformat(timespec='seconds'),
                   'reviewed': False, 'source': src, 'strings': strings}, p)
        log('  [%s] wrote %s (review it, set "reviewed": true)' % (lang, os.path.relpath(p)))
    probs = check_glossary(src, strings)
    hits = check_rules(strings, lang)
    if probs or hits:
        msg = ''
        if probs: msg += '[%s] glossary/cue problems:\n  - %s\n' % (lang, '\n  - '.join(probs))
        if hits: msg += format_rule_hits(hits, lang)
        raise TranslationError(msg)
    loc = apply_strings(script, strings)
    so = loc.get('signoff')
    if so and so.get('_pinned', {}).get(lang):      # hand-pinned tagline in data/brand.yaml wins
        so['tagline'] = so['_pinned'][lang]
    loc['_lang'] = lang
    return loc

def format_rule_hits(hits, where):
    lines = ['Content rules failed (%s):' % where]
    for h in hits:
        lines.append('  - [%s] %s -> "%s" in %s: %s' % (h['rule'], h['why'], h['match'], h['path'], h['text'][:120]))
    return '\n'.join(lines)
