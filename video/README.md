# video/ — multi-language short-form explainer videos

One script file in, one 9:16 Reel per language out: `out/<slug>/<lang>.mp4` + `<lang>.srt`
(captions) + `<lang>.caption.txt` (post caption) + `<lang>.contact.jpg` (QA contact sheet) +
`<lang>.qa.json`. Nothing is posted or uploaded unless you pass `--upload-drive`.

```
script.yaml ──translate──▶ <slug>.<lang>.json (cached, reviewable, rule-checked)
            ──tts────────▶ edge-tts voice + word timings ▶ scenes & cues auto-timed
            ──render─────▶ beat templates (style: process | flat) ▶ ffmpeg chunks
            ──mux────────▶ voice (+ ducked music) at -14 LUFS ▶ mp4 + srt + caption + QA
```

## Setup

```
pip install -r video/requirements.txt      # Pillow (with raqm), numpy, pyyaml, fonttools, edge-tts
npm install                                # only needed for the LLM translate step
npm run video -- fonts                     # downloads Noto Sans SC (17 MB, not committed) for zh/ja
export RMVIDEO_ASSETS=/path/to/media       # footage + photos + state boundaries (never committed)
cp .env.example .env                       # ANTHROPIC_API_KEY=... (translate step only)
```

`RMVIDEO_ASSETS` (or `--assets`) points at a folder laid out as:

```
src/*.mp4                 factory footage, any size (scripts reference e.g. src/7798.mp4)
photos/*.jpg              factory photos (photos/112A7789.jpg)
geo/india_states.geojson  first-level regions, property NAME_1 (region maps / India outline)
music/*.mp3               optional music beds
```

Requirements: Python 3.10+, ffmpeg/ffprobe, Node 22 (translate only). Pillow must have libraqm
(`python3 -c "from PIL import features; print(features.check('raqm'))"` → `True`), otherwise
Devanagari and Arabic will not shape correctly.

## Commands

```
npm run video -- build video/scripts/*.yaml --langs en,hi,ru       # everything
npm run video -- build video/scripts/x.yaml --style en=process,hi=flat
npm run video -- build video/scripts/x.yaml --budget 100           # stop after ~100 s, re-run resumes
npm run video -- check video/scripts/*.yaml --langs hi,ru          # content rules + glossary only
npm run video -- translate video/scripts/x.yaml --langs ru,es [--retranslate]
npm run video -- tts video/scripts/x.yaml --langs hi
npm run video -- still video/scripts/x.yaml --lang hi --style flat --t 2,8.5,30   # PNG frames
npm run video:test                                                  # unit tests (rules, lexicon, RTL…)
```

(`node bin/video.js …` or `python3 video/run.py …` are the same thing.)

`build` flags: `--style` (global or per language), `--assets`, `--out`, `--workers N`,
`--seg-frames 150` (resumable chunk size), `--budget SECONDS`, `--retranslate`, `--force-tts`,
`--allow-stale` (render with an outdated translation; missing lines fall back to English),
`--no-music`, `--upload-drive [--drive-folder ID]`.

Rendering is chunked: frames are rendered by a worker pool and piped as raw RGB into ffmpeg
150 frames at a time (`.work/<slug>/<lang>/seg-*/seg_00000.mp4 …`). A finished chunk is never
redone, so an interrupted build resumes. Output: 1080×1920, 30 fps, H.264 CRF 23 (veryfast),
AAC 160k/48 kHz, two-pass `loudnorm` to −14 LUFS (TP −1.5). Typical speed on 2 vCPUs: ~10 fps
(process) — about 3–4 minutes for a 55 s video.

## Writing a script

One YAML (or JSON) file per video — see `scripts/india-psyllium-80.yaml`.

```yaml
slug: india-psyllium-80          # output folder name (default: file name)
topic: "Why ..."                 # context for the translator
style: process                   # process (annotated factory footage) | flat (flat vector kinetic)
styles: {hi: flat}               # optional per-language override
languages: [en, hi]              # default --langs
endcard: {sub: "...", place: "...", hold: 1.2}     # url + CTA come from data/brand.yaml
post: {caption: "...", hashtags: ["#psyllium"]}    # -> <lang>.caption.txt
music: {file: music/bed.mp3, volume: 0.18, duck: true}   # optional, path inside assets
scenes:
  - id: share
    say: "India supplies about [[n]]eighty percent of the world's psyllium."
    beat: {type: big_stat, value: 80, format: "{v}%", label: "of the world's psyllium | comes from India", chart: dots,
           map: {highlight: India, label: "India", lon: 79, lat: 22}}
    stat: {source: "ICAR, Indian Horticulture (2023)"}     # shown as a source line, never translated
    footage:                                               # process style: shots split the scene by weight
      - {src: src/3202.mp4, in: 1.0, weight: 2}
      - {src: src/7741.mp4, in: 0.6, weight: 1.5, focus: [980, 540], zoom: 1.0, zoom_to: 1.07, pan: [0, 0],
         annotate: [{type: circle, at: [1112, 300], r: [150, 75], when: 0.1},
                    {type: label, text: "colour sorter", xy: [470, 900], arrow: [[470, 830], circle], when: 0.3}]}
```

