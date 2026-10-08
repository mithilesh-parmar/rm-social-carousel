import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateContent, validateOutline } from '../src/content/validateSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

test('QA-audit fixture (7 slides, stat-callout type) validates against per-type schemas', () => {
  const content = loadFixture('qa-audit-checklist-7slide.json');
  const result = validateContent(content);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('comparison fixture (8 slides, full reference grammar) validates against per-type schemas', () => {
  const content = loadFixture('psyllium-vs-inulin-sunfiber-fenugreek-8slide.json');
  const result = validateContent(content);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('single-highlight fixture validates', () => {
  const content = loadFixture('single-highlight-sample.json');
  const result = validateContent(content);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('benefit-grid fixture validates', () => {
  const content = loadFixture('benefit-grid-sample.json');
  const result = validateContent(content);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('benefit-grid rejects an icon name outside the curated set', () => {
  const content = {
    slides: [
      {
        type: 'benefit-grid',
        kicker: 'k',
        headline: 'h',
        items: [
          { icon: 'not-a-real-icon', label: 'a' },
          { icon: 'leaf', label: 'b' },
          { icon: 'heart', label: 'c' },
        ],
      },
    ],
  };
  const result = validateContent(content);
  assert.equal(result.valid, false);
});

test('unknown slide type fails validation loudly', () => {
  const content = { slides: [{ type: 'not-a-real-type', headline: 'x' }] };
  const result = validateContent(content);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('Unknown slide type'));
});

test('a slide missing a required field fails validation', () => {
  const content = {
    slides: [{ type: 'cta', headline: 'h', body: 'b', ctaLabel: 'Request a Free Sample →' }],
  };
  const result = validateContent(content);
  assert.equal(result.valid, false);
});

test('valid outline: cover-first, cta-last, spotlight present for a comparison deck', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'technical-qa-formulation', accentColor: '#C1633A' },
    slides: [
      { type: 'cover', keyPoint: 'intro' },
      { type: 'comparison-table', keyPoint: 'compare fibers' },
      { type: 'spotlight', keyPoint: 'psyllium spotlight' },
      { type: 'cta', keyPoint: 'sample offer' },
    ],
  };
  const result = validateOutline(outline);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('invalid outline: comparison deck missing a spotlight slide', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'technical-qa-formulation', accentColor: '#C1633A' },
    slides: [
      { type: 'cover', keyPoint: 'intro' },
      { type: 'comparison-table', keyPoint: 'compare fibers' },
      { type: 'cta', keyPoint: 'sample offer' },
    ],
  };
  const result = validateOutline(outline);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('spotlight')));
});

test('invalid outline: does not open with cover', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'technical-qa-formulation', accentColor: '#C1633A' },
    slides: [
      { type: 'stat-callout', keyPoint: 'intro' },
      { type: 'cta', keyPoint: 'sample offer' },
    ],
  };
  const result = validateOutline(outline);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('cover')));
});

test('--format single accepts exactly one standalone-capable slide', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'sourcing-derisked', accentColor: '#C1633A' },
    slides: [{ type: 'single-highlight', keyPoint: 'one buyer tip' }],
  };
  const result = validateOutline(outline, { format: 'single' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('--format single rejects more than one slide', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'sourcing-derisked', accentColor: '#C1633A' },
    slides: [
      { type: 'single-highlight', keyPoint: 'one buyer tip' },
      { type: 'cta', keyPoint: 'extra' },
    ],
  };
  const result = validateOutline(outline, { format: 'single' });
  assert.equal(result.valid, false);
});

test('pillar is free text, not a fixed enum — an arbitrary Planner-invented label validates', () => {
  const outline = {
    meta: { topic: 'x', pillar: 'Founder Story: Building the Mill', accentColor: '#C1633A' },
    slides: [
      { type: 'cover', keyPoint: 'intro' },
      { type: 'cta', keyPoint: 'sample offer' },
    ],
  };
  const result = validateOutline(outline);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('pillar still required — an empty pillar fails validation', () => {
  const outline = {
    meta: { topic: 'x', pillar: '', accentColor: '#C1633A' },
    slides: [
      { type: 'cover', keyPoint: 'intro' },
      { type: 'cta', keyPoint: 'sample offer' },
    ],
  };
  const result = validateOutline(outline);
  assert.equal(result.valid, false);
});
