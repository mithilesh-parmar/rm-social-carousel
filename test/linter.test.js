import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runLinter } from '../src/linter/runLinter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

function baseContent(overrides = {}) {
  return {
    meta: { topic: 'Test', pillar: 'technical-qa-formulation' },
    slides: [
      { type: 'cover', kicker: 'k', badge: 'b', headline: 'h', subhead: 's', swipeCue: 'sw' },
      {
        type: 'cta',
        headline: 'h',
        body: 'b',
        ctaLabel: 'Request a Free Sample →',
        contactLine: 'export@rmpsyllium.com · Siddhpur, Gujarat, India',
      },
    ],
    ...overrides,
  };
}

test('clean QA-audit fixture produces zero blocking findings', () => {
  const content = loadFixture('qa-audit-checklist-7slide.json');
  const result = runLinter(content);
  assert.equal(result.blocked, false, JSON.stringify(result.blockingFindings));
});

test('clean comparison fixture produces zero blocking findings', () => {
  const content = loadFixture('psyllium-vs-inulin-sunfiber-fenugreek-8slide.json');
  const result = runLinter(content);
  assert.equal(result.blocked, false, JSON.stringify(result.blockingFindings));
});

test('no-certification-claims fires on a forbidden cert term', () => {
  const content = baseContent();
  content.slides[1].body = 'Our facility is GMP certified and FSSAI registered.';
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.ruleId === 'no-certification-claims'));
});

test('no-rm-viscosity-numbers fires on RM-possessive viscosity claim', () => {
  const content = baseContent();
  content.slides[1].body = 'Our psyllium tests at 45 ml/g every time.';
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.ruleId === 'no-rm-viscosity-numbers'));
});

test('no-rm-viscosity-numbers does not fire on generic pharmacopeial numbers', () => {
  const content = baseContent();
  content.slides[1].body = 'The USP standard requires swelling volume above 40 ml/g.';
  const result = runLinter(content);
  assert.equal(result.blockingFindings.some((f) => f.ruleId === 'no-rm-viscosity-numbers'), false);
});

test('no-rm-viscosity-numbers: "your" must not match as "our" (the 2026-07-13 false block)', () => {
  const content = baseContent();
  content.captions = {
    instagram: {
      primaryText:
        "Your psyllium drink mix keeps clumping, and it's not your stirring. One COA number to check: swell volume, typically 40 ml/g or more.",
      hashtags: ['#psyllium'],
    },
  };
  const result = runLinter(content);
  assert.equal(result.blockingFindings.some((f) => f.ruleId === 'no-rm-viscosity-numbers'), false, JSON.stringify(result.blockingFindings));
});

test('no-rm-viscosity-numbers: possessive in a different sentence than the number does not block', () => {
  const content = baseContent();
  content.slides[1].body =
    'Our mill sits in Siddhpur, Gujarat. The pharmacopeial standard specifies swell volume above 40 ml/g.';
  const result = runLinter(content);
  assert.equal(result.blockingFindings.some((f) => f.ruleId === 'no-rm-viscosity-numbers'), false, JSON.stringify(result.blockingFindings));
});

test('no-rm-viscosity-numbers: still fires when the possessive shares a sentence with the number', () => {
  const content = baseContent();
  content.slides[1].body = 'In our lots, swell volume comes in at 45 ml/g.';
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.ruleId === 'no-rm-viscosity-numbers'));
});

