import { coverSchema } from './cover.js';
import { questionSchema } from './question.js';
import { statCalloutSchema } from './statCallout.js';
import { verdictListSchema } from './verdictList.js';
import { comparisonTableSchema } from './comparisonTable.js';
import { spotlightSchema } from './spotlight.js';
import { competitorCardSchema } from './competitorCard.js';
import { roundupGridSchema } from './roundupGrid.js';
import { decisionMapSchema } from './decisionMap.js';
import { ctaSchema } from './cta.js';
import { singleHighlightSchema } from './singleHighlight.js';
import { benefitGridSchema } from './benefitGrid.js';

/** type id -> JSON Schema for that slide's content fields. Single source of
 *  truth reused by both ajv validation (validateSchema.js) and the Claude
 *  tool-use input_schema for the Writer stage (content/providers/*.js) —
 *  adding a slide type means adding one entry here. */
export const slideSchemas = {
  cover: coverSchema,
  question: questionSchema,
  'stat-callout': statCalloutSchema,
  'verdict-list': verdictListSchema,
  'comparison-table': comparisonTableSchema,
  spotlight: spotlightSchema,
  'competitor-card': competitorCardSchema,
  'roundup-grid': roundupGridSchema,
  'decision-map': decisionMapSchema,
  cta: ctaSchema,
  'single-highlight': singleHighlightSchema,
  'benefit-grid': benefitGridSchema,
};
