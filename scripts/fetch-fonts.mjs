#!/usr/bin/env node
/**
 * One-time (re)fetch of the branded design system's webfonts into the repo,
 * so slide capture is fully deterministic and offline: no Google Fonts
 * request at render time, no network flakiness in the middle of a run.
 *
 * Downloads the css2 stylesheet with a modern-Chrome User-Agent (that's what
 * makes Google serve woff2 + unicode-range slices), pulls every referenced
 * woff2 into assets/fonts/files/, and writes assets/fonts/fonts.css with the
 * urls rewritten to relative paths. captureSlides links that file via
 * file:// — Chromium then loads every face from disk.
 *
 * Run `node scripts/fetch-fonts.mjs` again only when adding a family/weight.
 * The output (fonts.css + files/) is committed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FILES_DIR = path.join(FONTS_DIR, 'files');

// Every family any theme (legacy or branded) uses, one URL. Variable-font
// requests (Newsreader, Bricolage) come back as variable woff2 — Chromium
// handles them fine headless.
const FAMILIES = [
  // Branded family — 1a Mill Paper
  'Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700',
  'Archivo:wght@400;500;600;700',
  // 1b Spec Sheet
  'Space+Grotesk:wght@500;700',
  'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400',
  // 1c Grove
  'Bricolage+Grotesque:opsz,wght@12..96,400..700',
  // Legacy family (ledger/certificate/mill/harvest keep rendering offline too)
  'Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  'JetBrains+Mono:wght@500;600;700',
  'Playfair+Display:ital,wght@0,500;0,700;0,800;1,500',
  // CJK fallback for the Douyin variant, all themes
  'Noto+Sans+SC:wght@400;500;700',
];

const CSS2_URL =
  'https://fonts.googleapis.com/css2?' +
  FAMILIES.map((f) => `family=${f}`).join('&') +
  '&display=swap';

// Chrome UA → woff2 with unicode-range subsetting (critical for Noto Sans SC:
// ~100 small slices instead of one enormous file, and the capture page only
// loads the slices its glyphs actually need).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function main() {
  fs.mkdirSync(FILES_DIR, { recursive: true });

  console.log('Fetching stylesheet ...');
  const cssResp = await fetch(CSS2_URL, { headers: { 'User-Agent': UA } });
  if (!cssResp.ok) throw new Error(`css2 request failed: ${cssResp.status}`);
  let css = await cssResp.text();

  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  console.log(`Stylesheet references ${urls.length} font file(s). Downloading ...`);

  let downloaded = 0;
  for (const url of urls) {
    // gstatic paths are unique per face+slice; flatten to one filename.
    const name = url.replace('https://fonts.gstatic.com/', '').replace(/[^a-zA-Z0-9.]+/g, '-');
    const dest = path.join(FILES_DIR, name);
    if (!fs.existsSync(dest)) {
      const resp = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!resp.ok) throw new Error(`font download failed (${resp.status}): ${url}`);
      fs.writeFileSync(dest, Buffer.from(await resp.arrayBuffer()));
      downloaded++;
    }
    css = css.replaceAll(url, `files/${name}`);
  }

  fs.writeFileSync(path.join(FONTS_DIR, 'fonts.css'), css, 'utf8');
  const totalBytes = fs
    .readdirSync(FILES_DIR)
    .reduce((sum, f) => sum + fs.statSync(path.join(FILES_DIR, f)).size, 0);
  console.log(
    `Done: ${downloaded} new file(s), ${urls.length} total, ${(totalBytes / 1024 / 1024).toFixed(1)} MB in assets/fonts/files/. Wrote assets/fonts/fonts.css.`
  );
}

main().catch((err) => {
  console.error('fetch-fonts failed:', err.message);
  process.exitCode = 1;
});
