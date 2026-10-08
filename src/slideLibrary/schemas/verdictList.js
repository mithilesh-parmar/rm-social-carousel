export const verdictListSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'kicker', 'headline', 'subhead', 'rows'],
  properties: {
    type: { type: 'string', const: 'verdict-list' },
    kicker: { type: 'string', minLength: 1 },
    // Two display lines max in the branded themes' 64px headline.
    headline: { type: 'string', minLength: 1, maxLength: 60 },
    // Two body lines max — the rows below are the slide's real content.
    subhead: { type: 'string', minLength: 1, maxLength: 120 },
    rows: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['num', 'name', 'rule'],
        properties: {
          num: { type: 'string', pattern: '^[0-9]{2}$' },
          name: { type: 'string', minLength: 1, maxLength: 40 },
          // Must fit on ONE line at the branded themes' 28px list body on a
          // 1080 canvas (the tightest layout in the system): ~56 chars. A
          // real generation once produced 77-90 char rules that wrapped to
          // 2 lines each and, times 5 rows, overflowed the canvas.
          rule: {
            type: 'string',
            minLength: 1,
            maxLength: 56,
            description: 'One short line, under 56 characters — this is a quick-scan verdict, not an explanation.',
          },
        },
      },
    },
  },
};
