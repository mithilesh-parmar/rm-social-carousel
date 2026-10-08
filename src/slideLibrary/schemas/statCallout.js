export const statCalloutSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'body', 'actionLabel', 'actionBody'],
  properties: {
    type: { type: 'string', const: 'stat-callout' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
    actionLabel: { type: 'string', minLength: 1 },
    actionBody: { type: 'string', minLength: 1 },
  },
};
