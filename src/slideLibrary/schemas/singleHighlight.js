export const singleHighlightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'statOrQuote', 'body', 'ctaLabel', 'contactLine'],
  properties: {
    type: { type: 'string', const: 'single-highlight' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    statOrQuote: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
    ctaLabel: { type: 'string', minLength: 1 },
    contactLine: { type: 'string', minLength: 1 },
  },
};
