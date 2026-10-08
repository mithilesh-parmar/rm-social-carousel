export const ctaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'headline', 'body', 'ctaLabel', 'contactLine'],
  properties: {
    type: { type: 'string', const: 'cta' },
    headline: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
    ctaLabel: { type: 'string', minLength: 1 },
    contactLine: { type: 'string', minLength: 1 },
  },
};
