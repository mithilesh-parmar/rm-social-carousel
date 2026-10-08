import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { captureSlides } from '../../render/captureSlides.js';
import { BRANDED_THEME_NAMES } from '../../render/themes.js';
import { COVER_IDS, COVER_TREATMENTS } from '../../render/covers.js';
import { ROTATION_STRATEGIES } from '../../rotation/gridRotation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '..', '..', 'fixtures', 'preview-matrix.json');

// Cover-treatment field slides re-render per cover; everything else is
// interior (always cream) and cover-agnostic — rendering interiors once per
// theme keeps the matrix at 3×(interiors + 3×field) pages instead of 3×3×all.
const FIELD_TYPES = new Set(['cover', 'cta', 'single-highlight']);

/**
 * `carousel preview-matrix` — the design-system contact sheet: every branded
 * slide type × every theme, field slides × every cover treatment, plus
 * simulated profile-grid strips per rotation strategy. One page to eyeball
 * the whole system. No API key, does not touch the rotation state.
 */
export async function previewMatrixCommand({ out, scale = 1, size = 'portrait' } = {}) {
  const content = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const outDir = path.resolve(out || 'output/preview-matrix');
  fs.mkdirSync(outDir, { recursive: true });

  const interiorSlides = content.slides.filter((s) => !FIELD_TYPES.has(s.type));
  const fieldSlides = content.slides.filter((s) => FIELD_TYPES.has(s.type));
  const manifest = {}; // theme -> { interiors: [paths], covers: { '2a': [paths] } }

  for (const theme of BRANDED_THEME_NAMES) {
    manifest[theme] = { interiors: [], covers: {} };

    console.log(`[${theme}] rendering ${interiorSlides.length} interior slide(s) ...`);
    const interiors = await captureSlides({ ...content, slides: interiorSlides }, outDir, {
      scale,
      theme,
      size,
      slidesSubdir: path.join(theme, 'interiors'),
    });
    manifest[theme].interiors = interiors.pngPaths.map((p) => path.relative(outDir, p));

    for (const cover of COVER_IDS) {
      console.log(`[${theme}] rendering field slides with cover ${cover} ...`);
      const fields = await captureSlides({ ...content, slides: fieldSlides }, outDir, {
        scale,
        theme,
        size,
        cover,
        slidesSubdir: path.join(theme, `cover-${cover}`),
      });
      manifest[theme].covers[cover] = fields.pngPaths.map((p) => path.relative(outDir, p));
    }
  }

  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, buildIndexHtml(manifest), 'utf8');
  console.log(`\nPreview matrix ready: ${indexPath}`);
  return outDir;
}

function tileLabelFor(cover) {
  return `${cover} — ${COVER_TREATMENTS[cover].name}`;
}

function buildIndexHtml(manifest) {
  const themes = Object.keys(manifest);
  const themeSections = themes
    .map((theme) => {
      const coverRows = Object.entries(manifest[theme].covers)
        .map(
          ([cover, paths]) => `
      <h3>Cover treatment ${tileLabelFor(cover)}</h3>
      <div class="row">${paths.map((p) => `<figure><img src="${p}" loading="lazy"><figcaption>${path.basename(p)}</figcaption></figure>`).join('')}</div>`
        )
        .join('\n');
      const interiors = manifest[theme].interiors
        .map((p) => `<figure><img src="${p}" loading="lazy"><figcaption>${path.basename(p)}</figcaption></figure>`)
        .join('');
      return `
  <section>
    <h2>${theme}</h2>
    ${coverRows}
    <h3>Interiors (always cream, cover-agnostic)</h3>
    <div class="row">${interiors}</div>
  </section>`;
    })
    .join('\n');

  // Simulated profile grid: 6 tiles per strategy (newest post first, like a
  // real profile), center-cropped square from the portrait cover PNGs.
  const gridSections = themes
    .map((theme) => {
      const strips = Object.entries(ROTATION_STRATEGIES)
        .map(([name, cycle]) => {
          const six = Array.from({ length: 6 }, (_, i) => cycle[i % cycle.length]).reverse();
          const tiles = six
            .map((cover) => {
              const coverPng = manifest[theme].covers[cover].find((p) => p.includes('-cover.png'));
              return `<div class="tile"><img src="${coverPng}" loading="lazy"></div>`;
            })
            .join('');
          return `<div class="strip"><div class="stripname">${name}${name === '2a-alternating' ? ' (default)' : ''}</div><div class="grid">${tiles}</div></div>`;
        })
        .join('');
      return `<section><h2>Profile-grid simulation — ${theme}</h2><div class="strips">${strips}</div></section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>RM Psyllium — carousel design-system preview matrix</title>
<style>
  body { margin: 0; padding: 40px; background: #E9E4D8; font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #1C2B21; }
  h1 { font-size: 26px; } h2 { margin-top: 56px; border-top: 2px solid rgba(28,43,33,0.25); padding-top: 24px; text-transform: capitalize; }
  h3 { color: #B9552F; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  figure { margin: 0; }
  figure img { width: 300px; display: block; box-shadow: 0 2px 12px rgba(28,43,33,0.2); }
  figcaption { font-size: 11px; color: #6B7263; padding-top: 6px; }
  .strips { display: flex; gap: 32px; flex-wrap: wrap; }
  .stripname { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #6B7263; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(3, 120px); gap: 4px; background: #fff; padding: 10px; border-radius: 10px; width: fit-content; }
  .tile { width: 120px; height: 120px; overflow: hidden; }
  .tile img { width: 100%; height: 100%; object-fit: cover; object-position: center; }
</style>
</head>
<body>
<h1>RM Psyllium — design-system preview matrix</h1>
<p>Every slide type × every theme; cover/CTA/single × every cover treatment; profile-grid strips per rotation strategy (newest tile top-left).</p>
${themeSections}
${gridSections}
</body>
</html>
`;
}
