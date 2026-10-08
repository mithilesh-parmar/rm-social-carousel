import path from 'path';
import { fileURLToPath } from 'url';
import { tokens } from '../render/tokens.js';
import { getIconSvg, ICON_NAMES } from '../render/icons.js';
import { escapeHtml } from '../render/renderTemplate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = path.join(__dirname, '..', 'render', 'templates', 'legacy');
const BRANDED_DIR = path.join(__dirname, '..', 'render', 'templates', 'branded');

const identity = (content) => content;

/** highlight boolean -> per-family highlight hooks: the legacy template takes
 *  literal row backgrounds ({{rowBg}}), the branded one a row class
 *  ({{_hlClass}}) its theme CSS tints. Both are computed here, once — each
 *  family's template simply ignores the other's field. */
function prepareComparisonTable(content) {
  return {
    ...content,
    rows: (content.rows || []).map((row) => ({
      ...row,
      rowBg: row.highlight
        ? `color-mix(in srgb, ${tokens.color.accentDefault} 10%, transparent)`
        : tokens.color.tableRowBg,
      _hlClass: row.highlight ? 'rmpb-table__row--hl' : '',
    })),
  };
}

const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

/** Numbering voices for the branded list rows: roman numerals (Mill Paper),
 *  the authored zero-padded `num` (Spec Sheet), bare digit for the circle
 *  chips (Grove). Legacy ignores the extra fields. */
function prepareVerdictList(content) {
  return {
    ...content,
    rows: (content.rows || []).map((row, i) => ({
      ...row,
      _roman: ROMANS[i] || String(i + 1),
      _n: parseInt(row.num, 10) || i + 1,
    })),
  };
}

/** question: padded indices for the chrome + the optional 2-cell spec pair as
 *  pre-escaped markup built here (the template engine has no {{#if}}; an
 *  absent pair must render nothing, borders included). */
function prepareQuestion(content) {
  const pad = (n) => String(n).padStart(2, '0');
  const specs = Array.isArray(content.specs) ? content.specs : [];
  const specPairHtml = specs.length
    ? `<div class="rmpb-specpair">${specs
        .map(
          (s) =>
            `<div class="rmpb-speccell"><div class="rmpb-speccell__label">${escapeHtml(String(s.label))}</div><div class="rmpb-speccell__value">${escapeHtml(String(s.value))}</div></div>`
        )
        .join('')}</div>`
    : '';
  return {
    ...content,
    _numPadded: pad(content.num),
    _totalPadded: pad(content.totalInSeries),
    _specPairHtml: specPairHtml,
  };
}

/** Maps each item's `icon` key (e.g. "leaf") to its inline SVG markup, once,
 *  before the template ever sees it — the template just outputs {{{iconSvg}}}
 *  raw, it never touches the icon library directly. */
function prepareBenefitGrid(content) {
  return {
    ...content,
    items: (content.items || []).map((item) => ({
      ...item,
      iconSvg: getIconSvg(item.icon),
    })),
  };
}

/**
 * The fixed slide-type library. Adding a new type = one new schema file, one
 * template file per family (same basename in templates/legacy/ and
 * templates/branded/), and one new entry here — nothing else in the pipeline
 * changes. `prepare` is shared across families: it may emit family-specific
 * fields; the other family's template ignores them.
 */
export const slideRegistry = {
  cover: {
    templateBase: 'cover.html',
    prepare: identity,
    description: 'Opening slide — company mark, topic kicker, headline, subhead. Always slide 1.',
  },
  question: {
    templateBase: 'question.html',
    prepare: prepareQuestion,
    description:
      'A numbered question slide ("Question N of M") — the question as the headline, a short explanation, a one-line "why it matters", and optionally exactly 2 typical-spec cells (label + value). Use for intake/checklist/questions-to-ask topics, one question per slide, numbered consecutively from 1.',
  },
  'stat-callout': {
    templateBase: 'stat-callout.html',
    prepare: identity,
    description: 'A single checklist item, fact, or parameter with one QA/action callout. Good for step-by-step or checklist topics.',
  },
  'verdict-list': {
    templateBase: 'verdict-list.html',
    prepare: prepareVerdictList,
    description: 'A short numbered list of options with a one-line rule each (exactly 5 rows). Use for "which X should you pick" overviews, or as the payoff/summary slide before the CTA.',
  },
  'comparison-table': {
    templateBase: 'comparison-table.html',
    prepare: prepareComparisonTable,
    description: 'A 4-column comparison table across several rows (exactly 5). Use when comparing 3+ options on 2+ dimensions.',
  },
  spotlight: {
    templateBase: 'spotlight.html',
    prepare: identity,
    description: 'Feature slide for one big stat + headline + body. ALWAYS about psyllium when present in a comparison deck.',
  },
  'competitor-card': {
    templateBase: 'competitor-card.html',
    prepare: identity,
    description: 'A single non-psyllium option: headline, up to 3 pill tags, 2-4 short bullet cards, a best-fit line.',
  },
  'roundup-grid': {
    templateBase: 'roundup-grid.html',
    prepare: identity,
    description: 'Three short cards summarizing "the rest of the field" (exactly 3).',
  },
  'decision-map': {
    templateBase: 'decision-map.html',
    prepare: identity,
    description: 'Need -> answer mapping rows plus one closing blend/tip callout. Use for "how to choose" or formulation-tip slides.',
  },
  cta: {
    templateBase: 'cta.html',
    prepare: identity,
    description: 'Closing slide — headline, body, sample-request CTA, contact line. Always the last slide.',
  },
  'single-highlight': {
    templateBase: 'single-highlight.html',
    prepare: identity,
    description: 'Self-contained single-image post — kicker, headline, one stat or quote, body, CTA. Only used with --format single, and only as the sole slide.',
  },
  'benefit-grid': {
    templateBase: 'benefit-grid.html',
    prepare: prepareBenefitGrid,
    description: `A 2-column icon+label grid of 3-6 short benefits/features (each item picks one icon from: ${ICON_NAMES.join(', ')}). Use for scannable benefit lists — the icon-illustration alternative to a plain bullet list.`,
  },
};

// Back-compat: templateFile still resolves to the legacy family (existing
// callers/tests), templateFileBranded to the new one.
for (const entry of Object.values(slideRegistry)) {
  entry.templateFile = path.join(LEGACY_DIR, entry.templateBase);
  entry.templateFileBranded = path.join(BRANDED_DIR, entry.templateBase);
}

export function getSlideType(type, family = 'legacy') {
  const entry = slideRegistry[type];
  if (!entry) {
    throw new Error(`Unknown slide type "${type}". Known types: ${Object.keys(slideRegistry).join(', ')}`);
  }
  return {
    ...entry,
    templateFile: family === 'branded' ? entry.templateFileBranded : entry.templateFile,
  };
}
