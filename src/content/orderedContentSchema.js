import { slideSchemas } from '../slideLibrary/schemas/index.js';
import { platformCaptionsSchema } from './captionSchema.js';

/**
 * Builds a JSON Schema for exactly one outline's worth of content: a tuple
 * (draft 2020-12 "prefixItems" form, required by Anthropic's tool input_schema
 * validator — the older draft-07 array-form "items" + "additionalItems" is
 * NOT accepted there) where position i must match
 * slideSchemas[outline.slides[i].type]. This constrains the Writer's single
 * batched tool call to emit slides in the Planner's exact type sequence,
 * rather than validating loosely and hoping the model followed the outline.
 */
export function buildOrderedContentSchema(outline) {
  const perSlideSchemas = outline.slides.map((s) => {
    const schema = slideSchemas[s.type];
    if (!schema) throw new Error(`Outline references unknown slide type "${s.type}".`);
    return schema;
  });

  return {
    type: 'object',
    additionalProperties: false,
    required: ['slides', 'captions'],
    properties: {
      slides: {
        type: 'array',
        minItems: perSlideSchemas.length,
        maxItems: perSlideSchemas.length,
        prefixItems: perSlideSchemas,
        items: false,
      },
      captions: platformCaptionsSchema,
    },
  };
}
