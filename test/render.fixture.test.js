import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { captureSlides } from '../src/render/captureSlides.js';
import { buildPdf } from '../src/render/buildPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

function tmpOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rmp-render-test-'));
}

test('render pipeline: 7-slide fixture produces 7 PNGs at 2x density + an 8-page-free valid PDF', async () => {
  const content = loadFixture('qa-audit-checklist-7slide.json');
  const outDir = tmpOutDir();
  const { pngPaths } = await captureSlides(content, outDir, { scale: 2 });

  assert.equal(pngPaths.length, 7);
  for (const p of pngPaths) {
    assert.ok(fs.existsSync(p), `missing ${p}`);
    const { width, height } = readPngDimensions(p);
    assert.equal(width, 2160);
    assert.equal(height, 2160);
  }

  const pdfPath = path.join(outDir, 'deck.pdf');
  await buildPdf(pngPaths, pdfPath);
  const pdfBytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(pdfBytes);
  assert.equal(doc.getPageCount(), 7);

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('render pipeline: single-slide fixture renders one PNG (PDF assembly is the caller\'s call, not forced here)', async () => {
  const content = loadFixture('single-highlight-sample.json');
  const outDir = tmpOutDir();
  const { pngPaths } = await captureSlides(content, outDir, { scale: 2 });

  assert.equal(pngPaths.length, 1);
  const { width, height } = readPngDimensions(pngPaths[0]);
  assert.equal(width, 2160);
  assert.equal(height, 2160);

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('render pipeline: benefit-grid fixture renders icon SVGs inline without error', async () => {
  const content = loadFixture('benefit-grid-sample.json');
  const outDir = tmpOutDir();
  const { pngPaths } = await captureSlides(content, outDir, { scale: 2 });

  assert.equal(pngPaths.length, 3);
  for (const p of pngPaths) {
    const { width, height } = readPngDimensions(p);
    assert.equal(width, 2160);
    assert.equal(height, 2160);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('overflow regression: verdict-list/decision-map at maximum schema field lengths (5 rows each) produce no overflow warning', async () => {
  const content = loadFixture('overflow-stress-test.json');
  const outDir = tmpOutDir();
  const { pngPaths, overflowWarnings } = await captureSlides(content, outDir, { scale: 2 });

  assert.equal(pngPaths.length, 3);
  assert.deepEqual(overflowWarnings, [], JSON.stringify(overflowWarnings));

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('overflow detector actually fires on genuinely too-tall content (proves the check itself works, not just silent)', async () => {
  // 10 rows deliberately exceeds verdictListSchema's maxItems:5 — fine here
  // since this test calls captureSlides directly (bypassing Writer/ajv
  // validation) specifically to prove the render-time detector itself
  // works, independent of whatever the schema does or doesn't catch.
  const content = {
    meta: { topic: 'x', pillar: 'x', accentColor: '#C1633A' },
    slides: [
      {
        type: 'verdict-list',
        kicker: 'k',
        headline: 'Ten rows, guaranteed to overflow the canvas',
        subhead: 'This is not a realistic deck — it exists only to prove the overflow detector fires.',
        rows: Array.from({ length: 10 }, (_, i) => ({
          num: String(i + 1).padStart(2, '0'),
          name: `Row ${i + 1}`,
          rule: 'This rule is exactly at the schema maxLength of eighty characters total.',
        })),
      },
    ],
  };
  const outDir = tmpOutDir();
  const { overflowWarnings } = await captureSlides(content, outDir, { scale: 2 });

  assert.ok(overflowWarnings.length > 0, 'expected the overflow detector to fire for 10 rows on a 1080px canvas');
  assert.equal(overflowWarnings[0].slideType, 'verdict-list');

  fs.rmSync(outDir, { recursive: true, force: true });
});

/** Reads width/height straight out of the PNG IHDR chunk (bytes 16-23) —
 *  avoids adding an image-metadata dependency just for a dimension check. */
function readPngDimensions(pngPath) {
  const buf = fs.readFileSync(pngPath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
