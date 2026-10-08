import { tokens as baseTokens } from './tokens.js';

/**
 * Theme packs — pure token overrides on top of the base (Ledger) tokens.
 * Because every template consumes var(--rmp-*) exclusively, a theme is
 * nothing but data: no template or CSS file knows theme names. All four stay
 * inside the official brand system (docs/rm-psyllium-design-system.md) —
 * they're modes of one brand, not different brands.
 *
 * Suggested use (theme as a content-category signal):
 * - ledger:      the default — any topic.
 * - certificate: QA / compliance / documentation topics (COA, FSVP, import).
 * - mill:        data-led topics (price reports, crop intel, spec charts).
 * - harvest:     origin/process storytelling — best once real factory
 *                photography exists to pair with it.
 */
const THEMES = {
  // The shipped baseline: controlled-export-document look. No overrides.
  ledger: {},

  // COA-inspired formality: white page, serif display (the design system's
  // controlled Playfair accent), zero display tracking (serifs don't want
  // the tight negative tracking Inter 800 does).
  certificate: {
    color: {
      bg: '#FFFFFF',
      cardBg: '#F6F3EE',
      tableRowBg: '#FBF9F4',
    },
    font: {
      display: "'Playfair Display', 'Noto Sans SC', Georgia, serif",
    },
    extra: {
      displayTrackingHero: '0em',
      displayTracking: '0em',
    },
  },

  // Industrial spec-sheet: near-black green dark slides with a faint
  // engineering grid, mono numerals for the big stats.
  mill: {
    color: {
      green: '#10201A',
      inkSecondary: '#3E443C',
    },
    font: {
      stat: "'JetBrains Mono', 'Noto Sans SC', monospace",
    },
    extra: {
      darkTexture:
        'linear-gradient(rgba(250,250,247,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(250,250,247,0.045) 1px, transparent 1px)',
      darkTextureSize: '60px 60px',
    },
  },

  // Olive-led editorial mode for origin/process stories. (Photo-panel
  // layouts are a future layout, not a token concern — this pack just moves
  // the accent voice from copper to olive.)
  harvest: {
    color: {
      accentDefault: '#5F7044',
      accentOptions: ['#5F7044', '#B8753A', '#2F6F4E', '#54707E'],
    },
  },
};

/* ---------------------------------------------------------------------------
 * BRANDED family — the 2026 handoff design system (design_handoff_carousel_
 * pipeline/README.md): 1a Mill Paper, 1b Spec Sheet, 1c Grove. A separate
 * token base from the legacy family because it is a different brand look
 * (cream fields, terracotta accent, per-theme display faces), not a variation
 * of the Inter/copper document system. Same mechanics though: packs are pure
 * data, templates consume var(--rmp-*) only.
 *
 * Non-negotiables encoded here rather than in templates: interiors are ALWAYS
 * cream (bg), body type ≥28px at 1080, footer/meta ≥20px.
 * ------------------------------------------------------------------------- */

// Font stacks. Every family ends in 'Noto Sans SC' so the Douyin variant
// falls back to a real CJK face with a matched weight.
const F = {
  newsreader: "'Newsreader', 'Noto Sans SC', Georgia, serif",
  archivo: "'Archivo', 'Noto Sans SC', sans-serif",
  spaceGrotesk: "'Space Grotesk', 'Noto Sans SC', sans-serif",
  plexMono: "'IBM Plex Mono', 'Noto Sans SC', monospace",
  bricolage: "'Bricolage Grotesque', 'Noto Sans SC', sans-serif",
};

// 1a Mill Paper is the branded base: the other two packs override every value
// that differs (per the handoff: "pick ONE production value per theme").
const BRANDED_BASE = {
  color: {
    // Field + ink
    bg: '#F7F2E8', // cream — interior slides are ALWAYS this
    green: '#1C2B21',
    ink: '#1C2B21', // headings on cream
    bodyText: '#55604F',
    muted: '#6B7263',
    onDark: '#F7F2E8', // text on green/terracotta fields
    onDarkSoft: 'rgba(247,242,232,0.75)',
    onDarkFaint: 'rgba(247,242,232,0.6)',
    // Accents
    terracotta: '#B9552F',
    terracottaLight: '#D98E5F', // accent on dark green
    tan: '#B99B72',
    rust: '#C97B4A',
    whyAccent: '#B9552F', // "why it matters" label voice
    // Rules & surfaces
    rulePrimary: '#1C2B21', // full-strength hairline (ledger frame)
    ruleSecondary: 'rgba(28,43,33,0.25)',
    ruleOnDark: 'rgba(247,242,232,0.35)',
    cardBg: '#FFFFFF', // 1a barely uses cards; 1c overrides
    calloutBg: '#F1EAD9',
    photoTile: '#E7E0D0',
    tableRowBg: 'transparent',
  },
  font: {
    display: F.newsreader, // headlines, giant numerals, page counts
    body: F.archivo,
    label: F.archivo, // letterspaced caps labels/meta
    mono: F.plexMono, // only Spec Sheet leans on this; harmless elsewhere
    sans: F.archivo, // generic fallback slot some shared CSS uses
  },
  layout: {
    canvas: 1080,
    padding: 76, // 36-40px at the 540 reference, ×2
    frameInset: 0, // Spec Sheet's border-box inset; 0 = no frame
    radiusCard: 0, // Mill Paper is rectilinear; Grove overrides
    radiusBadge: 999, // cover badges are pills in all three treatments
    radiusChip: 999,
  },
  type: {
    // Cover (Turn-2 composition, ×2.57 from the 420 reference)
    coverDisplaySize: 112,
    coverDisplayWeight: 500,
    coverSubSize: 34,
    coverLockupSize: 28,
    coverBadgeSize: 22,
    coverFootSize: 25,
    // Interior (×2 from the 540 reference)
    displaySize: 68, // question/section headline
    displayWeight: 500,
    displayTracking: '-0.01em',
    displayTransform: 'none',
    headlineSize: 64, // payoff/list headline
    giantNumSize: 192, // 1a question numeral
    bodySize: 30, // ≥28 non-negotiable
    bodyWeight: 400,
    whySize: 32, // "why it matters" body
    labelSize: 22, // caps/mono labels — ≥20 non-negotiable
    labelWeight: 600,
    labelTracking: '0.22em',
    listItemSize: 32,
    footerSize: 22,
    lineHeight: 1.55,
    displayLineHeight: 1.1,
  },
  extra: {
    // Progress indicator style consumed by branded chrome JS/CSS:
    // serif-count (No. 01 — 08) | mono-bars | seed-dots
    progressStyle: 'serif-count',
  },
};

