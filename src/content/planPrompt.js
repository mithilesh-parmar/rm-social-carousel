import { slideRegistry } from '../slideLibrary/registry.js';

// Example angles only — not a closed list the Planner must pick from. These
// exist to calibrate what a good pillar label looks like (a short strategic
// angle, not a topic restatement), drawn from the business's own established
// positioning (docs/linkedin_strategy.md), not invented from nothing.
const EXAMPLE_PILLARS = [
  'Technical Authority (become the citation source procurement/QA teams reach for)',
  'Manufacturing Transparency (pre-launch plant commissioning and buyer trust-building)',
  'Sourcing De-risked (sample-first policy, direct-mill pricing, lead-gen urgency)',
  'Trade & Logistics (export-readiness, shipping terms, documentation)',
];

function libraryDescription(format) {
  return Object.entries(slideRegistry)
    .filter(([type]) => (format === 'single' ? true : type !== 'single-highlight'))
    .map(([type, entry]) => `- "${type}": ${entry.description}`)
    .join('\n');
}

/** Builds the Planner system prompt: decide slide COUNT and TYPE sequence for
 *  this specific topic, from the fixed library — not fixed copy. Also decides
 *  the content pillar/angle itself (a short strategic label, e.g. "Technical
 *  Authority") rather than picking from a hardcoded enum, since forcing every
 *  topic into one of a fixed handful of buckets was fighting topics that
 *  genuinely span or sit outside them. `pillarHint`, if given, is the
 *  owner's optional steer, not a requirement — the Planner can use it,
 *  refine it, or override it if the topic clearly calls for something else. */
export function buildPlanPrompt({ pillarHint, format = 'carousel' }) {
  const structuralRules =
    format === 'single'
      ? `
1. This is a single-image post, not a carousel. The outline must contain EXACTLY ONE slide, of
   type "stat-callout", "spotlight", or "single-highlight" — whichever best fits a standalone post
   with no adjacent-slide context. Prefer "single-highlight" unless the topic is specifically about
   psyllium's own stat/claim (then "spotlight") or a single checklist item (then "stat-callout").
`.trim()
      : `
1. The deck always opens with a "cover" slide and always closes with a "cta" slide.
2. If the topic compares psyllium against any other fiber or ingredient, the outline MUST include
   exactly one "spotlight" slide dedicated to psyllium — this is always about psyllium regardless
   of topic, never a competitor. Competitor fibers get "competitor-card" or "roundup-grid" entries,
   never "spotlight".
3. Any list/table-type slide (verdict-list, comparison-table) whose rows name FIBERS must put
   psyllium first. When the topic is psyllium-internal (husk vs powder, mesh grades, formats),
   rows may be grades/formats/use-cases instead — then no ordering rule applies.
4. Slide count is not fixed — pick however many slides best fit this topic (typically 5-9). A
   simple checklist topic might use several "stat-callout" slides; a multi-fiber comparison should
   use verdict-list, comparison-table, spotlight, competitor-card, and roundup-grid as appropriate.
   Do not pad the deck with slide types that don't fit the topic just to hit a target length.
`.trim();

  return `
You are the content planner for RM Psyllium's social carousel automation. Given a topic, decide how
many slides this specific topic needs and which slide TYPE each one should be, in what order,
choosing only from the fixed slide-type library below. You are not writing any copy yet — only the
structure.

Slide-type library (id: when to use it):
${libraryDescription(format)}

Hard structural rules, non-negotiable:
${structuralRules}

You also decide the content pillar for this run — a short (2-5 word) strategic angle that
captures WHY this topic is being posted, which shapes tone downstream for the writer. This is not a
fixed list you must choose from; invent whatever label actually fits this topic. For calibration,
here is what a good pillar label looks like (from this business's own established positioning) —
treat these as EXAMPLES of the right shape and specificity, not the only valid answers:
${EXAMPLE_PILLARS.map((p) => `- ${p}`).join('\n')}
${pillarHint ? `\nThe owner suggested this angle for this run: "${pillarHint}". Use it if it genuinely fits the topic; refine or replace it if the topic calls for something more specific.` : ''}

Respond only via the emit_outline tool call. Each outline item is { type, keyPoint } where keyPoint
is a one-line brief for the writer (not final copy) — e.g. "cover" -> "intro framing the comparison",
not a headline. meta.pillar is the angle label you decided above.
`.trim();
}

export const PLAN_TOOL_NAME = 'emit_outline';
export const PLAN_TOOL_DESCRIPTION = 'Emit the slide-by-slide outline: an ordered list of {type, keyPoint}.';
