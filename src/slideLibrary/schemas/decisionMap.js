export const decisionMapSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'rows', 'blendNote'],
  properties: {
    type: { type: 'string', const: 'decision-map' },
    kicker: { type: 'string', minLength: 1 },
    headline: { type: 'string', minLength: 1 },
    rows: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['need', 'answer'],
        properties: {
          need: {
            type: 'string',
            minLength: 1,
            maxLength: 45,
            description: 'A short need/use-case phrase (e.g. "Heart health / daily fiber"), not a full sentence.',
          },
          // A real generation once produced 60-83 char full-sentence
          // explanations here ("Psyllium husk — its viscous gel is the
          // mechanism, not just a marketing word.") instead of a short
          // direct answer, which — times up to 5 rows — overflowed the
          // canvas. This is a direct-answer field, not an explanation one.
          answer: {
            type: 'string',
            minLength: 1,
            maxLength: 30,
            description: 'Just the direct answer — a fiber/solution name or a 2-4 word phrase (e.g. "Psyllium", "Inulin / FOS or acacia"). Never a sentence explaining why.',
          },
        },
      },
    },
    blendNote: { type: 'string', minLength: 1, maxLength: 220 },
  },
};
