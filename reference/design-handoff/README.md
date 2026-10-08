# Handoff: RM Psyllium Social Carousel Design System

## How to use this bundle

Paste `PROMPT.md` into Claude Code as your opening message (edit the bracketed
bits first), and keep this folder in the repo so Claude Code can read the
README and the design reference file.

## Overview

RM Psyllium (a psyllium-husk mill selling private-label/bulk to B2B buyers)
runs a **programmatic content pipeline** that generates social carousel slides
(HTML → PNG). The current output is functional but generic. This handoff
defines a redesigned, branded slide system:

- **3 cover treatments** (rotated across posts): `2a` deep green, `2b`
  terracotta, `2c` cream with giant emblem signature
- **3 interior slide directions** (pick per campaign or implement all as
  themes): `1a` Mill Paper (premium editorial), `1b` Spec Sheet
  (raw-material trade document), `1c` Grove (warm & human)
- **Profile-grid strategies** — rules for which tile color each post's cover
  uses so the Instagram/LinkedIn profile grid forms an intentional pattern

## About the design files

`Carousel Directions.dc.html` is a **design reference created in HTML** — a
preview canvas showing all variants side by side at reduced scale. It is NOT
production code. The task is to **recreate these designs inside the existing
carousel pipeline's templating system**, using its established patterns
(template engine, data schema, render step). If the pipeline's templates are
plain HTML, the inline styles here port almost directly — but re-derive all
dimensions at production scale (see Scale below).

## Fidelity

**High-fidelity.** Colors, type choices, spacing relationships, and
composition are final and should be matched closely. However, the reference
renders slides at reduced scale; treat proportions as authoritative and px
values as needing the scale conversion below.

## Scale

- Turn-1 interior slides in the reference: **540×540 → production 1080×1080
  (multiply all px by 2)**
- Turn-2 covers in the reference: **420×420 → production 1080×1080 (multiply
  all px by ~2.57)**
- Vertical formats (WeChat / RedNote): 1080×1920; keep the same header/footer
  furniture, scale type up ~15%, and let body content stack with more air.

## Brand foundations (design tokens)

Colors:
- `--green-deep: #1C2B21` (primary brand field; 1b uses `#16352A`, 1c uses `#1F3A2D` — pick ONE production value per theme, defaults: 1a/covers `#1C2B21`, 1b `#16352A`, 1c `#1F3A2D`)
- `--cream: #F7F2E8` (primary light bg; 1b `#F1EDE3`, 1c `#F5EFE2`)
- `--terracotta: #B9552F` (accent, 2b cover bg)
- `--terracotta-light: #D98E5F` (accent on dark green)
- `--tan: #B99B72` / `#C8A87E` (seed tan, subtle accents)
- `--body-text: #55604F` (muted green-gray body copy on cream)
- `--muted: #6B7263` (metadata, footers)
- Photo placeholder tile: `#E7E0D0`

Typography (Google Fonts):
- **1a Mill Paper**: Newsreader (400/500 + italics, optical sizing) for display; Archivo (500–700) for labels/meta. Display 96–104px on 1080; body 30–32px; labels 20–22px letterspaced caps.
- **1b Spec Sheet**: Space Grotesk (700) for display (uppercase on cover); IBM Plex Mono (400–600) for all labels, doc codes, table cells. Display ~88px; mono labels 20–22px.
- **1c Grove**: Bricolage Grotesque (600–700) display, sentence case, letter-spacing -0.015em; body in a plain humanist sans. Display ~76–84px; body 29px.
- CJK (WeChat/RedNote): pair with Noto Sans SC — match weight, keep the same layout furniture.

Minimum body size on 1080×1080: 28px. Footer/meta minimum: 20px.

## Logo & watermark rules (important — the client corrected this)

- The ONLY approved mark is `assets/rm-emblem.svg` (vector leaf emblem,
  fill `#1F3B2C`). Never hand-draw or approximate the mark.
