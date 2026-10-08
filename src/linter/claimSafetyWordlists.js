// Mirrors the certification list scripts/certification-check.js already enforces
// site-wide in the main repo (hidden until GST registration completes). Carousel
// copy should never mention a specific certification/registration body, present
// or future — the Writer's brand-facts list explicitly excludes these too.
export const FORBIDDEN_CERTIFICATION_TERMS = [
  'FSSAI',
  'APEDA',
  'IEC',
  'Spices Board',
  'GMP',
  'ISO',
  'HACCP',
  'Halal',
  'Kosher',
  'NABL',
  'certified',
  'certification',
  'accredited',
];

// Unhedged treatment/outcome verbs applied to a health condition — a warn, not a
// block, since legitimate hedged claim language ("may reduce the risk of...") is
// easy to write correctly and a keyword match alone can't reliably tell the two
// apart. Human review makes the final call.
export const UNHEDGED_OUTCOME_VERBS = ['cures', 'treats', 'prevents', 'eliminates', 'heals', 'guarantees'];
export const HEALTH_CONDITION_NOUNS = ['cholesterol', 'diabetes', 'constipation', 'blood sugar', 'ibs'];

// "No fiber is bad" — docs/psyllium-nutraceutical-content-cluster.md claim-safety
// rule 4. Applied only to sentences mentioning a non-psyllium fiber.
export const DISPARAGEMENT_TERMS = ['bad', 'worse', 'inferior', 'useless', 'avoid', 'dangerous', 'harmful'];
export const KNOWN_COMPETITOR_FIBERS = [
  'sunfiber',
  'phgg',
  'inulin',
  'fos',
  'fenugreek',
  'acacia',
  'gum arabic',
  'pea fiber',
  'oat fiber',
  'wheat dextrin',
  'guar',
  'methylcellulose',
];

// Citation-shaped substrings — never blocks (verification is inherently a human
// action) but guarantees nothing citation-shaped slips past review unnoticed.
export const CITATION_PATTERNS = [/\bFDA\b/, /\bEFSA\b/, /\bUSP\b/, /\bEP\b/, /21\s*CFR/i, /\bJournal\b/i];

// "AI slop" — filler phrases, LLM-signature constructions, and hype words
// that mark copy as machine-written. Owner directive: the voice is a trade
// professional talking to a peer, so any of these is a defect. Warn-level
// (style, not safety), but the Writer prompt bans them outright too.
export const AI_SLOP_PHRASES = [
  'delve',
  'dive into',
  'deep dive',
  'unlock',
  'unleash',
  'elevate your',
  'supercharge',
  'game-changer',
  'game changer',
  'revolutioniz',
  'seamless',
  'effortless',
  'robust solution',
  'cutting-edge',
  'state-of-the-art',
  'best-in-class',
  'world-class',
  'top-notch',
  'leverage the power',
  'harness the power',
  'in today’s fast-paced',
  "in today's fast-paced",
  'in the ever-evolving',
  'ever-changing landscape',
  'navigate the complexities',
  'navigating the landscape',
  'at the end of the day',
  'look no further',
  'the secret weapon',
  'a testament to',
  'boasts',
  'whether you’re a',
  "whether you're a",
  'it’s not just',
  "it's not just",
  'isn’t just about',
  "isn't just about",
  'more than just a',
  'say goodbye to',
  'say hello to',
  'the bottom line?',
  'here’s the kicker',
  "here's the kicker",
  'let that sink in',
];

// Overconfidence markers — absolutes a careful trade professional would not
// write. Overlaps deliberately with claim-safety hedging rules.
export const OVERCONFIDENCE_TERMS = [
  'guaranteed',
  'guarantee',
  'foolproof',
  'zero risk',
  'risk-free',
  'always works',
  'never fails',
  'the only supplier',
  'the best psyllium',
  'unmatched',
  'unrivaled',
  'perfect for every',
  '100% pure', // purity is a graded spec, never an absolute
  '100% safe',
];

// RM-attributed viscosity/gel-strength numbers — the pharmacopeial/category
// number is fine ("USP swell volume exceeds 40 ml/g" describes the standard);
// what's forbidden is RM claiming its OWN number ("our psyllium tests at 45 ml/g").
export const RM_POSSESSIVE_TERMS = ['our', "rm's", 'we deliver', 'we test at', 'we guarantee'];
export const VISCOSITY_NUMBER_PATTERN = /\b\d+(\.\d+)?\s?(cps|mpa|centipoise|ml\/g)\b/i;
