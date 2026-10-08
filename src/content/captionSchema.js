/** The original single-caption shape — still used by the zh translation
 *  pipeline's base and by pre-platform-captions content.json files. */
export const captionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['primaryText', 'hashtags'],
  properties: {
    primaryText: { type: 'string', minLength: 1 },
    hashtags: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: { type: 'string', pattern: '^#[A-Za-z0-9]+$' },
    },
  },
};

function platformCaption({ minTags, maxTags, maxText, extraProps = {}, extraRequired = [] }) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['primaryText', 'hashtags', ...extraRequired],
    properties: {
      primaryText: { type: 'string', minLength: 1, ...(maxText ? { maxLength: maxText } : {}) },
      hashtags: {
        type: 'array',
        minItems: minTags,
        maxItems: maxTags,
        items: { type: 'string', pattern: '^#[A-Za-z0-9]+$' },
      },
      ...extraProps,
    },
  };
}

/** One caption per platform, each written to that platform's conventions —
 *  not one text copy-pasted four times. linkedin.pdfTitle doubles as the PDF
 *  document title LinkedIn displays (metadata Title on deck-*.pdf). */
export const platformCaptionsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['linkedin', 'instagram', 'facebook', 'tiktok'],
  properties: {
    linkedin: platformCaption({
      minTags: 3,
      maxTags: 5,
      extraProps: {
        pdfTitle: {
          type: 'string',
          minLength: 10,
          maxLength: 50,
          description: 'Document title shown on the LinkedIn PDF post — keyword-led, max 50 chars.',
        },
      },
      extraRequired: ['pdfTitle'],
    }),
    instagram: platformCaption({ minTags: 5, maxTags: 8 }),
    facebook: platformCaption({ minTags: 0, maxTags: 3 }),
    tiktok: platformCaption({ minTags: 3, maxTags: 6, maxText: 600 }),
  },
};
