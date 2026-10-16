"""render step plumbing: frames -> ffmpeg in resumable chunks, audio mix/loudnorm, mux.

Frames are rendered by a pool of workers and piped as raw RGB into ffmpeg one chunk
(segment) at a time: <work>/<slug>/<lang>/seg-<key>/seg_00000.mp4 ... A finished segment
is never re-rendered, so an interrupted build (or one run with --budget) resumes where it
stopped. Final video: 1080x1920, 30 fps, H.264 CRF 23, AAC 48 kHz, -14 LUFS.
"""
import json
import multiprocessing as mp
import os
import shutil
import subprocess
import time

from .config import asset
from .fx import FPS, H, W

_STYLE = None

def _render(arg):
    return _STYLE.render(arg).tobytes()

def render_segments(style, segdir, seg_frames=150, workers=None, budget=None, log=print):
    """-> True when every segment exists"""
    global _STYLE
    os.makedirs(segdir, exist_ok=True)
    NF = style.NF
    segs = [(a, min(a + seg_frames, NF)) for a in range(0, NF, seg_frames)]
    todo = [(a, b) for a, b in segs if not os.path.exists(os.path.join(segdir, 'seg_%05d.mp4' % a))]
    if not todo:
        return True
    _STYLE = style
    workers = workers or max(1, min(4, os.cpu_count() or 2))
    t_start = time.time()
    ctx = mp.get_context('fork')
    with ctx.Pool(workers) as pool:
        for a, b in todo:
            if budget and time.time() - t_start > budget:
                log('    budget reached; %d/%d segments left (re-run to resume)' % (len([x for x in segs if not os.path.exists(os.path.join(segdir, 'seg_%05d.mp4' % x[0]))]), len(segs)))
                return False
            out = os.path.join(segdir, 'seg_%05d.mp4' % a)
            part = out + '.part.mp4'
            ts = time.time()
            ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
                                   '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                                   '-pix_fmt', 'yuv420p', '-g', '60', part], stdin=subprocess.PIPE)
            for fr in pool.imap(_render, style.frames(a, b), chunksize=2):
                ff.stdin.write(fr)
            ff.stdin.close()
            if ff.wait() != 0:
                raise RuntimeError('ffmpeg failed on segment %d' % a)
            os.replace(part, out)
            log('    seg %5d-%5d  %.1fs  (%.1f fps)' % (a, b, time.time() - ts, (b - a) / max(0.01, time.time() - ts)))
    return all(os.path.exists(os.path.join(segdir, 'seg_%05d.mp4' % a)) for a, _ in segs)

def _loudnorm_args(path, target=-14):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'loudnorm=I=%d:TP=-1.5:LRA=11:print_format=json' % target,
                        '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
    return ('loudnorm=I=%d:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
            % (target, m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))

def build_audio(voice_mp3, total, out_wav, music=None, assets=None):
    """voice (+ optional ducked music bed) -> wav normalised to -14 LUFS"""
    tmp = out_wav + '.mix.wav'
    if music and music.get('file'):
        mpath = asset(music['file'], assets)
        vol = float(music.get('volume', 0.18))
        duck = music.get('duck', True)
        if duck:
            fc = ('[0:a]aresample=48000,apad[v];[1:a]aresample=48000,volume=%.3f,afade=t=in:d=0.6,afade=t=out:st=%.2f:d=1.2[m];'
                  '[v]asplit=2[v1][v2];[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];'
                  '[v1][md]amix=inputs=2:duration=first:normalize=0[a]' % (vol, max(0, total - 1.2)))
        else:
            fc = ('[0:a]aresample=48000,apad[v];[1:a]aresample=48000,volume=%.3f,afade=t=out:st=%.2f:d=1.2[m];'
                  '[v][m]amix=inputs=2:duration=first:normalize=0[a]' % (vol, max(0, total - 1.2)))
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', voice_mp3, '-stream_loop', '-1', '-i', mpath,
               '-filter_complex', fc, '-map', '[a]', '-t', '%.3f' % total, '-ar', '48000', tmp]
    else:
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', voice_mp3, '-af', 'aresample=48000,apad', '-t', '%.3f' % total,
               '-ar', '48000', tmp]
    subprocess.check_call(cmd)
    ln = _loudnorm_args(tmp)
    m = dict(kv.split('=', 1) for kv in ln.split(':')[1:])
    if float(m['measured_TP']) - float(m['measured_I']) > 12.0:
        # very peaky voice (e.g. zh-CN-Yunxi): the true-peak ceiling would stop linear loudnorm short of
        # -14 LUFS, so tame the peaks first (gentle compression + limiter), then normalise as usual
        pre = tmp + '.pre.wav'
        subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', tmp, '-af',
                               'acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=4dB,'
                               'alimiter=limit=0.6:attack=3:release=60:level=false', '-ar', '48000', pre])
        os.replace(pre, tmp)
        ln = _loudnorm_args(tmp)
    subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', tmp, '-af', ln, '-ar', '48000', out_wav])
    os.remove(tmp)

def mux(segdir, audio_wav, total, out_mp4):
    segs = sorted(x for x in os.listdir(segdir) if x.startswith('seg_') and x.endswith('.mp4') and '.part' not in x)
    lst = os.path.join(segdir, 'list.txt')
    with open(lst, 'w') as fh:
        for x in segs: fh.write("file '%s'\n" % os.path.join(segdir, x))
    os.makedirs(os.path.dirname(out_mp4), exist_ok=True)
    # mux on local disk first: the +faststart trailer rewrite is fragile on network filesystems
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), 'rmvideo_%d_%s' % (os.getpid(), os.path.basename(out_mp4)))
    subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', audio_wav,
                           '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
                           '-t', '%.3f' % total, '-movflags', '+faststart', tmp])
    shutil.move(tmp, out_mp4)

def loudness(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    for line in reversed(r.splitlines()):
        if line.strip().startswith('I:'):
            return float(line.split()[1])
    return None
