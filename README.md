# RM Psyllium — Social Carousel Automation

Topic in, branded carousel (or single image) out: PNGs + PDF + caption, for LinkedIn, Instagram,
Facebook, and TikTok. Draft-only — nothing here publishes automatically. Every run lands in a dated
`output/<date>_<topic-slug>/` folder for manual review before you post it yourself.

## Why it's built this way

- **A slide-type library, not one fixed template.** Slide count and slide types are decided per
  topic by a planning stage, composed from a fixed, brand-locked set of components (see "Slide
  types" below) — not invented from scratch each time, and not forced into one mold every time.
- **A three-stage pipeline, not one big prompt.** Planner (decides structure) -> Writer (writes
  copy) -> Claim-safety critic (a second, independent read against the rules) -> a deterministic
  linter (hard-line, blocking checks) -> render. Every stage is schema-validated before the next
  stage sees it, and every stage's output is written to the run folder for audit.
- **Claim-safety is defense-in-depth**, not one gate: the Writer's system prompt encodes the rules,
  a separate Critic call reads the finished copy against the same rules with no other context, and a
  regex/structural linter blocks the pipeline outright on hard violations (forbidden certification
  words, RM-specific viscosity numbers, psyllium not listed first, a closing slide missing the
  sample offer). This matters because the copy is health/regulatory-adjacent.
- **Natural voice is enforced, not hoped for.** The Writer prompt bans AI-slop vocabulary, hype,
  rhetorical-hook constructions, exclamation marks, and overconfident absolutes outright (the exact
  wordlists live in `src/linter/claimSafetyWordlists.js`), and the linter's `natural-voice` rule
  re-checks the finished copy and flags anything that slipped through for proofreading. Copy should
  read like a mill's export desk writing to a peer, not a content marketer.
- **Nothing auto-publishes.** You're the approval gate — every run's output sits in a folder for you
  to review, then post manually (or hand off to a scheduler like Buffer/Metricool later).

## Setup

```
npm install
npx playwright install chromium   # one-time, downloads the headless browser
cp .env.example .env
# edit .env, set ANTHROPIC_API_KEY=... (only needed for `generate`, not `render`)
```

## Commands

### `carousel generate` with no flags — interactive wizard

Run `carousel generate` with neither `--topic-id`, `--topic`, nor `--url` and it walks you through
every decision instead of erroring: pick a topic from the backlog, type an ad-hoc one, paste a blog
post URL (it fetches the article and confirms the extracted title before spending anything), or
discover new ICP-targeted candidates on the spot — then format, accent, export density, an optional
source doc, dry-run, and a final confirm before it spends any API calls. Pass
`--topic-id`/`--topic`/`--url` (as below) to skip straight past the wizard for scripted or repeated
use.

### `carousel discover-topics` — grounded topic brainstorm, needs `ANTHROPIC_API_KEY`

Proposes new candidate topics targeted at a specific ICP each, grounded in the same brand/ICP facts
baked into the Writer (not live research/competitor/search data — see "Known v1 limits"). Avoids
suggesting anything already in the backlog.

```
carousel discover-topics --count 5
carousel discover-topics --count 3 --pillar "Sourcing De-risked"   # optional free-text filter
carousel discover-topics --count 5 --append-all   # save every candidate straight to the backlog
```

Nothing is saved unless you pass `--append-all` (or say yes when a candidate comes up inside the
interactive wizard) — discovery only proposes, you decide what's worth keeping.

### `carousel render` — render-only, no API key needed

The primary tool for iterating on visual fidelity, independent of content generation.

```
carousel render --input fixtures/qa-audit-checklist-7slide.json
carousel render --input output/2026-07-03_.../content.json --scale 3 --out output/re-render-test/
```

### `carousel generate` — full pipeline, needs `ANTHROPIC_API_KEY`

```
carousel generate --topic-id psyllium-vs-inulin-sunfiber-fenugreek-acacia \
  --source-doc ../docs/psyllium-nutraceutical-content-cluster.md

carousel generate --topic "Psyllium vs Pea Fiber for Bakery Applications"   # pillar decided by the Planner

carousel generate --url https://rmpsyllium.com/en/blog/gel-forming-vs-non-gelling-psyllium-format-guide/
# reads the blog post: its headline becomes the topic (add --topic to override) and its text
# grounds BOTH the Planner (deck structure mirrors what the article covers) and the Writer
# (facts/phrasing). The extracted text is saved to the run folder as source-article.txt.

carousel generate --topic-id qa-audit-checklist --format single   # one standalone image, no PDF

carousel generate --topic-id <id> --dry-run          # plan + write + critique + lint, skip render
carousel generate --topic-id <id> --skip-lint-block  # override a blocking finding (still logged)
```

Flags: `--topic-id <id>` (from `src/topics/seedTopics.json`), `--topic "<text>"` (ad-hoc, no
`--pillar` required), or `--url <blog-url>` (build the deck from a published post — plain
fetch + HTML extraction, so it works for static/SSR pages like the RM Psyllium Astro site; a
fully JS-rendered page fails loudly with a pointer to `--source-doc`. If `--url` is combined
with `--source-doc`, the fetched article wins), `--format carousel|single`, `--theme mill-paper|spec-sheet|grove|ledger|certificate|mill|harvest`
(default `mill-paper` — see "Themes" below), `--cover 2a|2b|2c` (override the grid rotation for
this post without advancing it; omit to let the rotation decide), `--sizes portrait[,square,story]` (default `portrait` — 4:5 is feed-optimal on
Instagram/Facebook and LinkedIn takes the PDF built from the same portrait pages, so one size
covers all three; `square` 1:1 and `story` 9:16 for TikTok are opt-in), `--zh` (also produce the
Chinese Douyin variant — see `translate-zh` below),
`--accent <hex>` (default `#B8753A`, the brand copper), `--scale 2|3`,
`--source-doc <path>` (a plain text/markdown file that grounds the plan and the copy, same as a
fetched `--url` article —
`site.ts#slug` references are not auto-extracted in v1, point at an actual readable file),
`--model <id>` (overrides all three LLM stages at once), `--dry-run`, `--skip-lint-block`.

`--pillar <text>` is optional on both `generate` and `discover-topics` — a free-text steer for the
Planner (e.g. `"Technical Authority"`), not a fixed category. Omit it and the Planner invents
whatever angle actually fits the topic; the decided pillar is always recorded in `run-meta.json`
either way, so nothing is un-tagged, it's just not forced into a closed taxonomy anymore.

### `carousel translate-zh` — Chinese (Douyin) variant of a prior run, needs `ANTHROPIC_API_KEY`

```
carousel translate-zh --run-id 2026-07-07_<topic-slug>
```

Translates an already-generated (and claim-safety-approved) English run into Simplified Chinese
adapted for Douyin, and renders 9:16 story-size slides into the same run folder: `content-zh.json`,
`slides-zh/*.png`, `caption-zh.txt` (a ≤20-character Douyin title, Chinese description + hashtags,
no UTM links), and `zh-lint-report.json`.
The English regex linter cannot meaningfully check Chinese copy, so for the zh variant it is
advisory-only and never blocks — **the Chinese version always requires human review before
posting.** Also available inline as `generate --zh` or via the wizard.

### `carousel preview-matrix` — the design-system contact sheet, no API key

Renders every branded slide type × all 3 themes, with cover/CTA/single-highlight repeated across
all 3 cover treatments, plus simulated 3×2 profile-grid strips for every rotation strategy — into
`output/preview-matrix/index.html`. Open it in a browser to eyeball the whole system at once.
Never touches the rotation state.

```
carousel preview-matrix
carousel preview-matrix --size square --scale 2   # optional overrides
```

### `carousel list-topics`

Prints the owner-editable backlog in `src/topics/seedTopics.json` — pillar-tagged (freeform labels,
not enforced) but independent from the LinkedIn article backlog by design, so append to it freely.

Seed topics may carry an optional `targetQueries` array — the exact Google/AI-chatbot queries the
post is meant to answer, curated from `docs/icp-query-matrix.md` in the main repo. When present,
they're passed to both the Planner (structure the deck so each query gets a concrete answer) and
the Writer (use the buyer's vocabulary naturally, never as a keyword list), and recorded in
`run-meta.json`. This is the AI-search-dominance plan flowing into social: the same queries the
site targets for citations, answered again in carousel form.

### `carousel log-outcome`

Manual, freeform outcome logging against a prior run — there's no platform-analytics API
integration yet (no existing social presence to pull from), so this is intentionally a plain note,
not a forced metrics schema:

```
carousel log-outcome --run-id 2026-07-03_qa-audit-checklist \
  --platform linkedin --posted-date 2026-07-10 \
  --note "1,240 impressions, 3 sample requests via the UTM-tagged /contact link"
```

## Output folder

```
output/<date>_<topic-slug>/
├── source-article.txt  # only with --url: the fetched article text the run was grounded in
├── outline.json        # Planner's slide-type sequence
├── content.json        # Writer's finished copy (audit trail — what actually got rendered)
├── critic-report.json  # Claim-safety critic's findings
├── lint-report.json    # deterministic linter's blocking + warning findings
├── run-meta.json        # topic, pillar, theme, sizes, models used, prompt version, output paths
├── slides/01-*.png      # portrait 4:5 PNGs by default (per-size subfolders when --sizes has 2+)
├── deck.pdf             # LinkedIn upload, titled via captions.linkedin.pdfTitle (deck-<size>.pdf
│                        #   when --sizes has 2+; skipped for --format single)
├── caption.txt          # one section PER PLATFORM (LinkedIn incl. its 50-char PDF title,
│                        #   Instagram, Facebook, TikTok), each with its own copy + UTM link
├── content-zh.json      # ┐
├── slides-zh/01-*.png   # ├ only with --zh / translate-zh: Douyin variant (9:16, Chinese)
├── caption-zh.txt       # │
└── zh-lint-report.json  # ┘ advisory-only — zh copy always needs human review
```

## Slide types (the library a topic's outline is composed from)

`cover`, `question` (numbered "Question N of M" with a why-it-matters line and optional 2-cell
spec pair), `stat-callout`, `verdict-list`, `comparison-table`, `spotlight` (always psyllium),
`competitor-card`, `roundup-grid`, `decision-map`, `benefit-grid` (icon+label grid, 3-6 items),
`cta`, `single-highlight` (standalone, `--format single` only). Defined in
`src/slideLibrary/registry.js` + `src/slideLibrary/schemas/*.js` + one template per family in
`src/render/templates/{branded,legacy}/*.html`.

### Icons (`benefit-grid` slide type)

A curated subset of [Tabler's outline icon set](https://tabler.io/icons) (MIT licensed, installed as
`@tabler/icons`) — real designed icons, not hand-drawn SVGs — covering the psyllium content domain:
nature/agriculture, health benefits, QA/lab, and trade/logistics. See `src/render/icons.js` for the
full curated list (`ICON_NAMES`) and how to add more. Icons use `stroke="currentColor"`, so they're
tinted via CSS `color`, not per-icon edits.

**Adding a new slide type**: one new file in `src/slideLibrary/schemas/`, one new template in
`src/render/templates/`, one new entry in `src/slideLibrary/registry.js`. Nothing else in the
pipeline (Planner prompt, Writer schema, renderer) needs to change — the Planner prompt pulls its
list of available types from the registry automatically.

## Themes

Two families in `src/render/themes.js`, seven packs total. Select with `--theme` on
`generate`/`render`, or in the interactive wizard.

### Branded family (the 2026 handoff design system — the default)

From `design_handoff_carousel_pipeline` (three interior directions over one shared template set in
`src/render/templates/branded/`, styled per theme by `src/render/themes/<name>.css` + tokens):

- **`mill-paper`** (default) — premium editorial: Newsreader serif display, Archivo body,
  full-width hairline ledger rules, giant terracotta question numerals, roman-numeral payoff
  rows, underlined-link CTA.
- **`spec-sheet`** — raw-material trade document: Space Grotesk display (uppercase chrome),
  IBM Plex Mono doc codes, a 3px border frame around every slide, bordered header/footer cells,
  solid-green Q-code cell, tinted "why it matters" strip.
- **`grove`** — warm & human: Bricolage Grotesque display, pill badges, rounded cards, numbered
  circle chips, seed-dot progress, arch photo slots (placeholder until real factory photography).

Non-negotiables encoded in the system (not per-template choices): interiors are ALWAYS cream;
the only mark is the client emblem SVG set in `assets/emblems/` used as tinted `<img>` files
(never CSS masks — the HTML→PNG capture doesn't rasterize masks reliably); watermarks at
0.07–0.15 opacity, bleeding off an edge, never crossing text; body ≥28px and meta ≥20px at 1080.

**Cover treatments & grid rotation.** Covers (and CTA/single-highlight field colors) come from one
of three treatments — `2a` deep green, `2b` terracotta, `2c` cream with the giant emblem
signature — chosen per post by a persisted rotation (`state/grid-rotation.json`, strategies in
`src/rotation/gridRotation.js`) so the Instagram/LinkedIn profile grid forms an intentional
pattern ACROSS posts. Default strategy `2a-alternating` = green/cream alternation with terracotta
roughly 1-in-6 (the handoff's Grid A). Only a real `generate` advances the sequence; `--dry-run`,
`render`, and an explicit `--cover` override never do. The chosen cover is recorded in
`run-meta.json` and reused by `translate-zh`. Covers are composed grid-safe on portrait: the
content stays inside the center 1:1 crop the profile grid shows.

**Accent word.** The Writer marks exactly one word/short phrase in cover/CTA headlines as
`*accent*`; the renderer turns it into the theme's italic accent (terracotta family). Content
without markers renders plain — old fixtures keep working.

**Fonts are bundled.** `scripts/fetch-fonts.mjs` downloads every family (incl. Noto Sans SC
slices for the Douyin variant) as woff2 into `assets/fonts/` with a local `fonts.css` — capture is
fully offline/deterministic (`document.fonts.ready` gates the screenshot). Re-run the script only
when adding a family/weight.

### Legacy family (kept selectable, no new development)

The previous Inter/copper "export document" system, templates untouched in
`src/render/templates/legacy/`: **`ledger`**, **`certificate`**, **`mill`**, **`harvest`**. Its
visual rules follow the main repo's `docs/rm-psyllium-design-system.md`; the branded family
supersedes it as the social look, and that doc should eventually be updated to match the handoff.

Adding a theme = one pack in `themes.js` (plus, for a branded theme, one CSS file in
`src/render/themes/`). If a theme needs a new knob, add a CSS variable (consumed with a fallback)
rather than a theme-conditional in any template.

## Design tokens

`src/render/tokens.js` (legacy base) and the `BRANDED_BASE` in `src/render/themes.js` are the
single source of truth for every color/font/spacing value — derived into `src/render/tokens.css`
at the start of every render (branded runs also append the run's `--rmp-cover-*` treatment vars
from `src/render/covers.js`). Re-theming is a token edit — no template hardcodes a hex value.

## Claim-safety rules and brand facts

Pulled from the main repo's `docs/psyllium-nutraceutical-content-cluster.md` and
`docs/linkedin_strategy.md`, embedded verbatim in `src/content/claimSafetyRules.js` and
`src/content/brandFacts.js`. If those source docs change, update here to match — the docs are
authoritative if the two ever drift.

## Known v1 limits (intentional, not oversights)

- **No direct publishing.** Meta Graph API / LinkedIn API integration is a deliberately separate
  future phase (needs app review + tokens) — you post manually from the output folder.
- **No auto-optimization / "learning" yet.** There's no existing social presence or performance
  history to learn from. What v1 does instead: every run is fully logged (`logs/runs.jsonl`), CTA
  links carry UTM parameters so GA4 (already on the live site) can eventually attribute traffic back
  to a topic/platform, and `log-outcome` gives you a place to note results by hand. Real
  auto-optimization is a later phase, once there's real data.
- **Douyin support is translation-based, review-required.** `translate-zh` / `--zh` produces a
  Simplified-Chinese, Douyin-adapted variant of an approved English run — but the claim-safety
  linter is English-only, so the zh variant is never auto-cleared: a human who reads Chinese must
  review before posting.
- **Topic discovery is a grounded brainstorm, not market research.** `discover-topics` proposes
  candidates from the ICP/brand facts already encoded in this project — it does not pull live
  competitor pages, SERP data, or Google Search Console the way the existing LinkedIn article
  backlog was researched by hand (`docs/linkedin_articles_plan.md`). A research-backed version is a
  deliberate later phase, not built here, to avoid duplicating that manual process badly.
- **`--source-doc` only reads plain files.** A `src/data/site.ts#slug` style reference is not
  auto-extracted from the TypeScript array in v1 — for a published post, pass its live URL via
  `--url` instead; otherwise point at a plain text/markdown export of the article, or paste the
  relevant section into its own file.
- **`--url` extraction is fetch + tag-stripping, not a headless browser.** Static/SSR pages
  (including the live RM Psyllium site) extract cleanly; a page that renders its content entirely
  in client-side JavaScript fails with a clear error rather than grounding a deck in nothing. Very
  long articles are truncated at 24k characters (recorded in `source-article.txt`).

## Superseded

`scripts/generate_linkedin_carousel.py` in the main repo (Gamma.app API, PDF-only, a different
brand system) is superseded by this project. Kept in place for reference, not used going forward.
