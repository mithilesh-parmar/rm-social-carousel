import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const tokens = {
  // Palette comes straight from docs/rm-psyllium-design-system.md ("Core
  // Palette") — the official brand system, not a per-project invention. The
  // earlier beige/terracotta set predated that document; if the design system
  // and this file ever drift, the design system doc is authoritative.
  color: {
    bg: '#FAFAF7', // rm-paper
    green: '#1B3828', // rm-deep-green — dark slides, strong headings
    leaf: '#2F6F4E', // rm-leaf — digital CTA / buyer action
    olive: '#5F7044', // rm-olive — quiet brand accent
    gold: '#C8A95A', // rm-gold — fine rules, seals, on-dark accents
    accentDefault: '#B8753A', // rm-copper — warm commercial accent
    accentOptions: ['#B8753A', '#2F6F4E', '#5F7044', '#54707E'],
    cardBg: '#F5F3EC', // rm-surface
    cardBorder: '#D8D3C7', // rm-rule
    ink: '#1A1C18', // rm-ink
    inkSecondary: '#43473F',
    inkMuted: '#72776D', // rm-muted
    bodyOnDark: '#D9E2D6',
    footerOnDark: '#9BAC9C',
    accentLightOnDark: '#C8A95A', // gold carries the on-dark accent role
    tableRowBg: '#F6F3EE', // rm-cream — document table banding
    white: '#FFFFFF',
  },
  // Inter is the master brand typeface (design system: Inter 800 for large
  // commercial headlines). JetBrains Mono is the brand's "technical family" —
  // document IDs, lot numbers, metadata — used here for kickers, badges, and
  // footer indexes to give every slide the export-document feel. Inter still
  // carries a real italic for the single-highlight quote moment.
  font: {
    // 'Noto Sans SC' sits after each Latin family so CJK glyphs (the Douyin
    // Chinese variant) fall back to a real Chinese face instead of the
    // system default — harmless for pure-Latin content.
    sans: "'Inter', 'Noto Sans SC', sans-serif",
    mono: "'JetBrains Mono', 'Noto Sans SC', monospace",
    // display = headline family, stat = the big numeral family. Both default
    // to sans; theme packs (see themes.js) swap them — Certificate puts
    // Playfair Display on headlines, Mill Mono puts JetBrains Mono on stats.
    display: "'Inter', 'Noto Sans SC', sans-serif",
    stat: "'Inter', 'Noto Sans SC', sans-serif",
    // One href for every theme (Playfair and Noto ride along unused when not
    // needed) — cheaper than per-theme font URLs and keeps captureSlides
    // theme-agnostic about font loading.
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@500;600;700&family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,500&family=Noto+Sans+SC:wght@400;500;700;800&display=swap',
  },
  layout: {
    canvas: 1080,
    padding: 80,
    paddingTight: 72,
    // Design-system shape language: square or 4-8px radius cards, thin rules,
    // vertical accent bars. Pill radius survives only for CTA buttons ("large
    // rounded pills except buttons").
    radiusCard: 8,
    radiusCardSm: 6,
    radiusPill: 100,
  },
  // A single, finalized type scale — every template pulls sizes/weights from
  // here (via the .rmp-* classes in layout.css) instead of picking its own
  // inline number. Tuned for: (1) legibility at Instagram-grid thumbnail
  // size, where anything under ~18px effectively disappears; (2) one place
  // to retune later instead of hunting through 10 template files; (3) weight
  // discipline — hero/headline sit at 700, everything else at 400 or 600,
  // nothing in between, so hierarchy comes from that jump and from size, not
  // from a font-family switch (no serif anywhere in this system anymore).
  type: {
    kickerSize: 15, // mono reads wider — one step down from the old 16
    kickerWeight: 600,
    badgeSize: 13,
    badgeWeight: 600,
    heroSize: 76, // cover's main headline only
    heroWeight: 800, // design system: Inter 800 for large commercial headlines
    headlineSize: 52, // every other slide's section headline
    headlineWeight: 800,
    statHeroSize: 108, // spotlight's big stat number
    bodySize: 22,
    bodyWeight: 400,
    bodyLargeSize: 25, // cover subhead, cta/spotlight main body
    bodyLargeWeight: 400,
    cardLabelSize: 17,
    cardLabelWeight: 700,
    cardBodySize: 20,
    cardBodyWeight: 400,
    footerIndexSize: 14, // mono
    footerIndexWeight: 500,
    lineHeight: 1.5,
  },
  // Free-form CSS values themes can override that don't fit the buckets
  // above. Emitted as --rmp-<kebab-key> verbatim.
  extra: {
    displayTrackingHero: '-0.025em', // .rmp-h1 letter-spacing (serif themes set 0)
    displayTracking: '-0.02em', // .rmp-h2 letter-spacing
    darkTexture: 'none', // background-image layered onto .rmp-slide--dark
    darkTextureSize: 'auto',
  },
};

/** Derives a `:root { --rmp-*: ...; }` CSS string from the tokens object above.
 *  This is the ONLY place hex values are written — every template consumes
 *  var(--rmp-*) so re-theming later is a one-file edit here, not a find-and-replace
 *  across templates. */
export function tokensToCss(t = tokens) {
  const lines = [':root {'];
  for (const [key, value] of Object.entries(t.color)) {
    if (Array.isArray(value)) continue;
    lines.push(`  --rmp-${kebab(key)}: ${value};`);
  }
  (t.color.accentOptions || []).forEach((hex, i) => {
    lines.push(`  --rmp-accent-option-${i}: ${hex};`);
  });
  for (const [key, value] of Object.entries(t.font)) {
    if (key === 'googleFontsHref') continue;
    lines.push(`  --rmp-font-${kebab(key)}: ${value};`);
  }
  for (const [key, value] of Object.entries(t.layout)) {
    lines.push(`  --rmp-${kebab(key)}: ${typeof value === 'number' ? value + 'px' : value};`);
  }
  for (const [key, value] of Object.entries(t.type)) {
    const isWeight = key.toLowerCase().endsWith('weight');
    const isLineHeight = key.toLowerCase().includes('lineheight');
    // Strings (tracking values like '-0.01em', keywords like 'uppercase')
    // pass through verbatim; only bare numbers that aren't weights or
    // line-heights are px sizes.
    const unit = typeof value === 'number' && !isWeight && !isLineHeight ? 'px' : '';
    lines.push(`  --rmp-type-${kebab(key)}: ${value}${unit};`);
  }
  for (const [key, value] of Object.entries(t.extra || {})) {
    lines.push(`  --rmp-${kebab(key)}: ${value};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function kebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Regenerates render/tokens.css from a tokens object (default: the base
 *  Ledger theme). Called once at the start of every render pipeline
 *  invocation, so tokens.css is never hand-edited or allowed to drift from
 *  tokens.js/themes.js — those are the single source of truth. */
export function writeTokensCss(themeTokens = tokens) {
  const outPath = path.join(__dirname, 'tokens.css');
  fs.writeFileSync(outPath, tokensToCss(themeTokens) + '\n', 'utf8');
  return outPath;
}

