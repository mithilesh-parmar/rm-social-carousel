import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { writeTokensCss, tokensToCss } from './tokens.js';
import { resolveTheme } from './themes.js';
import { coverCssVars, coverWatermarkTag, emblemImgTag, resolveCover } from './covers.js';
import { BOTANICAL_SVG } from './botanical.js';
import { renderTemplate, escapeHtml } from './renderTemplate.js';
import { getSlideType } from '../slideLibrary/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_CSS = path.join(__dirname, 'layout.css');
const BRANDED_CSS = path.join(__dirname, 'branded.css');
const THEMES_CSS_DIR = path.join(__dirname, 'themes');
const FOOTER_INDEX_JS = path.join(__dirname, 'footer-index.js');
const CHROME_JS = path.join(__dirname, 'branded-chrome.js');
// Bundled woff2 fonts (scripts/fetch-fonts.mjs) — deterministic, offline
// capture for the branded family. Legacy templates keep their original
// Google Fonts href untouched.
const FONTS_CSS = path.join(__dirname, '..', '..', 'assets', 'fonts', 'fonts.css');
// Legacy-only: white-on-transparent lockup PNG recolored via CSS mask. The
// branded family never masks — it uses the tinted emblem SVG <img>s from
// covers.js (handoff rule: capture doesn't rasterize masks reliably).
const LOGO_PNG = path.join(__dirname, '..', '..', 'assets', 'logo-white.png');
const logoDataUri = () => 'data:image/png;base64,' + fs.readFileSync(LOGO_PNG).toString('base64');

/** Canvas presets per destination. The layouts are vertical flex columns, so
 *  taller canvases simply give the center-block/list slides more air — no
 *  per-size templates needed.
 *  - square:   1:1, the universal safe format (also the PDF/deck format)
 *  - portrait: 4:5, the feed-optimal size on LinkedIn, Instagram, Facebook
 *  - story:    9:16, TikTok/Douyin photo-mode and stories */
export const SIZE_PRESETS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

