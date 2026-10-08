import {
  FORBIDDEN_CERTIFICATION_TERMS,
  AI_SLOP_PHRASES,
  OVERCONFIDENCE_TERMS,
  UNHEDGED_OUTCOME_VERBS,
  HEALTH_CONDITION_NOUNS,
  DISPARAGEMENT_TERMS,
  KNOWN_COMPETITOR_FIBERS,
  CITATION_PATTERNS,
  RM_POSSESSIVE_TERMS,
  VISCOSITY_NUMBER_PATTERN,
} from './claimSafetyWordlists.js';

/** Walks every string field in the content object, yielding {path, text} pairs.
 *  Used by every rule below so each one only has to say what it's looking FOR,
 *  not how to find every string in a variable-length, variable-shape deck. */
function collectStrings(content) {
  const out = [];
  function walk(node, path) {
    if (typeof node === 'string') {
      out.push({ path, text: node });
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  }
  walk(content, '');
  return out;
}

function finding(ruleId, severity, field, excerpt, message) {
  return { ruleId, severity, field, excerpt: excerpt.slice(0, 160), message };
}

const noCertificationClaims = {
  id: 'no-certification-claims',
  severity: 'block',
  description: 'No certification/registration body name may appear — matches the forbidden list scripts/certification-check.js enforces site-wide.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      for (const term of FORBIDDEN_CERTIFICATION_TERMS) {
        const re = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (re.test(text)) {
          findings.push(finding('no-certification-claims', 'block', path, text, `Contains forbidden certification term "${term}".`));
        }
      }
    }
    return findings;
  },
};

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

const noRmViscosityNumbers = {
  id: 'no-rm-viscosity-numbers',
  severity: 'block',
  description: 'RM must never claim its own viscosity/gel-strength/swell-volume number — only cite the generic pharmacopeial standard.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      if (!VISCOSITY_NUMBER_PATTERN.test(text)) continue;
      // Sentence-scoped and word-boundary matched: the possessive must be its
      // own word in the SAME sentence as the number. Substring matching over
      // the whole string blocked a real run on 2026-07-13 — "your stirring"
      // contains "our", and a long caption pairs it with a legitimate
      // pharmacopeial "40 ml/g" sentences away.
      for (const sentence of text.split(SENTENCE_SPLIT)) {
        if (!VISCOSITY_NUMBER_PATTERN.test(sentence)) continue;
        const hit = RM_POSSESSIVE_TERMS.find((term) =>
          new RegExp(`\\b${term.replace(/'/g, "['’]")}\\b`, 'i').test(sentence)
        );
        if (hit) {
          findings.push(finding('no-rm-viscosity-numbers', 'block', path, sentence, `RM-possessive language ("${hit}") in the same sentence as a viscosity/gel-strength number.`));
        }
      }
    }
    return findings;
  },
};

/** Structural, not keyword-based — the psyllium-first rule is a layout fact, not
 *  a copy-quality judgment, so it's checked exactly rather than sniffed for.
 *  It only applies when a table's SUBJECT column actually names fibers: an
 *  intra-psyllium deck (husk vs powder, mesh grades, use-cases) legitimately
 *  puts "Powder grade" or "Drink mixes" in row 0 — every row IS psyllium, so
 *  demanding the literal word there blocked real runs on 2026-07-13. */
function rowSubjectsRankFibers(rows, subjectField) {
  const subjects = rows.map((r) => String(r?.[subjectField] || '')).join(' ').toLowerCase();
  return /psyllium/.test(subjects) || KNOWN_COMPETITOR_FIBERS.some((f) => subjects.includes(f));
}

const psylliumFirstStructural = {
  id: 'psyllium-first-structural',
  severity: 'block',
  description: 'Psyllium must be first in any table that ranks fibers, and a dedicated spotlight slide must exist whenever the deck compares fibers.',
  test(content) {
    const findings = [];
    const slides = content.slides || [];
    let hasComparisonSlide = false;
    let hasSpotlight = false;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const path = `slides[${i}]`;
      if (slide.type === 'spotlight') hasSpotlight = true;
      if (slide.type === 'verdict-list' && Array.isArray(slide.rows) && slide.rows.length && rowSubjectsRankFibers(slide.rows, 'name')) {
        hasComparisonSlide = true;
        const first = slide.rows[0];
        if (!first || !/psyllium/i.test(first.name || '')) {
          findings.push(finding('psyllium-first-structural', 'block', `${path}.rows[0]`, JSON.stringify(first), 'First verdict-list row must be psyllium.'));
        }
      }
      if (slide.type === 'comparison-table' && Array.isArray(slide.rows) && slide.rows.length && rowSubjectsRankFibers(slide.rows, 'fiber')) {
        hasComparisonSlide = true;
        const first = slide.rows[0];
        if (!first || !/psyllium/i.test(first.fiber || '')) {
          findings.push(finding('psyllium-first-structural', 'block', `${path}.rows[0]`, JSON.stringify(first), 'First comparison-table row must be psyllium.'));
        } else if (!first.highlight) {
          findings.push(finding('psyllium-first-structural', 'block', `${path}.rows[0].highlight`, String(first.highlight), 'Psyllium row must have highlight: true.'));
        }
      }
      if (slide.type === 'competitor-card') hasComparisonSlide = true;
    }

    if (hasComparisonSlide && !hasSpotlight) {
      findings.push(finding('psyllium-first-structural', 'block', 'slides', '', 'Deck compares fibers but has no dedicated psyllium spotlight slide.'));
    }
    return findings;
  },
};

