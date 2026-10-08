import { ICON_NAMES } from '../../render/icons.js';

export const benefitGridSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'items'],
  properties: {
    type: { type: 'string', const: 'benefit-grid' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    items: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['icon', 'label'],
        properties: {
          icon: { type: 'string', enum: ICON_NAMES },
          label: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};
