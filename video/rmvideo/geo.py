"""Map geometry: simplified country + first-level region rings, cached as JSON.

* World countries: video/geo/world_110m.json (Natural Earth 1:110m, public domain) is
  committed, so world maps work out of the box.
* Regions/states (for region_map beats): read from <assets>/geo/<country>_states.geojson
  (property NAME_1, e.g. india_states.geojson) and cached in video/.cache - NOT committed,
  because the source boundary file's licence is not known to be redistributable.
"""
import json
import math
import os

from .config import CACHE_DIR, GEO_DIR, asset

EUROPE = {'France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Poland', 'Netherlands', 'Belgium', 'Portugal',
          'Austria', 'Czechia', 'Switzerland', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Ireland', 'Hungary',
          'Romania', 'Bulgaria', 'Greece', 'Slovakia', 'Croatia', 'Serbia', 'Slovenia', 'Bosnia and Herz.', 'Albania',
          'Macedonia', 'North Macedonia', 'Montenegro', 'Kosovo', 'Lithuania', 'Latvia', 'Estonia', 'Luxembourg',
          'Czech Rep.', 'Belarus', 'Ukraine', 'Moldova'}
REGIONS = {'europe': EUROPE}

def _simplify(ring, tol):
    out = []
    for lon, lat in ring:
        if not out or abs(lon - out[-1][0]) + abs(lat - out[-1][1]) >= tol:
            out.append([round(lon, 3), round(lat, 3)])
    return out if len(out) >= 4 else None

def _features(path, name_keys, tol, keep=None):
    d = json.load(open(path, encoding='utf-8'))
    out = []
    for f in d['features']:
        g = f.get('geometry')
        if not g: continue
        p = f.get('properties', {})
        name = next((p[k] for k in name_keys if p.get(k)), None)
        if keep and not keep(p): continue
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        rings = [r for r in (_simplify(poly[0], tol) for poly in polys) if r]
        if rings: out.append({'name': name, 'rings': rings})
    return out

def build_world(src):
    feats = _features(src, ('NAME', 'ADMIN', 'name'), 0.15, keep=lambda p: p.get('NAME') != 'Antarctica')
    return feats

_world = None
def world():
    """[{name, rings:[[ [lon,lat],... ]]}]"""
    global _world
    if _world is None:
        p = os.path.join(GEO_DIR, 'world_110m.json')
        if not os.path.exists(p):
            src = asset('geo/world.geojson')
            os.makedirs(GEO_DIR, exist_ok=True)
            json.dump(build_world(src), open(p, 'w'), separators=(',', ':'))
        _world = json.load(open(p))
    return _world

_states = {}
def states(country='India'):
    key = country.lower()
    if key not in _states:
        cp = os.path.join(CACHE_DIR, 'geo_%s_states.json' % key)
        if os.path.exists(cp):
            _states[key] = json.load(open(cp))
        else:
            src = asset('geo/%s_states.geojson' % key)
            if not os.path.exists(src):
                raise FileNotFoundError('region_map needs %s (state/region boundaries with NAME_1); '
                                        'set RMVIDEO_ASSETS or --assets' % src)
            feats = _features(src, ('NAME_1', 'name', 'NAME'), 0.02)
            os.makedirs(CACHE_DIR, exist_ok=True)
            json.dump(feats, open(cp, 'w'), separators=(',', ':'))
            _states[key] = feats
    return _states[key]

def country_names(spec):
    """'India' | ['India', ...] | 'europe' -> set of country names"""
    if not spec: return set()
    if isinstance(spec, str): spec = [spec]
    out = set()
    for s in spec:
        out |= REGIONS.get(s.lower(), {s})
    return out

def centroid(rings):
    pts = [p for r in rings for p in r]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)

def bbox(rings):
    pts = [p for r in rings for p in r]
    return min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)

def kx(lat):
    return math.cos(math.radians(lat))
