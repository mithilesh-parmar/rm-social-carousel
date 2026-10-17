"""video CLI.

  video build  scripts/*.yaml [--langs en,hi] [--style flat | --style en=process,hi=flat]
  video check  scripts/*.yaml [--langs ...]      content rules + glossary, no rendering
  video translate scripts/*.yaml --langs hi,ru  [--retranslate]
  video tts    scripts/*.yaml --langs ...
  video still  script.yaml --lang en --t 1.5,8,20 [--style flat]
  video fonts                                    fetch fonts not committed (Noto Sans SC)
"""
import argparse
import glob
import hashlib
import json
import os
import shutil
import sys
import time

from . import config
from .config import OUT_DIR, WORK_DIR, lang_info
from .content import ScriptError, collect_strings, load_script
from .timeline import Timeline, write_srt
from .translate import TranslationError, translate
from .tts import run_tts

CODE_VERSION = '1'

def _styles():
    from .styles.flat import FlatStyle
    from .styles.process import ProcessStyle
    return {'process': ProcessStyle, 'flat': FlatStyle}

def expand(paths):
    out = []
    for p in paths:
        g = sorted(glob.glob(p))
        out += g if g else [p]
    return out

def parse_style(arg):
    if not arg: return {}
    if '=' not in arg: return {'*': arg}
    return dict(x.split('=', 1) for x in arg.split(','))

def style_for(script, lang, override):
    return override.get(lang) or override.get('*') or (script.get('styles') or {}).get(lang) or script['style']

def langs_for(script, arg):
    return [l.strip() for l in arg.split(',')] if arg else script['languages']

def prepare(script, lang, args, log):
    loc = translate(script, lang, force=getattr(args, 'retranslate', False), allow_stale=getattr(args, 'allow_stale', False), log=log)
    tl = run_tts(loc, lang, force=getattr(args, 'force_tts', False), log=log)
    return loc, Timeline(loc, tl, lang_info(lang))

def post_text(loc, ec_url):
    p = loc.get('post') or {}
    parts = [p.get('caption', loc.get('topic', ''))]
    if ec_url: parts.append(ec_url)
    if p.get('hashtags'): parts.append(' '.join(h for h in p['hashtags'] if str(h).strip()))
    return '\n\n'.join(x for x in parts if x) + '\n'

def build_one(script, lang, args, log):
    t_start = time.time()
    style_name = style_for(script, lang, parse_style(args.style))
    log('[%s/%s] style=%s' % (script['slug'], lang, style_name))
    loc, timeline = prepare(script, lang, args, log)
    out_dir = os.path.join(args.out or OUT_DIR, script['slug'])
    os.makedirs(out_dir, exist_ok=True)
    StyleCls = _styles()[style_name]
    style = StyleCls(timeline, args.assets)
    key = hashlib.sha256(json.dumps([CODE_VERSION, style_name, timeline.tl['key'], collect_strings(loc),
                                     loc.get('scenes'), loc.get('endcard')], sort_keys=True, default=str, ensure_ascii=False)
                         .encode()).hexdigest()[:12]
    wd = os.path.join(WORK_DIR, script['slug'], lang)
    segdir = os.path.join(wd, 'seg-%s-%s' % (style_name, key))
    # drop stale segment folders of this language
    for d in glob.glob(os.path.join(wd, 'seg-*')):
        if d != segdir: shutil.rmtree(d, ignore_errors=True)
    from .encode import build_audio, mux, render_segments
    log('  [%s] rendering %d frames (%.1fs) -> %s' % (lang, style.NF, timeline.total, os.path.relpath(segdir)))
    done = render_segments(style, segdir, seg_frames=args.seg_frames, workers=args.workers, budget=args.budget, log=log)
    if not done:
        return None
    wav = os.path.join(wd, 'mix.wav')
    build_audio(timeline.tl['audio'], timeline.total, wav, music=loc.get('music') if not args.no_music else None, assets=args.assets)
    mp4 = os.path.join(out_dir, '%s.mp4' % lang)
    mux(segdir, wav, timeline.total, mp4)
    write_srt(timeline, os.path.join(out_dir, '%s.srt' % lang))
    with open(os.path.join(out_dir, '%s.caption.txt' % lang), 'w', encoding='utf-8') as fh:
        fh.write(post_text(loc, (loc.get('endcard') or {}).get('url')))
    from .qa import contact_sheet, report
    contact_sheet(mp4, os.path.join(out_dir, '%s.contact.jpg' % lang))
    rep = report(mp4, timeline.total, os.path.join(out_dir, '%s.qa.json' % lang))
    log('  [%s] -> %s  (%.1fs, %s LUFS, qa %s, %.0fs wall)' % (lang, os.path.relpath(mp4), rep['duration'], rep['integrated_lufs'],
                                                             'OK' if rep['ok'] else 'CHECK ' + json.dumps(rep['checks']), time.time() - t_start))
    if args.upload_drive:
        from .drive import upload
        for ext in ('.mp4', '.srt', '.caption.txt'):
            fid = upload(os.path.join(out_dir, lang + ext), args.drive_folder, '%s_%s%s' % (script['slug'], lang, ext))
            log('  [%s] uploaded %s%s to Drive (%s)' % (lang, lang, ext, fid))
    return mp4

