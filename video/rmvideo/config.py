"""Paths, language table and data files for the video module.

Large media (factory footage, photos, state boundaries) never lives in the repo: point
RMVIDEO_ASSETS (or --assets) at a folder laid out as

    <assets>/src/*.mp4        factory footage (1920x1080)
    <assets>/photos/*.jpg     factory photos
    <assets>/geo/world.geojson, india_states.geojson (optional, for region maps)
    <assets>/music/*.mp3      optional music beds
"""
import json
import os

import yaml

VIDEO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_DIR = os.path.dirname(VIDEO_DIR)
FONT_DIR = os.path.join(VIDEO_DIR, 'fonts')
BRAND_DIR = os.path.join(VIDEO_DIR, 'brand')
DATA_DIR = os.path.join(VIDEO_DIR, 'data')
GEO_DIR = os.path.join(VIDEO_DIR, 'geo')
CACHE_DIR = os.environ.get('RMVIDEO_CACHE') or os.path.join(VIDEO_DIR, '.cache')
WORK_DIR = os.environ.get('RMVIDEO_WORK') or os.path.join(VIDEO_DIR, '.work')
OUT_DIR = os.environ.get('RMVIDEO_OUT') or os.path.join(VIDEO_DIR, 'out')
TRANSLATIONS_DIR = os.path.join(VIDEO_DIR, 'scripts', 'translations')

def load_env():
    """read <repo>/.env like bin/carousel.js does (no override of real env vars)"""
    p = os.path.join(REPO_DIR, '.env')
    if not os.path.exists(p): return
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        if k.strip() and v and k.strip() not in os.environ:
            os.environ[k.strip()] = v

def assets_dir(override=None):
    d = override or os.environ.get('RMVIDEO_ASSETS') or os.path.join(VIDEO_DIR, 'assets')
    return os.path.abspath(d)

def asset(path, base=None):
    if not path: return None
    if os.path.isabs(path): return path
    return os.path.join(assets_dir(base), path)

def load_yaml(name):
    with open(os.path.join(DATA_DIR, name), encoding='utf-8') as fh:
        return yaml.safe_load(fh)

_langs = None
def languages():
    """language table: code -> {name, voice, rate, rtl, cjk, ui:{source,...}}"""
    global _langs
    if _langs is None:
        _langs = load_yaml('languages.yaml')['languages']
    return _langs

def lang_info(code):
    L = languages()
    if code not in L:
        raise SystemExit('Unknown language "%s". Add it to video/data/languages.yaml (voice + ui strings).' % code)
    info = dict(L[code]); info['code'] = code
    return info

def dump_json(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)

def read_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)
