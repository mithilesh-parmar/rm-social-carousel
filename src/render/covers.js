import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMBLEMS_DIR = path.join(__dirname, '..', '..', 'assets', 'emblems');

/** The ONLY approved mark (handoff non-negotiable): the client-supplied
 *  emblem SVGs, embedded as tinted <img> data URIs — never CSS masks (the
 *  HTML→PNG capture doesn't rasterize masks reliably; this is also why the
 *  legacy family's masked-PNG lockup was not carried over). The emblem is a
 *  tall mark: viewBox 1028×1944, so it is sized by WIDTH with
 *  aspect-ratio 1028/1944. */
const EMBLEM_FILES = {
  full: 'rm-emblem.svg', // #1F3B2C — on cream fields
  cream: 'rm-emblem-cream.svg', // #F7F2E8 — watermark on dark/terracotta
  tan: 'rm-emblem-tan.svg', // #B99B72 — subtle accent on dark green
  rust: 'rm-emblem-rust.svg', // #C97B4A — small accents on cream
};

const emblemCache = {};
export function emblemDataUri(variant) {
  if (!EMBLEM_FILES[variant]) {
    throw new Error(`Unknown emblem variant "${variant}". Known: ${Object.keys(EMBLEM_FILES).join(', ')}.`);
  }
  if (!emblemCache[variant]) {
    const svg = fs.readFileSync(path.join(EMBLEMS_DIR, EMBLEM_FILES[variant]));
    emblemCache[variant] = 'data:image/svg+xml;base64,' + svg.toString('base64');
  }
  return emblemCache[variant];
}

/** Emblem <img> tag with explicit aspect-ratio so width alone sizes it. */
export function emblemImgTag(variant, styles = '', className = '') {
  return `<img src="${emblemDataUri(variant)}" alt=""${className ? ` class="${className}"` : ''} style="aspect-ratio:1028/1944;${styles}">`;
}

/**
 * Cover treatments — each is a skin over the same content slots (lockup,
 * badge, headline+accent word, subhead, swipe cue, page count). All px are
 * production scale (the 420px Turn-2 reference ×2.57, rounded).
 *
 * `field`/text colors are var() references where the value is theme-scoped
 * (each theme has its own green/cream) and literals where the handoff fixes
 * them (terracotta is #B9552F on every theme).
 *
 * Watermark rules (non-negotiable): opacity 0.07–0.15, bleeding off an edge,
 * never overlapping text — 2c additionally constrains the text column to 60%
 * width so copy can never cross the mark.
 */
export const COVER_TREATMENTS = {
  '2a': {
    name: 'Deep green',
    field: 'var(--rmp-green)',
    ink: 'var(--rmp-on-dark)',
    inkSoft: 'var(--rmp-on-dark-soft)',
    inkFaint: 'var(--rmp-on-dark-faint)',
    accent: 'var(--rmp-terracotta-light)', // accent word, italic
    badgeColor: 'var(--rmp-terracotta-light)',
    badgeBorder: 'rgba(217,142,95,0.5)',
    badgeBg: 'transparent',
    textMaxWidth: '78%',
    watermark: { variant: 'cream', width: 514, css: 'right:-141px;top:50%;transform:translateY(-50%);', opacity: 0.07 },
  },
  '2b': {
    name: 'Terracotta',
    field: '#B9552F',
    ink: 'var(--rmp-on-dark)',
    inkSoft: 'rgba(247,242,232,0.85)',
    inkFaint: 'rgba(247,242,232,0.75)',
    accent: 'var(--rmp-green)',
    badgeColor: 'var(--rmp-on-dark)',
    badgeBorder: 'transparent',
    badgeBg: 'rgba(28,43,33,0.35)',
    textMaxWidth: '78%',
    watermark: { variant: 'cream', width: 463, css: 'right:-116px;bottom:-154px;transform:rotate(10deg);', opacity: 0.07 },
  },
  '2c': {
    name: 'Cream signature',
    field: 'var(--rmp-bg)',
    ink: 'var(--rmp-ink)',
    inkSoft: 'var(--rmp-body-text)',
    inkFaint: 'var(--rmp-muted)',
    accent: 'var(--rmp-terracotta)',
    badgeColor: 'var(--rmp-terracotta)',
    badgeBorder: 'rgba(185,85,47,0.45)',
    badgeBg: 'transparent',
    // Text column constrained so nothing ever crosses the giant mark.
    textMaxWidth: '60%',
    watermark: { variant: 'full', width: 437, css: 'right:-103px;top:46%;transform:translateY(-46%) rotate(10deg);', opacity: 0.1 },
  },
};

export const COVER_IDS = Object.keys(COVER_TREATMENTS);

export function resolveCover(id = '2a') {
  const t = COVER_TREATMENTS[id];
  if (!t) throw new Error(`Unknown cover treatment "${id}". Available: ${COVER_IDS.join(', ')}.`);
  return t;
}

/** CSS custom properties the branded cover/cta templates consume — appended
 *  after tokens.css so cover choice is pure data to the templates. The CTA
 *  slide reuses the cover's field color (handoff rule), which is why these
 *  are run-scoped, not slide-scoped. */
export function coverCssVars(id) {
  const t = resolveCover(id);
  return [
    ':root {',
    `  --rmp-cover-field: ${t.field};`,
    `  --rmp-cover-ink: ${t.ink};`,
    `  --rmp-cover-ink-soft: ${t.inkSoft};`,
    `  --rmp-cover-ink-faint: ${t.inkFaint};`,
    `  --rmp-cover-accent: ${t.accent};`,
    `  --rmp-cover-badge-color: ${t.badgeColor};`,
    `  --rmp-cover-badge-border: ${t.badgeBorder};`,
    `  --rmp-cover-badge-bg: ${t.badgeBg};`,
    `  --rmp-cover-text-max-width: ${t.textMaxWidth};`,
    '}',
  ].join('\n');
}

/** The cover watermark as a ready <img> tag (position: absolute inside the
 *  overflow:hidden slide). Built here, not in templates, so the opacity and
 *  off-edge rules can't drift per template. */
export function coverWatermarkTag(id) {
  const { watermark } = resolveCover(id);
  return emblemImgTag(
    watermark.variant,
    `position:absolute;width:${watermark.width}px;opacity:${watermark.opacity};${watermark.css}`,
    'rmpb-watermark' // excluded from the post-render overflow check (it bleeds off-edge by design)
  );
}
