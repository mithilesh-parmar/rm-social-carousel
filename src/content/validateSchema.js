import Ajv from 'ajv';
import { slideSchemas } from '../slideLibrary/schemas/index.js';
import { outlineSchema, validateOutlineStructure } from '../slideLibrary/outlineSchema.js';
import { captionSchema, platformCaptionsSchema } from './captionSchema.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateOutlineFn = ajv.compile(outlineSchema);
const validateCaptionFn = ajv.compile(captionSchema);
const validatePlatformCaptionsFn = ajv.compile(platformCaptionsSchema);
const slideValidators = Object.fromEntries(
  Object.entries(slideSchemas).map(([type, schema]) => [type, ajv.compile(schema)])
);

function formatAjvErrors(errors) {
  return (errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}`);
}

/** Validates the Planner's outline: shape (ajv) + structural invariants
 *  (cover-first/cta-last/spotlight-if-comparison, checked separately since
 *  they're order-dependent rules JSON Schema can't express). */
export function validateOutline(outline, { format = 'carousel' } = {}) {
  const shapeOk = validateOutlineFn(outline);
  const errors = shapeOk ? [] : formatAjvErrors(validateOutlineFn.errors);
  if (shapeOk) {
    errors.push(...validateOutlineStructure(outline, { format }));
  }
  return { valid: errors.length === 0, errors };
}

/** Validates one Writer-produced slide against its type's schema. Unknown
 *  types fail loudly rather than silently passing through to the renderer. */
export function validateSlideContent(slide) {
  const validator = slideValidators[slide?.type];
  if (!validator) {
    return { valid: false, errors: [`Unknown slide type "${slide?.type}".`] };
  }
  const valid = validator(slide);
  return { valid, errors: valid ? [] : formatAjvErrors(validator.errors) };
}

/** Some models emit nested tool-call objects as JSON-encoded *strings* —
 *  observed in the wild: caption arrived as '{"primaryText":...}' with raw
 *  tool-call markup (`<parameter name="slides">...`) trailing after the
 *  object, and crashed the caption writer downstream. Recover the leading
 *  balanced JSON object if there is one; anything else passes through
 *  untouched for validation to reject with a real error message. */
export function normalizeCaption(caption) {
  if (typeof caption !== 'string') return caption;
  const start = caption.indexOf('{');
  if (start === -1) return caption;
  // Walk to the matching close brace (string-aware), then JSON.parse just
  // that slice — tolerates trailing garbage without accepting a mangled
  // object, since the slice still has to parse cleanly.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < caption.length; i++) {
    const ch = caption[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(caption.slice(start, i + 1));
          if (parsed && typeof parsed === 'object') return parsed;
        } catch {
          // fall through — validation will report the shape error
        }
        break;
      }
    }
  }
  return caption;
}

/** Validates the Writer's caption against captionSchema — previously only
 *  slides were validated, which let a malformed caption reach the renderer. */
export function validateCaption(caption) {
  const valid = validateCaptionFn(caption);
  return { valid, errors: valid ? [] : formatAjvErrors(validateCaptionFn.errors).map((e) => `caption: ${e}`) };
}

/** Validates the Writer's per-platform captions object (linkedin/instagram/
 *  facebook/tiktok, each with its own conventions + linkedin.pdfTitle). */
export function validatePlatformCaptions(captions) {
  const valid = validatePlatformCaptionsFn(captions);
  return { valid, errors: valid ? [] : formatAjvErrors(validatePlatformCaptionsFn.errors).map((e) => `captions: ${e}`) };
}

/** Validates every slide in a full content object ({meta, slides, caption}),
 *  returning one aggregated result so the pipeline can fail with a complete
 *  picture instead of stopping at the first bad slide. */
export function validateContent(content) {
  const errors = [];
  (content.slides || []).forEach((slide, i) => {
    const result = validateSlideContent(slide);
    if (!result.valid) {
      errors.push(...result.errors.map((e) => `slides[${i}] (${slide?.type}): ${e}`));
    }
  });
  return { valid: errors.length === 0, errors };
}
