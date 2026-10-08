import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Point the rotation state at a throwaway file BEFORE the module loads, so
// these tests can advance the sequence without touching the real one.
process.env.RMP_ROTATION_STATE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'rmp-rotation-test-')),
  'grid-rotation.json'
);

const { accentHtml, stripAccentMarkers, captureSlides } = await import('../src/render/captureSlides.js');
const { resolveRunCover, readRotationState, ROTATION_STRATEGIES } = await import('../src/rotation/gridRotation.js');
const { validateContent } = await import('../src/content/validateSchema.js');
const { resolveTheme, themeFamily, THEME_NAMES } = await import('../src/render/themes.js');

test('accent contract: *word* becomes the accent span, everything else stays escaped', () => {
  assert.equal(
    accentHtml('without the *guesswork*.'),
    'without the <span class="rmpb-accent">guesswork</span>.'
  );
  // Escaping happens BEFORE the span is wrapped — markup in copy can never
  // reach the page live.
  assert.equal(accentHtml('<b>*x*</b>'), '&lt;b&gt;<span class="rmpb-accent">x</span>&lt;/b&gt;');
  // No marker: plain escaped text (every pre-existing fixture).
  assert.equal(accentHtml('plain headline'), 'plain headline');
  // Only the first marked span counts; stray asterisks are removed.
  assert.equal(accentHtml('*a* and *b*'), '<span class="rmpb-accent">a</span> and b');
  assert.equal(stripAccentMarkers('no *stray* stars'), 'no stray stars');
});

test('question slide type validates: good slide passes, 1-spec slide fails', () => {
  const good = {
    slides: [
      {
        type: 'question',
        num: 1,
        totalInSeries: 5,
        fieldLabel: 'Mesh size / purity',
        headline: 'What mesh size do you need?',
        body: 'Mesh changes behavior in formula.',
        whyItMatters: 'Right specs upfront avoid rework.',
        specs: [
          { label: 'Typical — capsule', value: '40–60 mesh' },
          { label: 'Typical — food', value: '80–100 mesh' },
        ],
      },
    ],
  };
  assert.equal(validateContent(good).valid, true, JSON.stringify(validateContent(good).errors));

  const oneSpec = JSON.parse(JSON.stringify(good));
  oneSpec.slides[0].specs = [{ label: 'x', value: 'y' }];
  assert.equal(validateContent(oneSpec).valid, false);
});

test('grid rotation: default cycle is the reference Grid A; overrides never advance; dry-run peeks', () => {
  assert.deepEqual(ROTATION_STRATEGIES['2a-alternating'], ['2a', '2c', '2a', '2c', '2b', '2a']);

  const seq = [];
  for (let i = 0; i < 6; i++) {
    seq.push(resolveRunCover({ runId: `run-${i}` }).cover);
  }
  assert.deepEqual(seq, ['2a', '2c', '2a', '2c', '2b', '2a']);
  assert.equal(readRotationState().position, 6);

  // Override: honored, sequence untouched.
  const ov = resolveRunCover({ coverOverride: '2b', runId: 'special' });
  assert.deepEqual(ov, { cover: '2b', source: 'override' });
  assert.equal(readRotationState().position, 6);

  // Dry run: peeks the next slot without consuming it.
  const peek = resolveRunCover({ runId: 'dry', dryRun: true });
  assert.equal(peek.source, 'rotation-peek');
  assert.equal(readRotationState().position, 6);

  // Unknown override fails loudly.
  assert.throws(() => resolveRunCover({ coverOverride: '9z', runId: 'x' }));
});

test('theme families: three branded + four legacy, branded packs satisfy the ≥28px body / ≥20px meta non-negotiables', () => {
  assert.deepEqual(
    THEME_NAMES,
    ['mill-paper', 'spec-sheet', 'grove', 'ledger', 'certificate', 'mill', 'harvest']
  );
  for (const name of ['mill-paper', 'spec-sheet', 'grove']) {
    assert.equal(themeFamily(name), 'branded');
    const t = resolveTheme(name);
    assert.ok(t.type.bodySize >= 28, `${name} bodySize ${t.type.bodySize} < 28`);
    assert.ok(t.type.footerSize >= 20, `${name} footerSize ${t.type.footerSize} < 20`);
    assert.ok(t.type.labelSize >= 20, `${name} labelSize ${t.type.labelSize} < 20`);
  }
  assert.equal(themeFamily('ledger'), 'legacy');
});

test('branded render smoke: cover + question render, accent survives a re-render of the same objects', async () => {
  const content = JSON.parse(
    fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fixtures', 'preview-matrix.json'), 'utf8')
  );
  const slides = content.slides.filter((s) => s.type === 'cover' || s.type === 'question');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmp-branded-test-'));

  // Render TWICE with the same objects — regression for the shared-mutation
  // bug where the first render stripped accent markers out of the caller's
  // content and the second render lost the accent span.
  for (const cover of ['2a', '2c']) {
    const { pngPaths, overflowWarnings } = await captureSlides({ ...content, slides }, outDir, {
      scale: 1,
      theme: 'mill-paper',
      size: 'portrait',
      cover,
      slidesSubdir: `slides-${cover}`,
    });
    assert.equal(pngPaths.length, 2);
    assert.deepEqual(overflowWarnings, []);
  }
  assert.equal(slides[0].headline.includes('*'), true, 'accent markers must survive rendering');

  fs.rmSync(outDir, { recursive: true, force: true });
});
