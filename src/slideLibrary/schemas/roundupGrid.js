export const roundupGridSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'cards'],
  properties: {
    type: { type: 'string', const: 'roundup-grid' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    cards: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'tag', 'body'],
        properties: {
          name: { type: 'string', minLength: 1 },
          tag: { type: 'string', minLength: 1 },
          body: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};