const PHOTO_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Legacy cover art slot: a real product cutout photo when supplied,
 *  otherwise the in-house Plantago ovata line illustration. (The branded
 *  cover's mark presence is the emblem watermark instead.) */
function coverArtTag(photoPath) {
  if (photoPath) {
    const ext = path.extname(photoPath).toLowerCase();
    const mime = PHOTO_MIME[ext];
    if (!mime) throw new Error(`--photo must be a .png/.jpg/.webp file (got "${ext}"). Background-removed PNG cutouts look best.`);
    const dataUri = `data:${mime};base64,` + fs.readFileSync(photoPath).toString('base64');
    return `<img class="rmp-cover-art rmp-cover-art--photo" src="${dataUri}" alt="">`;
  }
  return `<div class="rmp-cover-art rmp-cover-art--botanical">${BOTANICAL_SVG}</div>`;
}

/** Accent-word contract: the Writer marks exactly one word/short phrase in a
 *  cover/CTA headline as *accent*; here it becomes the italic accent span.
 *  Everything is escaped BEFORE the span is wrapped, and content with no
 *  marker (every pre-existing fixture) renders plain — so this is opt-in and
 *  backward compatible. */
export function accentHtml(text) {
  const escaped = escapeHtml(String(text));
  return escaped.replace(/\*([^*]+)\*/, '<span class="rmpb-accent">$1</span>').replace(/\*/g, '');
}
export function stripAccentMarkers(text) {
  return String(text).replace(/\*/g, '');
}

/** Branded covers/CTAs step the display size down for long headlines —
 *  deterministic (character count), decided here rather than measured
 *  in-page, so a re-render is always bit-identical. */
function coverHeadlineSizeCss(headline, baseSizePx) {
  const len = stripAccentMarkers(headline || '').length;
  if (len <= 34) return '';
  const factor = len <= 52 ? 0.85 : 0.72;
  return `font-size:${Math.round(baseSizePx * factor)}px;`;
}

/**
 * Renders every slide in `content.slides` to a PNG at `outDir/slides/NN-type.png`.
 * `scale` is the device pixel ratio (2 = 2160x2160, the non-negotiable minimum
 * for print-quality export). `cover` picks the branded cover treatment
 * (2a/2b/2c) — normally supplied by the grid-rotation state, ignored by the
 * legacy family. Returns `{ pngPaths, overflowWarnings }`.
 */
export async function captureSlides(content, outDir, { scale = 2, theme = 'mill-paper', size = 'square', slidesSubdir = 'slides', photo = null, cover = '2a' } = {}) {
  const preset = SIZE_PRESETS[size];
  if (!preset) {
    throw new Error(`Unknown size "${size}". Available sizes: ${Object.keys(SIZE_PRESETS).join(', ')}.`);
  }
  const themeTokens = resolveTheme(theme);
  const family = themeTokens.family;
  if (family === 'branded') resolveCover(cover); // fail fast on a bad --cover
  // Canvas dimensions ride into CSS as --rmp-canvas-width/-height via the
  // same token pipeline as everything else.
  themeTokens.layout = { ...themeTokens.layout, canvasWidth: preset.width, canvasHeight: preset.height };
  // Vertical (story) slides scale type up ~15% (handoff rule: same furniture,
  // bigger voice, more air) — branded family only, so legacy output is
  // untouched.
  if (family === 'branded' && size === 'story') {
    for (const [key, value] of Object.entries(themeTokens.type)) {
      if (typeof value === 'number' && key.endsWith('Size')) {
        themeTokens.type[key] = Math.round(value * 1.15);
      }
    }
  }
  // tokens.css gets the cover-treatment vars appended for branded runs, so
  // cover choice reaches templates as pure data (and the CTA slide can reuse
  // the cover's field color per the handoff rule).
  const tokensCssPath = path.join(__dirname, 'tokens.css');
  if (family === 'branded') {
    fs.writeFileSync(tokensCssPath, tokensToCss(themeTokens) + '\n' + coverCssVars(cover) + '\n', 'utf8');
  } else {
    writeTokensCss(themeTokens);
  }

  const slidesDir = path.join(outDir, slidesSubdir);
  fs.mkdirSync(slidesDir, { recursive: true });

  const total = content.slides.length;
  const logoUri = family === 'legacy' ? logoDataUri() : null;
  const browser = await chromium.launch();
  const pngPaths = [];
  const overflowWarnings = [];

  try {
    for (let index = 0; index < total; index++) {
      const slide = content.slides[index];
      const entry = getSlideType(slide.type, family);
      // Shallow copy: `prepare` is `identity` for most types, so without the
      // copy the accent-stripping below would mutate the caller's content
      // object — and the SECOND render of the same slides (another size,
      // another cover in the preview matrix) would see pre-stripped
      // headlines and lose the accent span.
      const renderData = { ...entry.prepare(slide) };

      // Accent-word contract on display headlines: branded gets the parsed
      // span, both families get a marker-stripped plain headline so stray
      // asterisks never print.
      if (typeof renderData.headline === 'string') {
        renderData._headlineHtml = accentHtml(renderData.headline);
        renderData.headline = stripAccentMarkers(renderData.headline);
      }

      if (family === 'legacy' && (slide.type === 'cover' || slide.type === 'single-highlight')) {
        renderData._coverArtTag = coverArtTag(photo && path.resolve(photo));
      }
      if (family === 'branded') {
        // The action templates append their own arrow glyph — strip any the
        // Writer put at the end of the label so it never doubles.
        if (typeof renderData.ctaLabel === 'string') {
          renderData.ctaLabel = renderData.ctaLabel.replace(/\s*(→|->)\s*$/u, '');
        }
        const treatment = resolveCover(cover);
        const onCream = treatment.field === 'var(--rmp-bg)'; // 2c
        // Cover-field slides: watermark + lockup emblem tinted for the field.
        renderData._watermarkTag = coverWatermarkTag(cover);
        renderData._lockupEmblemTag = emblemImgTag(
          onCream ? 'full' : 'cream',
          'width:34px;',
          'rmpb-lockup__emblem rmpb-cover-lockup-emblem'
        );
        // Interior accents are always on cream.
        renderData._emblemRustTag = emblemImgTag('rust', 'width:32px;');
        // CTA corner accent (Mill Paper's tan emblem moment; an accent mark
        // fully inside the canvas, not a watermark). Other themes have their
        // own furniture (frame/circle), so only mill-paper gets it.
        renderData._ctaEmblemTag =
          theme === 'mill-paper' && slide.type === 'cta'
            ? emblemImgTag(onCream ? 'rust' : 'tan', 'position:absolute;right:72px;bottom:62px;width:124px;opacity:0.3;', 'rmpb-watermark')
            : '';
      }

      let source = fs.readFileSync(entry.templateFile, 'utf8');
      if (family === 'branded') {
        source = source
          .replace('__FONTS_CSS__', 'file://' + FONTS_CSS)
          .replace('__TOKENS_CSS__', 'file://' + tokensCssPath)
          .replace('__BRANDED_CSS__', 'file://' + BRANDED_CSS)
          .replace('__THEME_CSS__', 'file://' + path.join(THEMES_CSS_DIR, `${theme}.css`))
          .replace('__CHROME_JS__', 'file://' + CHROME_JS)
          .replace(/__THEME_NAME__/g, theme)
          .replace(/__COVER_ID__/g, cover);
        // Long cover/CTA headlines step down deterministically.
        if (slide.type === 'cover' || slide.type === 'single-highlight' || slide.type === 'cta') {
          // cover uses the full display size; cta/single-highlight render the
          // rmpb-cta-headline class, whose base is display-size minus 24.
          const base = themeTokens.type.coverDisplaySize - (slide.type === 'cover' ? 0 : 24);
          const sizeCss = coverHeadlineSizeCss(slide.headline, base);
          if (sizeCss) {
            source = source.replace(/class="(rmpb-cover-headline|rmpb-cta-headline)"/, `class="$1" style="${sizeCss}"`);
          }
        }
      } else {
        source = source
          .replace('__GOOGLE_FONTS_HREF__', themeTokens.font.googleFontsHref)
          .replace('__TOKENS_CSS__', 'file://' + tokensCssPath)
          .replace('__LAYOUT_CSS__', 'file://' + LAYOUT_CSS)
          .replace('__FOOTER_INDEX_JS__', 'file://' + FOOTER_INDEX_JS)
          .replace(/__LOGO_DATA_URI__/g, logoUri);
      }
      const html = renderTemplate(source, renderData);

      const tmpHtmlPath = path.join(slidesDir, `_tmp-${index}.html`);
      fs.writeFileSync(tmpHtmlPath, html, 'utf8');

      const page = await browser.newPage({
        viewport: { width: preset.width, height: preset.height },
        deviceScaleFactor: scale,
      });
      // Position/total are read by the shared chrome scripts (page indices,
      // progress indicators) — injected, never authored content, so the same
      // slide JSON works at any deck length or position.
      await page.addInitScript(
        ({ i, t }) => {
          window.__RMP_SLIDE_INDEX__ = i;
          window.__RMP_TOTAL_SLIDES__ = t;
        },
        { i: index, t: total }
      );
      await page.goto('file://' + tmpHtmlPath, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);

      // Defense in depth: schema maxLength is meant to keep Writer copy
      // within the canvas, but nothing stops --skip-lint-block, a hand-edited
      // content.json, or a budget-less field from producing content that's
      // too tall. The slide clips silently (overflow:hidden) — this makes
      // that failure LOUD at the one point it's cheap to detect precisely.
      const overflow = await page.evaluate(() => {
        const slideEl = document.querySelector('.rmp-slide, .rmpb-slide');
        const canvasBottom = slideEl.getBoundingClientRect().bottom;
        let maxBottom = 0;
        // Decorative elements (legacy decor/cover art; branded watermarks and
        // Grove's corner circle) bleed off-edge intentionally and are clipped
        // by overflow:hidden — excluded so only real content warns.
        slideEl.querySelectorAll('*').forEach((el) => {
          if (el.closest('.rmp-decor-circle, .rmp-cover-art, .rmpb-watermark, .rmpb-grove-circle')) return;
          const bottom = el.getBoundingClientRect().bottom;
          if (bottom > maxBottom) maxBottom = bottom;
        });
        return maxBottom - canvasBottom;
      });
      if (overflow > 5) {
        const message = `slide ${index + 1} (${slide.type}) content overflows the canvas by ~${Math.round(overflow)}px — it will be clipped in the exported PNG. Shorten the offending field(s).`;
        console.warn(`WARNING: ${message}`);
        overflowWarnings.push({ slideIndex: index, slideType: slide.type, overflowPx: Math.round(overflow), message });
      }

      const pngPath = path.join(slidesDir, `${String(index + 1).padStart(2, '0')}-${slide.type}.png`);
      await page.screenshot({ path: pngPath });
      await page.close();
      fs.unlinkSync(tmpHtmlPath);

      pngPaths.push(pngPath);
    }
  } finally {
    await browser.close();
  }

  return { pngPaths, overflowWarnings };
}
