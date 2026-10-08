import { slideSchemas } from './schemas/index.js';

const KNOWN_TYPES = Object.keys(slideSchemas);

/** The Planner's output shape: an ordered list of {type, keyPoint} briefs, not
 *  final copy. ajv checks basic shape; structural invariants (cover-first,
 *  cta-last, spotlight-if-comparison) are checked separately in
 *  validateOutlineStructure below since they're order/content-dependent rules
 *  a plain JSON Schema can't express cleanly. */
export const outlineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['meta', 'slides'],
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['topic', 'pillar', 'accentColor'],
      properties: {
        topic: { type: 'string', minLength: 1 },
        // Free text, not a fixed enum — the Planner decides the strategic
        // angle/pillar per topic (see planPrompt.js) instead of being forced
        // into a closed taxonomy. A short label ("Technical Authority",
        // "Trade Logistics", "Founder Story") still gets attached to every
        // run for organization/logging, it's just not constrained upfront.
        pillar: { type: 'string', minLength: 1 },
        accentColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      },
    },
    slides: {
      // Loose bound only — the real minimum depends on --format (1 for
      // single, effectively >=2 for carousel since it needs distinct
      // cover/cta slides), which validateOutlineStructure enforces below.
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'keyPoint'],
        properties: {
          type: { type: 'string', enum: KNOWN_TYPES },
          keyPoint: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

const COMPARISON_TYPES = new Set(['comparison-table', 'competitor-card', 'verdict-list']);

/** Structural rules the outline must follow, beyond what JSON Schema can
 *  express: opens with cover, closes with cta (or single-highlight for
 *  --format single, which is checked by the caller since it's a one-slide
 *  deck by definition), and includes a psyllium spotlight whenever the deck
 *  compares fibers. Returns a plain string[] of error messages, empty if ok. */
export function validateOutlineStructure(outline, { format = 'carousel' } = {}) {
  const errors = [];
  const slides = outline.slides || [];

  if (format === 'single') {
    if (slides.length !== 1) {
      errors.push('--format single requires exactly one slide in the outline.');
    } else if (!['stat-callout', 'spotlight', 'single-highlight'].includes(slides[0].type)) {
      errors.push(`--format single must use stat-callout, spotlight, or single-highlight, got "${slides[0].type}".`);
    }
    return errors;
  }

  if (slides[0]?.type !== 'cover') {
    errors.push('Outline must open with a cover slide.');
  }
  if (slides[slides.length - 1]?.type !== 'cta') {
    errors.push('Outline must close with a cta slide.');
  }
  const hasComparison = slides.some((s) => COMPARISON_TYPES.has(s.type));
  const hasSpotlight = slides.some((s) => s.type === 'spotlight');
  if (hasComparison && !hasSpotlight) {
    errors.push('Outline compares fibers but has no spotlight slide for psyllium.');
  }
  return errors;
}
