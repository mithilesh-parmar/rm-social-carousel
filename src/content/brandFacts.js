// Pulled verbatim/paraphrase-locked from docs/linkedin_strategy.md and
// docs/psyllium-nutraceutical-content-cluster.md in the main repo. This is a
// CLOSED list — the system prompts instruct the model not to invent facts
// beyond it. If the source docs change, update here to match.

export const COMPANY_FACTS = `
- Company: RM Psyllium, a manufacturer of psyllium husk, husk powder, seeds, and khakha powder,
  based in Siddhpur, Gujarat, India. 1,500 MT annual processing capacity for export buyers.
- Plant status: a new processing facility on the Gujarat/Rajasthan border, becoming operational
  around July 2026. Before that date, frame pre-launch content as manufacturing/commissioning
  transparency for buyers — deliberate process engineering, not hiding an unfinished plant. This is
  a B2B export supplier: never use "building in public" or other D2C/founder-journey framing, and
  never surface that phrase as visible copy (kickers, badges, headlines).
- Leadership: the founder's family has 20 years of agricultural seed-processing experience; the
  business partner has 40 years of direct psyllium plant operations management inside Siddhpur's
  largest mills.
- Sample policy: sample-first sourcing. Samples available from 100 g upward depending on what the
  buyer needs to test. Trial order sizes vary by buyer and application (examples run 500 kg to 5 MT)
  — do not state a fixed MOQ.
- Private-label MOQ is not finalized — if asked, say it depends on packaging, printing, artwork,
  pack size, and whether the buyer wants finished retail units or bulk material.
- Pricing: direct-from-mill pricing, no trading-desk or broker markup.
- CTA is always: request a free sample + COA review, contact export@rmpsyllium.com.
`.trim();

export const ICP_FACTS = `
- ICP A — International procurement/sourcing managers (nutraceuticals, dietary supplements, fiber
  brands, gluten-free bakeries, clinical nutrition, pet food): burned by suppliers claiming "high
  purity" that fail moisture/swelling-volume/microbial tests at the destination port. Care about
  lot-level traceability and timely COAs.
- ICP B — Product formulation consultants / R&D chemists: blocked by large mills that refuse
  orders below 5-20 MT. Need small, high-purity or custom-mesh samples for bench trials.
- ICP C — Domestic Indian merchant exporters / trading desks: buy through brokers with no control
  over processing, risking quality rejections at customs. Need a transparent contract-processing
  partner.
- ICP D — Growth-stage SMB/DTC brands: excluded from direct mill supply by high MOQs, forced to
  buy repackaged or marked-up material from distributors.
`.trim();

export const FORBIDDEN_FACTS = `
- Do not name any specific certification or registration body (FSSAI, APEDA, IEC, Spices Board,
  GMP, ISO, HACCP, Halal, Kosher, NABL, or the words "certified"/"certification"/"accredited") —
  these are hidden site-wide until GST registration completes. Compliance language stays generic
  buyer-side guidance ("ask any supplier for a lot-specific COA"), never a claim RM holds a status.
- Do not invent statistics, client names, order volumes, or a fixed MOQ number.
- Do not state an RM-specific viscosity, gel-strength, or swelling-volume number. Only the
  pharmacopeial/category standard (USP/EP) may be cited generically.
`.trim();
