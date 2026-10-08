export const competitorCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'pillTags', 'bulletCards', 'bestFit'],
  properties: {
    type: { type: 'string', const: 'competitor-card' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    pillTags: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    bulletCards: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string', minLength: 1 },
    },
    bestFit: { type: 'string', minLength: 1 },
  },
};