- Pre-tinted variants are provided because **CSS `mask` is unreliable in
  HTML→PNG capture tools** — always use tinted `<img>` files, never CSS masks:
  - `rm-emblem-cream.svg` (#F7F2E8) — watermark on dark/terracotta fields
  - `rm-emblem-tan.svg` (#B99B72) — subtle accent on dark green
  - `rm-emblem-rust.svg` (#C97B4A) — small accent marks on cream
- **Watermark is always secondary**: opacity 0.07–0.15, bleeding off an edge,
  never overlapping text. On 2c the full-color emblem runs at opacity 0.10.
- Header lockup: emblem img (~56–76px tall at 1080) + typeset wordmark
  ("RM Psyllium" in the theme's display face). Do not use raster logo files.

## Cover treatments (each is a skin over the same content slots)

Slots: brand lockup (top-left), badge (top-right), kicker, title (with one
accent word), subtitle, footer-left (swipe cue), footer-right (page count).

- **2a Deep green**: bg green-deep; cream text; accent word italic
  terracotta-light; cream emblem watermark right edge, opacity 0.07; badge =
  outlined pill in terracotta-light.
- **2b Terracotta**: bg #B9552F; cream text; accent word italic in green-deep;
  cream emblem watermark bottom-right rotated 10°, opacity 0.07; badge = pill
  with rgba(28,43,33,0.35) fill.
- **2c Cream signature**: bg cream; green-deep text; accent italic terracotta;
  full-color emblem, right edge, rotated 10°, width ~42% of slide, opacity
  0.10, vertically centered; text column constrained to ~60% width so nothing
  crosses the mark.

CTA slides reuse the cover's field color. Interior slides are ALWAYS cream.

## Interior directions (see reference rows 1a / 1b / 1c for exact layouts)

- **1a Mill Paper**: full-width hairline rules (1px green-deep for primary,
  rgba(28,43,33,0.25) secondary) top and bottom as a ledger frame; question
  slides pair a giant terracotta serif numeral with the title; "Why it
  matters" is a footnote row (small caps label + italic serif) — no boxed
  card; payoff list uses roman numerals i.–v. with rules between rows; CTA on
  green with underlined-link CTA (no pill button).
- **1b Spec Sheet**: every slide wrapped in a 1.5px green border inset ~5.2%
  from the slide edge; header row of bordered cells (Q code cell is solid
  green with cream mono text); optional 2-cell spec table; "Why it matters" =
  bottom bordered strip with terracotta left cell on rgba(185,85,47,0.08);
  footer/progress as mono text + solid rectangles.
- **1c Grove**: pill badges (border-radius 999px), rounded cards
  (radius 14–18px, bg #FFFDF6 on cream / #EAE0CC for callouts), numbered
  circle chips (green bg, cream text), arch-shaped image placeholders
  (border-radius 140px 140px 16px 16px, dashed rgba border), seed-dot
  progress indicators (active dot = terracotta pill 20×8, inactive 8×8).

## Profile-grid strategies (per cover, from the reference's grid mocks)

Implement as a pipeline-level rule that assigns each post's cover color:
- 2a: alternating green/cream (occasional terracotta ~1 in 6), or green left
  column + photo right column, or photo-led with green anchors
- 2b: terracotta lead alternating with cream, diagonal accent, or
  green+terracotta duet with photos
- 2c: all-cream quiet signature (emblem crop on every tile), cream + green
  anchors, or photo checkerboard

## Interactions & behavior

None — static slides. The only "behavior" is the render pipeline: HTML
template + JSON content → PNG at exact 1080×1080 (and 1080×1920 vertical).
Ensure fonts are fully loaded before capture (`document.fonts.ready`).

## Assets

- `assets/rm-emblem.svg` — master emblem, client-supplied (traced vector,
  viewBox 0 0 1028 1944 — tall aspect; size by width, aspect-ratio 1028/1944)
- `assets/rm-emblem-{cream,tan,rust}.svg` — tinted copies (single `fill`
  attribute swap on the `<g>` — regenerate variants the same way if new tints
  are needed)
- Photography: placeholders only for now; slots are defined (1c arch slot,
  grid photo tiles). Pipeline should accept an optional image URL per slide.

## Files

- `Carousel Directions.dc.html` — the design reference (open in a browser;
  turn 2 at top = covers + grid mocks, turn 1 below = the three interior
  directions, 4 slides each)
- `PROMPT.md` — the opening prompt to paste into Claude Code