def cmd_build(args):
    ok = True
    for path in expand(args.scripts):
        script = load_script(path)
        for lang in langs_for(script, args.langs):
            try:
                r = build_one(script, lang, args, print)
                if r is None:
                    print('[%s/%s] incomplete - run the same command again to resume' % (script['slug'], lang)); ok = False
            except TranslationError as e:
                print('[%s/%s] BLOCKED\n%s' % (script['slug'], lang, e)); ok = False
    return 0 if ok else 1

def cmd_check(args):
    bad = False
    for path in expand(args.scripts):
        script = load_script(path)
        print('%s: %d strings' % (script['slug'], len(collect_strings(script))))
        for lang in langs_for(script, args.langs):
            try:
                translate(script, lang, allow_stale=args.allow_stale, log=print)
                print('  [%s] ok' % lang)
            except TranslationError as e:
                print('  [%s] BLOCKED\n%s' % (lang, e)); bad = True
    return 1 if bad else 0

def cmd_translate(args):
    bad = False
    for path in expand(args.scripts):
        script = load_script(path)
        for lang in langs_for(script, args.langs):
            try:
                translate(script, lang, force=args.retranslate, log=print)
            except TranslationError as e:
                print(e); bad = True
    return 1 if bad else 0

def cmd_tts(args):
    for path in expand(args.scripts):
        script = load_script(path)
        for lang in langs_for(script, args.langs):
            loc = translate(script, lang, log=print)
            run_tts(loc, lang, force=args.force_tts, log=print)
    return 0

def cmd_still(args):
    script = load_script(args.script)
    lang = args.lang
    loc, timeline = prepare(script, lang, args, print)
    style_name = style_for(script, lang, parse_style(args.style))
    style = _styles()[style_name](timeline, args.assets)
    out = args.out or os.path.join(OUT_DIR, script['slug'], 'stills')
    os.makedirs(out, exist_ok=True)
    for ts in args.t.split(','):
        p = os.path.join(out, '%s_%s_%06.2f.png' % (lang, style_name, float(ts)))
        style.still(float(ts)).save(p)
        print(p)
    return 0

def cmd_fonts(args):
    import urllib.request
    from .text import missing_fonts
    urls = {'NotoSansSC[wght].ttf': 'https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'}
    for name in missing_fonts():
        if name in urls:
            print('downloading', name); urllib.request.urlretrieve(urls[name], os.path.join(config.FONT_DIR, name))
        else:
            print('missing font with no known download url:', name)
    print('fonts ok' if not missing_fonts() else 'still missing: %s' % missing_fonts())
    return 0

def main(argv=None):
    config.load_env()
    ap = argparse.ArgumentParser(prog='video', description='RM Psyllium multi-language explainer videos')
    sub = ap.add_subparsers(dest='cmd', required=True)
    def common(p, langs=True):
        p.add_argument('--assets', help='media folder (footage/photos/geo); default $RMVIDEO_ASSETS or video/assets')
        if langs: p.add_argument('--langs', help='comma list, default: script.languages')
        p.add_argument('--allow-stale', action='store_true', help='use an outdated cached translation (missing lines fall back to source)')
    b = sub.add_parser('build', help='translate -> tts -> render -> captions -> QA'); b.add_argument('scripts', nargs='+'); common(b)
    b.add_argument('--style', help='"flat" or per-language "en=process,hi=flat" (default: script.style)')
    b.add_argument('--out', help='output root (default video/out)')
    b.add_argument('--workers', type=int, default=None)
    b.add_argument('--seg-frames', type=int, default=150, help='frames per resumable chunk (default 150 = 5 s)')
    b.add_argument('--budget', type=float, default=None, help='stop starting new chunks after N seconds (resume later)')
    b.add_argument('--retranslate', action='store_true'); b.add_argument('--force-tts', action='store_true')
    b.add_argument('--no-music', action='store_true')
    b.add_argument('--upload-drive', action='store_true', help='upload mp4/srt/caption to Google Drive (see rmvideo/drive.py)')
    b.add_argument('--drive-folder', help='Drive folder id (or GDRIVE_FOLDER_ID)')
    b.set_defaults(fn=cmd_build)
    c = sub.add_parser('check', help='content rules + glossary on script and cached translations'); c.add_argument('scripts', nargs='+'); common(c)
    c.set_defaults(fn=cmd_check)
    t = sub.add_parser('translate', help='create/refresh translations (needs ANTHROPIC_API_KEY)'); t.add_argument('scripts', nargs='+'); common(t)
    t.add_argument('--retranslate', action='store_true'); t.set_defaults(fn=cmd_translate)
    s = sub.add_parser('tts', help='synthesise narration + timings'); s.add_argument('scripts', nargs='+'); common(s)
    s.add_argument('--force-tts', action='store_true'); s.set_defaults(fn=cmd_tts)
    st = sub.add_parser('still', help='render single frames as PNG for quick looks'); st.add_argument('script'); common(st, langs=False)
    st.add_argument('--lang', default='en'); st.add_argument('--t', required=True, help='comma list of seconds')
    st.add_argument('--style'); st.add_argument('--out'); st.set_defaults(fn=cmd_still)
    f = sub.add_parser('fonts', help='download fonts that are not committed'); f.set_defaults(fn=cmd_fonts)
    args = ap.parse_args(argv)
    try:
        return args.fn(args) or 0
    except ScriptError as e:
        print('Script error:', e); return 2

if __name__ == '__main__':
    sys.exit(main())
