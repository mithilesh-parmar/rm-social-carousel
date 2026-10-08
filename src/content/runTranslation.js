import Ajv from 'ajv';
import { getModelsConfig } from './models.js';
import { generateValidated } from './runPipeline.js';
import { buildOrderedContentSchema } from './orderedContentSchema.js';
import { validateContent } from './validateSchema.js';
import { FORBIDDEN_CERTIFICATION_TERMS } from '../linter/claimSafetyWordlists.js';

const TRANSLATE_TOOL_NAME = 'emit_translated_content';
const TRANSLATE_TOOL_DESCRIPTION =
  'Emit the fully translated slide copy (same slide order and types) plus a Douyin-adapted caption.';

// Douyin hashtags are Chinese words — the English caption pattern
// (^#[A-Za-z0-9]+$) would reject them, so the zh caption schema allows any
// unicode after the #. douyinTitle is the post title Douyin displays —
// capped at 20 characters (Chinese characters count as 1 each).
const zhCaptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['douyinTitle', 'primaryText', 'hashtags'],
  properties: {
    douyinTitle: { type: 'string', minLength: 4, maxLength: 20 },
    primaryText: { type: 'string', minLength: 1 },
    hashtags: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: { type: 'string', pattern: '^#.+$' },
    },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateZhCaption = ajv.compile(zhCaptionSchema);

function buildTranslatePrompt() {
  return `
You are the Chinese localizer for RM Psyllium (an Indian bulk psyllium mill) adapting a finished,
claim-safety-approved English social carousel for Douyin (抖音). You will be given the approved
English slide copy and caption; translate and culturally adapt every field into Simplified Chinese.

Rules:
- This is adaptation, not word-for-word mirroring: natural, professional Simplified Chinese as a
  B2B ingredient supplier would write for Chinese buyers/importers. Keep sentences shorter than the
  English where Chinese allows it.
- Do NOT add, remove, strengthen, or weaken any factual or health-related claim. The English copy
  passed a claim-safety review — your translation must carry exactly the same meaning and hedging.
- Terminology: psyllium husk = 圆苞车前子壳 (a.k.a. 洋车前子壳 — pick one and stay consistent);
  COA = COA（检测报告）on first use, COA after; keep units (ppm, mcg, g, mesh) and all numbers
  EXACTLY as in the source; keep "RM Psyllium" and the email export@rmpsyllium.com in Latin script.
- Regulatory names (FDA, Prop 65, USP) stay in Latin script — do not translate or explain beyond
  what the source says.
- NEVER use these words/names in any language or script, even to deny them (a filter blocks any
  occurrence): ${FORBIDDEN_CERTIFICATION_TERMS.join(', ')}, and their Chinese equivalents (认证,
  资质认证) — phrase around them (e.g. 提供批次检测报告 instead of 无需认证).
- Field structure is fixed: same slide order, same types, same fields, same array lengths. Respect
  every maxLength in the schema — Chinese is denser, so this is rarely a constraint, but count if
  close. The "num" fields (e.g. "01") and any hex colors stay unchanged.
- Caption ("caption"): rewrite for Douyin conventions — hook first line, short paragraphs, 3-8
  Chinese hashtags (e.g. #圆苞车前子壳). No UTM links; end with the email contact. Also write
  "douyinTitle": the post title, MAXIMUM 20 Chinese characters, concrete and specific (e.g.
  车前子壳铅含量怎么看), no punctuation-only flourishes.
- Natural voice, Chinese edition: write like a B2B trade professional, not a marketing account.
  No 营销腔 filler — avoid 赋能, 助力, 打造, 引领, 卓越, 开启……之旅, 全方位, 一站式, 极致 and similar
  hype words; no exclamation marks (感叹号); no absolute promises (保证, 百分百, 绝对). Plain,
  specific, measured — the same voice as the English source.

Respond only via the ${TRANSLATE_TOOL_NAME} tool call.
`.trim();
}

/**
 * Translates an approved English content object into Simplified Chinese for
 * Douyin, constrained to the same ordered slide schema (so the zh variant
 * renders through the exact same templates). English claim-safety linting
 * does not transfer to Chinese text — the caller is told to treat the zh
 * variant as manual-review-required.
 */
export async function runTranslation({ outline, content, modelOverride }) {
  const models = getModelsConfig(modelOverride);

  // Same tuple schema as the Writer, with the caption slot swapped for the
  // unicode-hashtag variant.
  const schema = buildOrderedContentSchema(outline);
  schema.properties.caption = zhCaptionSchema;

  const userMessage = [
    'Approved English content to translate (keep slide order/types/fields exactly; the captions are source material for ONE Douyin caption + douyinTitle):',
    JSON.stringify({ slides: content.slides, captions: content.captions ?? content.caption }, null, 2),
  ].join('\n\n');

  const translated = await generateValidated({
    stageName: 'Translator (zh)',
    stageConfig: models.writer,
    system: buildTranslatePrompt(),
    userMessage,
    toolName: TRANSLATE_TOOL_NAME,
    toolDescription: TRANSLATE_TOOL_DESCRIPTION,
    schema,
    validate: (result) => {
      const expected = outline.slides.length;
      const countErrors =
        Array.isArray(result.slides) && result.slides.length === expected
          ? []
          : [`slides: expected exactly ${expected} slides, got ${Array.isArray(result.slides) ? result.slides.length : typeof result.slides}.`];
      const slidesResult = validateContent({ slides: result.slides });
      const captionOk = validateZhCaption(result.caption);
      const captionErrors = captionOk
        ? []
        : (validateZhCaption.errors || []).map((e) => `caption: ${e.instancePath || '(root)'} ${e.message}`);
      return {
        valid: countErrors.length === 0 && slidesResult.valid && captionOk,
        errors: [...countErrors, ...slidesResult.errors, ...captionErrors],
      };
    },
  });

  return {
    meta: { ...content.meta, language: 'zh-CN', translatedFrom: 'en' },
    slides: translated.slides,
    caption: translated.caption,
  };
}
