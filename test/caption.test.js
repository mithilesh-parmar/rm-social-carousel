import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaption, validateCaption, validatePlatformCaptions } from '../src/content/validateSchema.js';
import { rules } from '../src/linter/rules.js';

const GOOD_CAPTION = {
  primaryText: 'Does psyllium husk contain lead? Here is how buyers read the numbers.',
  hashtags: ['#psyllium', '#supplychain', '#qualitycontrol'],
};

test('normalizeCaption: object passes through untouched', () => {
  assert.equal(normalizeCaption(GOOD_CAPTION), GOOD_CAPTION);
});

test('normalizeCaption: JSON-string caption is parsed back to an object', () => {
  const result = normalizeCaption(JSON.stringify(GOOD_CAPTION));
  assert.deepEqual(result, GOOD_CAPTION);
});

test('normalizeCaption: recovers the leading JSON object when raw tool-call markup trails it (the 2026-07-06 production failure)', () => {
  const mangled = JSON.stringify(GOOD_CAPTION) + '\n<parameter name="slides">[{"type":"cover"}]';
  const result = normalizeCaption(mangled);
  assert.deepEqual(result, GOOD_CAPTION);
});

test('normalizeCaption: handles braces inside string values while brace-matching', () => {
  const tricky = { ...GOOD_CAPTION, primaryText: 'Spec sheet says {moisture: 12%} — read it as a ceiling.' };
  const result = normalizeCaption(JSON.stringify(tricky) + 'trailing garbage');
  assert.deepEqual(result, tricky);
});

test('normalizeCaption: non-JSON string passes through for validation to reject', () => {
  const junk = 'not a caption at all';
  assert.equal(normalizeCaption(junk), junk);
});

test('validateCaption: rejects a string caption with a caption-prefixed error', () => {
  const { valid, errors } = validateCaption('still a string');
  assert.equal(valid, false);
  assert.ok(errors[0].startsWith('caption:'), errors[0]);
});

test('validateCaption: rejects missing hashtags', () => {
  const { valid } = validateCaption({ primaryText: 'text only' });
  assert.equal(valid, false);
});

test('validateCaption: accepts a well-formed caption', () => {
  const { valid, errors } = validateCaption(GOOD_CAPTION);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

const GOOD_PLATFORM_CAPTIONS = {
  linkedin: { ...GOOD_CAPTION, pdfTitle: 'Psyllium COA: 6 Numbers Buyers Check' },
  instagram: { primaryText: 'IG text', hashtags: ['#a1', '#b2', '#c3', '#d4', '#e5'] },
  facebook: { primaryText: 'FB text', hashtags: [] },
  tiktok: { primaryText: 'TT text', hashtags: ['#a1', '#b2', '#c3'] },
};

test('validatePlatformCaptions: accepts a well-formed per-platform set', () => {
  const { valid, errors } = validatePlatformCaptions(GOOD_PLATFORM_CAPTIONS);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('validatePlatformCaptions: rejects a missing platform and an over-50-char pdfTitle', () => {
  const { linkedin, ...missingOne } = GOOD_PLATFORM_CAPTIONS;
  assert.equal(validatePlatformCaptions(missingOne).valid, false);

  const longTitle = {
    ...GOOD_PLATFORM_CAPTIONS,
    linkedin: { ...GOOD_PLATFORM_CAPTIONS.linkedin, pdfTitle: 'x'.repeat(51) },
  };
  assert.equal(validatePlatformCaptions(longTitle).valid, false);
});

test('natural-voice linter rule: flags AI-slop phrases, overconfidence, and exclamation marks', () => {
  const rule = rules.find((r) => r.id === 'natural-voice');
  const findings = rule.test({
    slides: [
      { type: 'cover', headline: "It's not just fiber — it's a game-changer!", subhead: 'Our psyllium is guaranteed to unlock seamless results.' },
    ],
  });
  const messages = findings.map((f) => f.message).join(' | ');
  assert.ok(findings.length >= 4, messages);
  assert.ok(/game.changer|it's not just/i.test(messages), messages);
  assert.ok(/guaranteed/i.test(messages), messages);
  assert.ok(/Exclamation/i.test(messages), messages);
});

test('natural-voice linter rule: clean trade copy passes', () => {
  const rule = rules.find((r) => r.id === 'natural-voice');
  const findings = rule.test({
    slides: [
      { type: 'cover', headline: 'How to read a psyllium COA', subhead: 'Six numbers your QA team checks before a PO.' },
    ],
  });
  assert.deepEqual(findings, []);
});