const ctaIntegrity = {
  id: 'cta-integrity',
  severity: 'block',
  description: 'The closing slide (cta or single-highlight) must always offer a free sample and the export contact address.',
  test(content) {
    const findings = [];
    const slides = content.slides || [];
    const closer = slides[slides.length - 1];
    if (!closer || !['cta', 'single-highlight'].includes(closer.type)) return findings;

    const joined = [closer.headline, closer.body, closer.ctaLabel, closer.contactLine].filter(Boolean).join(' ');
    if (!/export@rmpsyllium\.com/i.test(joined)) {
      findings.push(finding('cta-integrity', 'block', 'slides[last]', joined, 'Closing slide is missing export@rmpsyllium.com.'));
    }
    if (!/sample/i.test(joined)) {
      findings.push(finding('cta-integrity', 'block', 'slides[last]', joined, 'Closing slide is missing a sample offer.'));
    }
    return findings;
  },
};

const unhedgedOutcomeClaims = {
  id: 'unhedged-outcome-claims',
  severity: 'warn',
  description: 'An unhedged treatment/outcome verb applied to a health condition — needs a human read for context.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      const lower = text.toLowerCase();
      const hasVerb = UNHEDGED_OUTCOME_VERBS.some((v) => lower.includes(v));
      const hasCondition = HEALTH_CONDITION_NOUNS.some((c) => lower.includes(c));
      if (hasVerb && hasCondition) {
        findings.push(finding('unhedged-outcome-claims', 'warn', path, text, 'Unhedged outcome verb near a health-condition noun — verify hedged phrasing.'));
      }
    }
    return findings;
  },
};

const disparagementCheck = {
  id: 'disparagement-check',
  severity: 'warn',
  description: '"No fiber is bad" — flag disparaging language near a competitor fiber name.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      const lower = text.toLowerCase();
      const mentionsCompetitor = KNOWN_COMPETITOR_FIBERS.some((f) => lower.includes(f));
      if (!mentionsCompetitor) continue;
      const disparaging = DISPARAGEMENT_TERMS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
      if (disparaging) {
        findings.push(finding('disparagement-check', 'warn', path, text, `Disparaging term "${disparaging}" near a competitor fiber name.`));
      }
    }
    return findings;
  },
};

const externalCitationFlag = {
  id: 'external-citation-flag',
  severity: 'warn',
  description: 'Never blocks — surfaces every citation-shaped claim so it can be verified before posting, per claim-safety rule 5.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      if (CITATION_PATTERNS.some((re) => re.test(text))) {
        findings.push(finding('external-citation-flag', 'warn', path, text, 'References an external authority — verify at write time before posting.'));
      }
    }
    return findings;
  },
};

// rule/need/answer also have hard `maxLength` in their JSON schemas (which
// blocks generation via the Writer's validation retry) — these are a looser
// second check, since the schema alone doesn't cover text pasted in via
// --source-doc or a hand-edited fixture that never went through the Writer.
const CHARACTER_BUDGETS = { headline: 70, body: 240, subhead: 200, rule: 80, need: 45, answer: 30 };

const characterBudget = {
  id: 'character-budget',
  severity: 'warn',
  description: 'Soft length check so obviously overflowing copy is flagged before it breaks the fixed 1080x1080 layout.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      const fieldName = path.split('.').pop().replace(/\[\d+\]$/, '');
      const budget = CHARACTER_BUDGETS[fieldName];
      if (budget && text.length > budget) {
        findings.push(finding('character-budget', 'warn', path, text, `${text.length} chars, over the ${budget}-char budget for "${fieldName}".`));
      }
    }
    return findings;
  },
};

/** Owner directive: the voice is a knowledgeable trade professional talking
 *  to a peer — filler phrases, LLM-signature constructions, hype words, and
 *  absolutes read as machine-written and erode the document-trust brand.
 *  Warn (style, not safety): the Writer prompt bans these outright, this is
 *  the proofreading net for whatever slips through. */
const naturalVoice = {
  id: 'natural-voice',
  severity: 'warn',
  description: 'Flags AI-slop filler phrases, hype vocabulary, overconfident absolutes, and exclamation marks.',
  test(content) {
    const findings = [];
    for (const { path, text } of collectStrings(content)) {
      const lower = text.toLowerCase();
      for (const phrase of AI_SLOP_PHRASES) {
        if (lower.includes(phrase)) {
          findings.push(finding('natural-voice', 'warn', path, text, `AI-slop phrase "${phrase}" — rewrite in plain trade language.`));
        }
      }
      for (const term of OVERCONFIDENCE_TERMS) {
        if (lower.includes(term)) {
          findings.push(finding('natural-voice', 'warn', path, text, `Overconfident absolute "${term}" — hedge honestly or cut.`));
        }
      }
      if (text.includes('!')) {
        findings.push(finding('natural-voice', 'warn', path, text, 'Exclamation mark — the brand voice is measured, not excited.'));
      }
    }
    return findings;
  },
};

export const rules = [
  noCertificationClaims,
  noRmViscosityNumbers,
  psylliumFirstStructural,
  ctaIntegrity,
  unhedgedOutcomeClaims,
  disparagementCheck,
  externalCitationFlag,
  characterBudget,
  naturalVoice,
];
