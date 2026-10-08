export const spotlightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'badge', 'statValue', 'statUnit', 'statCaption', 'headline', 'body'],
  properties: {
    type: { type: 'string', const: 'spotlight' },
    kicker: { type: 'string', minLength: 1 },
    badge: { type: 'string', minLength: 1 },
    statValue: { type: 'string', minLength: 1 },
    statUnit: { type: 'string', minLength: 1 },
    statCaption: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
  },
};
