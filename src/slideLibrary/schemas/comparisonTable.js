export const comparisonTableSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'columnHeaders', 'rows'],
  properties: {
    type: { type: 'string', const: 'comparison-table' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    columnHeaders: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1 },
    },
    rows: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fiber', 'ferm', 'visc', 'fit', 'highlight'],
        properties: {
          fiber: { type: 'string', minLength: 1 },
          ferm: { type: 'string', minLength: 1 },
          visc: { type: 'string', minLength: 1 },
          fit: { type: 'string', minLength: 1 },
          highlight: { type: 'boolean' },
        },
      },
    },
  },
};
