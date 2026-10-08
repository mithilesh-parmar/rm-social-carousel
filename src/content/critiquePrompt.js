import { CLAIM_SAFETY_RULES } from './claimSafetyRules.js';

export const CRITIC_TOOL_NAME = 'emit_critique';
export const CRITIC_TOOL_DESCRIPTION = 'Emit a list of claim-safety findings against the given copy.';

export const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'excerpt', 'concern'],
        properties: {
          field: { type: 'string', minLength: 1 },
          excerpt: { type: 'string', minLength: 1 },
          concern: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

/** Deliberately given ONLY the claim-safety rules and the finished copy — no
 *  outline, no brand-facts context beyond the rules — so it reads the copy
 *  the way a claims-focused human reviewer would: cold, against the rules
 *  only, not primed by the same context that produced the copy. This is what
 *  catches a sentence that's technically hedged but implies more in context,
 *  which the deterministic keyword linter can't reliably tell apart from a
 *  genuinely safe sentence. */
export function buildCritiquePrompt() {
  return `
You are a claim-safety reviewer for regulated health/nutraceutical marketing copy. You will be
given finished slide copy for a social media carousel. Read it against the rules below ONLY — you
have no other context about the brand.

Claim-safety rules:
${CLAIM_SAFETY_RULES}

For each rule violation or borderline case you find — even if no single word is obviously wrong,
but the copy reads as implying more than the hedged/mechanism framing allows — emit a finding with
the exact field path, the offending excerpt, and a one-sentence explanation of the concern. If the
copy is clean, emit an empty findings array. Do not rewrite the copy; only flag it.

Respond only via the emit_critique tool call.
`.trim();
}

export function buildCritiqueUserMessage(content) {
  return `Slide copy and captions to review:\n\n${JSON.stringify({ slides: content.slides, captions: content.captions ?? content.caption }, null, 2)}`;
}
