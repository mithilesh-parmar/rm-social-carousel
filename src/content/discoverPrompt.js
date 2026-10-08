import { COMPANY_FACTS, ICP_FACTS, FORBIDDEN_FACTS } from './brandFacts.js';

export const DISCOVER_TOOL_NAME = 'emit_topic_candidates';
export const DISCOVER_TOOL_DESCRIPTION = 'Emit a list of ICP-targeted candidate carousel topics.';

export const DISCOVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'pillar', 'icpTarget', 'rationale'],
        properties: {
          topic: { type: 'string', minLength: 1 },
          // Free text — see planPrompt.js's EXAMPLE_PILLARS; not a fixed enum.
          pillar: { type: 'string', minLength: 1 },
          icpTarget: {
            type: 'string',
            enum: [
              'ICP A — International procurement/sourcing managers',
              'ICP B — Product formulation consultants / R&D chemists',
              'ICP C — Domestic Indian merchant exporters / trading desks',
              'ICP D — Growth-stage SMB/DTC brands',
            ],
          },
          rationale: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

/**
 * v1 "grounded brainstorm": proposes candidate topics from the ICP/brand
 * facts already in the system — no live research, no competitor/SERP/GSC
 * data. That's a deliberate, smaller first step (see project discussion):
 * genuinely useful for ICP-targeting and avoiding duplicate topics, but
 * bounded by what's already encoded here, not fresh market signal. A
 * research-backed version (pulling real competitor/search data, the way the
 * LinkedIn article backlog was built by hand) is an explicit later phase, not
 * this function's job.
 */
export function buildDiscoverPrompt() {
  return `
You are a topic-discovery assistant for RM Psyllium's social carousel automation. Propose candidate
carousel topics that are highly targeted to a SPECIFIC ICP each — not generic "about psyllium"
topics. Every candidate must name which ICP it targets and explain, in one sentence, why that ICP
specifically would stop scrolling for it (their actual pain point, from the list below), not just
that it's "relevant."

Brand facts (closed list — do not invent facts beyond this):
${COMPANY_FACTS}

${ICP_FACTS}

Forbidden — never suggest a topic that would require any of the following to write about:
${FORBIDDEN_FACTS}

For each candidate, invent a short (2-5 word) content pillar/angle label that captures why it's
being proposed — not a fixed list to pick from. For calibration, here's the shape a good label
takes (from this business's own established positioning), not the only valid answers:
- "Technical Authority" — QA/spec/formulation education, targets ICP A and ICP B most directly.
- "Manufacturing Transparency" — pre-launch plant/commissioning transparency, targets ICP A and ICP C.
- "Sourcing De-risked" — sample-first policy, lead-gen CTAs, targets ICP D and ICP B (MOQ pain).
- "Trade & Logistics" — shipping/documentation, targets ICP A and ICP C.
A topic that doesn't fit any of these cleanly should get whatever label actually describes it.

Do not propose a topic nearly identical to one already in the existing backlog (supplied in the
user message) — the point is genuinely new candidates, not rephrased duplicates.

Respond only via the emit_topic_candidates tool call.
`.trim();
}

export function buildDiscoverUserMessage({ count, pillarFilter, existingTopics }) {
  const parts = [`Propose ${count} new candidate topics${pillarFilter ? ` for the "${pillarFilter}" pillar only` : ''}.`];
  if (existingTopics?.length) {
    parts.push(`Already-covered topics (do not duplicate these):\n${existingTopics.map((t) => `- ${t}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