const BRANDED_THEMES = {
  // 1a — premium editorial: serif display, hairline ledger rules, footnote
  // "why it matters", roman-numeral payoff list. The branded default.
  'mill-paper': {},

  // 1b — raw-material trade document: border-box frame, mono doc codes,
  // uppercase Space Grotesk display, bordered cells everywhere.
  'spec-sheet': {
    color: {
      bg: '#F1EDE3',
      green: '#16352A',
      ink: '#16352A',
      onDark: '#F1EDE3',
      onDarkSoft: 'rgba(241,237,227,0.75)',
      onDarkFaint: 'rgba(241,237,227,0.7)',
      rulePrimary: '#16352A',
      ruleSecondary: 'rgba(22,53,42,0.35)',
      ruleOnDark: 'rgba(241,237,227,0.5)',
      calloutBg: 'rgba(185,85,47,0.08)',
    },
    font: {
      display: F.spaceGrotesk,
      label: F.plexMono,
    },
    layout: {
      padding: 40, // inside the frame; outer inset below
      frameInset: 44, // 22px at the 540 reference, ×2 — the 1.5px border box
    },
    type: {
      coverDisplaySize: 104,
      coverDisplayWeight: 700,
      displaySize: 68,
      displayWeight: 700,
      displayTracking: '-0.01em',
      displayTransform: 'none', // cover chrome uppercases; interiors stay sentence case
      headlineSize: 60,
      labelSize: 21,
      labelWeight: 500,
      labelTracking: '0.05em',
      whySize: 28,
      listItemSize: 30,
      footerSize: 20,
      displayLineHeight: 1.06,
    },
    extra: {
      progressStyle: 'mono-bars',
    },
  },

  // 1c — warm & human: pill badges, rounded cards, numbered circle chips,
  // arch photo slots, seed-dot progress.
  grove: {
    color: {
      bg: '#F5EFE2',
      green: '#1F3A2D',
      ink: '#22301F',
      bodyText: '#5C5A48',
      muted: '#8A8574',
      onDark: '#EFE8D8',
      onDarkSoft: 'rgba(239,232,216,0.75)',
      onDarkFaint: 'rgba(239,232,216,0.6)',
      tan: '#C8A87E',
      whyAccent: '#A05A32',
      rulePrimary: 'rgba(34,48,31,0.2)',
      ruleSecondary: 'rgba(34,48,31,0.12)',
      ruleOnDark: 'rgba(239,232,216,0.3)',
      cardBg: '#FFFDF6',
      calloutBg: '#EAE0CC',
    },
    font: {
      display: F.bricolage,
      label: F.bricolage,
    },
    layout: {
      padding: 68,
      radiusCard: 16,
    },
    type: {
      coverDisplaySize: 104,
      coverDisplayWeight: 700,
      displaySize: 76,
      displayWeight: 700,
      displayTracking: '-0.015em',
      headlineSize: 64,
      bodySize: 29,
      labelSize: 22,
      labelWeight: 600,
      labelTracking: '0.14em',
      whySize: 28,
      listItemSize: 29,
      footerSize: 22,
      displayLineHeight: 1.06,
    },
    extra: {
      progressStyle: 'seed-dots',
    },
  },
};

export const LEGACY_THEME_NAMES = Object.keys(THEMES);
export const BRANDED_THEME_NAMES = Object.keys(BRANDED_THEMES);
export const THEME_NAMES = [...BRANDED_THEME_NAMES, ...LEGACY_THEME_NAMES];

/** 'branded' (the 2026 handoff system) or 'legacy' (Inter/copper document
 *  system). Decides which template directory and stylesheet set a render
 *  uses — the two families never mix within a run. */
export function themeFamily(name) {
  if (BRANDED_THEMES[name]) return 'branded';
  if (THEMES[name]) return 'legacy';
  throw new Error(`Unknown theme "${name}". Available themes: ${THEME_NAMES.join(', ')}.`);
}

/** Shallow-per-bucket merge is all we need: every theme override replaces
 *  whole leaf values inside color/font/layout/type/extra, never nested
 *  structures deeper than that. */
export function resolveTheme(name = 'mill-paper') {
  const family = themeFamily(name);
  const base = family === 'branded' ? BRANDED_BASE : baseTokens;
  const overrides = family === 'branded' ? BRANDED_THEMES[name] : THEMES[name];
  const merged = {};
  for (const bucket of ['color', 'font', 'layout', 'type', 'extra']) {
    merged[bucket] = { ...base[bucket], ...(overrides[bucket] || {}) };
  }
  merged.family = family;
  merged.name = name;
  return merged;
}
