export const coverSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'badge', 'headline', 'subhead', 'swipeCue'],
  properties: {
    type: { type: 'string', const: 'cover' },
    kicker: { type: 'string', minLength: 1 },
    badge: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    subhead: { type: 'string', minLength: 1 },
    swipeCue: { type: 'string', minLength: 1 },
  },
};
