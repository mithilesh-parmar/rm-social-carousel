"""QA: contact sheet + a small machine-readable report per output."""
import math
import subprocess

from .config import dump_json
from .encode import loudness

def probe_full(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                                   'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration',
                                   '-of', 'json', path]).decode()
    import json
    return json.loads(out)

def contact_sheet(mp4, out_jpg, every=2.5, cols=6, tile_w=270):
    info = probe_full(mp4)
    dur = float(info['format']['duration'])
    n = max(1, int(dur / every))
    rows = math.ceil(n / cols)
    vf = "fps=1/%s,scale=%d:-2,drawtext=text='%%{pts\\:hms}':x=8:y=h-28:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5,tile=%dx%d" % (every, tile_w, cols, rows)
    r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp4, '-vf', vf, '-frames:v', '1', '-update', '1', '-q:v', '3', out_jpg],
                       capture_output=True, text=True)
    if r.returncode != 0:  # drawtext may be missing in minimal ffmpeg builds
        vf = 'fps=1/%s,scale=%d:-2,tile=%dx%d' % (every, tile_w, cols, rows)
        subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', mp4, '-vf', vf, '-frames:v', '1', '-update', '1', '-q:v', '3', out_jpg])
    return out_jpg

def report(mp4, expected_total, out_json):
    info = probe_full(mp4)
    v = next(s for s in info['streams'] if s['codec_type'] == 'video')
    a = next((s for s in info['streams'] if s['codec_type'] == 'audio'), None)
    dur = float(info['format']['duration'])
    lufs = loudness(mp4)
    rep = {'file': mp4, 'duration': round(dur, 3), 'expected': round(expected_total, 3),
           'video': '%sx%s %s %s' % (v['width'], v['height'], v['codec_name'], v['r_frame_rate']),
           'audio': a['codec_name'] if a else None, 'integrated_lufs': lufs,
           'checks': {
               'size_1080x1920': (v['width'], v['height']) == (1080, 1920),
               'fps_30': v['r_frame_rate'] in ('30/1', '30000/1000'),
               'duration_ok': abs(dur - expected_total) < 0.25,
               'loudness_ok': lufs is not None and abs(lufs + 14) <= 1.0,
               'has_audio': a is not None}}
    rep['ok'] = all(rep['checks'].values())
    dump_json(rep, out_json)
    return rep