test('psyllium-first-structural: intra-psyllium tables (grades/use-cases as rows) do not block (the 2026-07-13 false block)', () => {
  const content = baseContent({
    slides: [
      { type: 'cover', kicker: 'k', badge: 'b', headline: 'h', subhead: 's', swipeCue: 'sw' },
      {
        type: 'comparison-table',
        kicker: 'k',
        headline: 'h',
        columnHeaders: ['a', 'b', 'c', 'd'],
        rows: [
          { fiber: 'Drink mixes / smooth blends', ferm: '80-100 mesh powder', visc: 'Even dispersion, low grit', fit: 'Sieve analysis + glass trial', highlight: true },
          { fiber: 'Capsules / bulk fills', ferm: '40 mesh husk', visc: 'High swell', fit: 'Flow trial', highlight: false },
        ],
      },
      {
        type: 'verdict-list',
        kicker: 'k',
        headline: 'h',
        subhead: 's',
        rows: [
          { num: '01', name: 'Powder grade', rule: '80-100 mesh for most smooth drink mixes' },
          { num: '02', name: 'Husk grade', rule: 'Coarse, for capsule bulk' },
        ],
      },
      { type: 'cta', headline: 'h', body: 'b', ctaLabel: 'Request a Free Sample →', contactLine: 'export@rmpsyllium.com' },
    ],
  });
  const result = runLinter(content);
  assert.equal(result.blockingFindings.some((f) => f.ruleId === 'psyllium-first-structural'), false, JSON.stringify(result.blockingFindings));
});

test('psyllium-first-structural fires when psyllium is not row 0', () => {
  const content = baseContent({
    slides: [
      { type: 'cover', kicker: 'k', badge: 'b', headline: 'h', subhead: 's', swipeCue: 'sw' },
      {
        type: 'verdict-list',
        kicker: 'k',
        headline: 'h',
        subhead: 's',
        rows: [
          { num: '01', name: 'Inulin', rule: 'x' },
          { num: '02', name: 'Psyllium', rule: 'x' },
        ],
      },
      {
        type: 'cta',
        headline: 'h',
        body: 'b',
        ctaLabel: 'Request a Free Sample →',
        contactLine: 'export@rmpsyllium.com',
      },
    ],
  });
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.ruleId === 'psyllium-first-structural'));
});

test('psyllium-first-structural fires when a comparison deck has no spotlight slide', () => {
  const content = baseContent({
    slides: [
      { type: 'cover', kicker: 'k', badge: 'b', headline: 'h', subhead: 's', swipeCue: 'sw' },
      {
        type: 'comparison-table',
        kicker: 'k',
        headline: 'h',
        columnHeaders: ['a', 'b', 'c', 'd'],
        rows: [{ fiber: 'Psyllium', ferm: 'Low', visc: 'High', fit: 'x', highlight: true }],
      },
      {
        type: 'cta',
        headline: 'h',
        body: 'b',
        ctaLabel: 'Request a Free Sample →',
        contactLine: 'export@rmpsyllium.com',
      },
    ],
  });
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.message.includes('no dedicated psyllium spotlight')));
});

test('cta-integrity fires when the closing slide has no sample offer', () => {
  const content = baseContent();
  content.slides[1] = {
    type: 'cta',
    headline: 'Thanks for reading',
    body: 'Get in touch',
    ctaLabel: 'Learn more',
    contactLine: 'not-an-email',
  };
  const result = runLinter(content);
  assert.equal(result.blocked, true);
  assert.ok(result.blockingFindings.some((f) => f.ruleId === 'cta-integrity'));
});

test('unhedged-outcome-claims warns without blocking', () => {
  const content = baseContent();
  content.slides[1].body = 'Psyllium cures constipation for every buyer.';
  const result = runLinter(content);
  assert.equal(result.blocked, false);
  assert.ok(result.warnings.some((f) => f.ruleId === 'unhedged-outcome-claims'));
});

test('disparagement-check warns without blocking', () => {
  const content = baseContent();
  content.slides[1].body = 'Inulin is a bad choice compared to psyllium.';
  const result = runLinter(content);
  assert.equal(result.blocked, false);
  assert.ok(result.warnings.some((f) => f.ruleId === 'disparagement-check'));
});

test('external-citation-flag warns and never blocks', () => {
  const content = baseContent();
  content.slides[1].body = 'FDA guidance under 21 CFR 101.81 covers this claim.';
  const result = runLinter(content);
  assert.equal(result.blocked, false);
  assert.ok(result.warnings.some((f) => f.ruleId === 'external-citation-flag'));
});

test('character-budget warns on an overlong headline', () => {
  const content = baseContent();
  content.slides[1].headline = 'A'.repeat(120);
  const result = runLinter(content);
  assert.equal(result.blocked, false);
  assert.ok(result.warnings.some((f) => f.ruleId === 'character-budget'));
});