* **`say`** is the narration. **`[[name]]`** is a *cue*: the moment the next word is spoken.
  Beats animate on cues (`cue: c1`, `start_cue: map`, `note_cue: half`…), so a translation that
  is longer or shorter re-times itself. The translator keeps the markers next to the equivalent
  word. Missing cues fall back to a fraction of the scene.
* **`beat`** (or **`beats:`** — a list that splits the scene by `weight` or `start_cue`) picks a
  template. Every viewer-facing string (`say, headline, headline2, kicker, label, title, text,
  sub, note, format, result, left, right, cta, tagline, caption, hashtags`) is translated;
  numbers, sources, `name` ids, coordinates and footage refs are not.
* `*word*` in on-screen text = emphasis (highlighter swipe in process, accent in flat).
  ` | ` = forced line break.
* Footage coordinates (`focus`, `at`, `r`) are in source pixels; `xy`/`arrow` are screen pixels
  (1080×1920). `when` is a fraction of the shot.

### Beat templates

| type | params | process | flat |
|---|---|---|---|
| `hook` | headline, headline2 (cue `h2`), kicker, pin {lon, lat, country, label, title} (cue `pin`) | headline strips + paper map with marker circle & pin | jars → spinning globe → pin + pill |
| `title` | headline, headline2 (cue `h2`) | big headline card, then second | "?" + headline, then plant + accent pill |
| `big_stat` | value, format `{v}%`, label, kicker, map {highlight, lon, lat, label}, chart dots\|bar\|donut, note (+note_cue) | world card → count-up stat card | count-up + dots / bar+ships / donut |
| `world_map_arcs` | origin {lon, lat}, targets [{name, label, lon, lat, cue, countries\|region}], headline, kicker | paper world map + arrows + pins | flat map, dashed routes with ships |
| `region_map` | country, regions [{name, label, cue}], bbox, check {lon, lat} (cue `check`), headline | torn state map, halftone highlights | states pop + zoom + pills |
| `checklist` | headline, kicker, items [{text, sub, icon winter\|soil\|norain\|sun\|water\|tick, cue}] | paper cards + ticks | coloured cards + icons |
| `ratio` | from/to {value, unit, label} (cues `from`, `to`), headline | ratio card with bar | seed splits → bar blocks |
| `diagram` | left, right, result (cue `gel`/result_cue), note (cue `soak`/note_cue), sub (cue `fibre`/sub_cue), preset swell | "A + B = *C*" + handwritten notes | glass that swells into gel |
| `footage` | headline, kicker, location {name, title, label, region, state, lon, lat, cue}, photos [...] | footage + annotations + place tag | mill + photo cards → map pin |
| `endcard` | (uses script/brand endcard) | — | — |

Every video automatically ends on the **endcard** + **brand sign-off** (below).

## Brand sign-off (default on)

Standing rule: every video ends with a spoken sign-off so the name becomes recognisable.
Configured in `data/brand.yaml`:

* After the last scene, a **0.4 s pause**, then **"RM Psyllium. Straight from the source."** is
  spoken as the very last line. It is synthesised separately and placed after an exact pause.
* The tagline is translated per language (or pinned per language in `brand.yaml`); the name is
  **never translated**: every voice says "R M Psyllium" and captions show "RM Psyllium".
* The endcard rises at the `[[end]]` cue of the last scene with the CTA
  ("Sourcing psyllium? Ask us for a sample.", translated) and rmpsyllium.com; **the logo animates
  in exactly on the spoken name** and the tagline writes in under it.
* Opt out per script with `signoff: false` (not recommended).

## Translation, glossary and content rules

* `translate` sends every viewer-facing string to Claude through the carousel pipeline's own
  provider plumbing (`js/translate.mjs` → `src/content/models.js` + `runPipeline.generateValidated`,
  so `ANTHROPIC_API_KEY`, `WRITER_PROVIDER/WRITER_MODEL` and `VIDEO_TRANSLATE_MODEL` work).
  The result is cached in `scripts/translations/<slug>.<lang>.json` with a hash of the English
  source: commit it, review/edit it (set `"reviewed": true`), and renders are reproducible
  without an API key. Changing the English invalidates it (re-translated on the next build).
