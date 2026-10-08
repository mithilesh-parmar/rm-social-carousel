export const questionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'num', 'totalInSeries', 'fieldLabel', 'headline', 'body', 'whyItMatters'],
  properties: {
    type: { type: 'string', const: 'question' },
    // Position within the question series (not the deck): "Question 2 of 5".
    num: { type: 'integer', minimum: 1, maximum: 99 },
    totalInSeries: { type: 'integer', minimum: 1, maximum: 99 },
    // Mono doc-code voice in the Spec Sheet header, e.g. "MESH SIZE / PURITY
    // GRADE" — a telegraphic label, not a sentence.
    fieldLabel: { type: 'string', minLength: 1, maxLength: 36 },
    // The question itself. Two display lines max at 68-76px.
    headline: { type: 'string', minLength: 1, maxLength: 80 },
    body: { type: 'string', minLength: 1, maxLength: 240 },
    // One line, rendered as the footnote/strip/callout depending on theme.
    whyItMatters: { type: 'string', minLength: 1, maxLength: 150 },
    // Optional pair of typical-spec cells (exactly 2 when present) — e.g.
    // TYPICAL — CAPSULE: 40–60 mesh / TYPICAL — FOOD: 80–100 mesh.
    specs: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 24 },
          value: { type: 'string', minLength: 1, maxLength: 18 },
        },
      },
    },
  },
};
