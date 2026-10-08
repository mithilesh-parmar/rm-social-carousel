// Verbatim from docs/psyllium-nutraceutical-content-cluster.md, "Claim-safety
// rules" and "Writing style" sections, plus the approved reference list from
// "References to use". Pasting verbatim (not paraphrasing) means a future
// rule-text edit in that doc is a single find-and-replace across both this
// prompt and the human-readable source of truth — the doc, not this file, is
// authoritative if the two ever drift.

export const CLAIM_SAFETY_RULES = `
1. No RM-specific viscosity/gel-strength numbers. RM stands behind purity %, swell volume, heavy
   metals, microbial, ash, LOD, mesh only. Viscosity taught educationally; pharmacopeial swell
   volume cited generically.
2. Mechanism, not outcome; finished-brand owns every claim. FDA (21 CFR 101.81) and EFSA claims
   are cited as category/regulatory pedigree that enables a BRAND's claim, never as RM
   curing/treating anything. Use hedged language ("may reduce the risk of...", never a bare
   present-tense claim).
3. No certification claims at all — present OR future. Never say RM holds or will hold a cert.
   Compliance is handled only as generic buyer-side guidance ("ask any supplier for a lot-specific
   COA..."). No certified-organic implication. No fabricated stats/clients/volumes.
4. Comparisons: factual, sourced, interpreted, not disparaging. Explain the "so what" — why a
   property is an advantage or drawback and in which context. No fiber is "bad"; every functional
   statement is referenced.
5. Verify every external citation at write time before publishing.
`.trim();

export const WRITING_STYLE_RULES = `
Education first — a new brand owner or curious non-expert can follow it, a formulator still
respects it. Plain language, jargon defined on first use, short sentences, roughly grade 8-10.
Warm, authoritative, concise — no hype. Skimmable. This is a fixed-layout visual template, not free
text, so treat each field's length as a hard budget: headlines should read as one or two lines at
large display size, body copy as two to four lines at body size — do not write paragraphs that
would overflow a 1080x1080 card.
`.trim();

export const APPROVED_REFERENCES = `
- FDA authorized health claim — soluble fiber from psyllium husk & coronary heart disease, 21 CFR
  101.81 (7 g/day soluble fiber model).
- EFSA scientific opinions — Plantago ovata husk: blood cholesterol maintenance; normal bowel
  function; post-prandial glycaemic response.
- USP / EP (Ispaghula Husk) / IP monographs — swell volume/index spec, cited generically (never as
  an RM-specific number).
- McRorie & McKeown, J Acad Nutr Diet 2017 — gel-forming/viscous vs non-viscous/fermentable fiber
  distinction.
Only cite these, or facts drawn from any supplied source article. Do not fabricate a citation.
`.trim();