* **Glossary** (`data/glossary.yaml`): `RM Psyllium`, `rmpsyllium.com`, `psyllium` stay verbatim
  (`localized:` lists accepted native forms of a term per language, e.g. psyllium → 洋车前子 / псиллиум;
  the brand and url never localise). Per-language spoken brand: `name_spoken_by_lang` in `brand.yaml`.
  Translations that drop a term, a cue marker or an emphasis span are rejected and retried.
* **Content rules** (`data/rules.yaml`) run on the English script and on every translation
  (narration, on-screen copy, post caption, in that language's script). A hit **blocks that
  language**: health-cure / treatment claims, FSSC 22000, "40 years" (any phrasing), MOQ /
  minimum order. Add a pattern there to extend; `npm run video -- check` runs them alone.

## Pronunciation lexicon

`data/lexicon.yaml` maps display → spoken text, per language if needed. Scripts are written in
display form; the voice gets the spoken form and captions are mapped back character-by-character.
Seeded: `Sidhpur → "Sidpoor"`, `RM Psyllium → "R M Psyllium"`, `rmpsyllium.com → "R M psyllium dot com"`,
Hindi/Russian `psyllium → सिलियम / псиллиум`.

## Adding a language, voice or style

* **Language**: add a block to `data/languages.yaml` (edge-tts voice — list them with
  `python3 -m edge_tts --list-voices` — rate, `rtl: true` / `cjk: true` where relevant, and the
  `ui.source` word). Then `npm run video -- translate <script> --langs xx`. If the language uses a
  script none of the bundled fonts cover, add an open font to `fonts/` and to the role stacks in
  `rmvideo/text.py` (`STACKS`).
* **Voice**: change it in `languages.yaml`, or per script: `voices: {hi: hi-IN-SwaraNeural}`,
  `rates: {hi: "+10%"}`. Hindi runs at +12% by default (the Hindi voice is ~40% slower than English).
* **Style**: add `rmvideo/styles/<name>.py` with a class exposing `NF`, `frames(f0, f1)`,
  `render((fi, payload)) -> HxWx3 uint8` and `still(t)`, implement the beat types you need, and
  register it in `cli._styles()`. Beats get a `Beat` (`t0`, `t1`, `spec`, `cue(name, frac)`), the
  `Timeline` gives captions, the endcard and the sign-off timing.

## Text rendering

All copy goes through `rmvideo/text.py`: per-character-run font fallback (each style role is a
font stack; the first font whose cmap covers a run is used), libraqm shaping for Devanagari and
Arabic, right-to-left line layout that keeps Latin/number runs left-to-right, and character-level
wrapping for CJK. Captions are 2–3 word karaoke groups (≤12 characters for CJK) that never split
"RM Psyllium".

## Fonts and licences

Bundled in `fonts/` (licence texts in `fonts/licenses/`): Inter, Playfair Display, Caveat,
IBM Plex Mono, Archivo Black, Kalam, Noto Sans Devanagari, Noto Sans Arabic — SIL Open Font
License 1.1; Permanent Marker — Apache 2.0. Noto Sans SC (OFL 1.1) is downloaded by
`video fonts` and git-ignored because of its size.

Map data: `geo/world_110m.json` is simplified Natural Earth 1:110m (public domain). State
boundaries are read from the assets folder and only cached locally — their source licence is not
known to allow redistribution, so they are not committed. India is drawn from the state
boundaries whenever they are available.

## Known limits

* Translations are machine output until someone fluent sets `"reviewed": true`; the content rules
  are regex-based (good at the listed red lines, not a substitute for that review).
* edge-tts is an unofficial endpoint of Microsoft's online voices: it needs network access and
  may change or rate-limit. Voices cannot take SSML breaks, hence the separately-synthesised sign-off.
* Footage annotations use fixed source-pixel coordinates per clip; swapping a clip means re-aiming them.
* Flat style does not use footage except `photos` in the `footage` beat.
* Arabic layouts are supported by the engine and unit-tested but not yet rendered end-to-end;
  en, hi, zh (Douyin) and ru (VK) have been rendered and eyeballed.
* CJK captions break on punctuation, then into balanced chunks at the voice's word boundaries;
  add multi-character terms the voice splits (洋车前子, 膳食纤维…) to `cjk_keep` in `data/glossary.yaml`.
* Very peaky voices (zh-CN-Yunxi) get a gentle compressor/limiter before loudnorm so they reach −14 LUFS.
* Region maps need a state-boundary file in the assets folder.
