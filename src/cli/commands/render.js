import fs from 'fs';
import path from 'path';
import { captureSlides } from '../../render/captureSlides.js';
import { buildPdf } from '../../render/buildPdf.js';
import { slugify } from '../../lib/slugify.js';
import { dateStamp } from '../../lib/dateStamp.js';

/** Render-only path: takes an existing content.json (fixture or a prior run's
 *  output) and produces slides + PDF. No API key needed — this is the primary
 *  tool for iterating on visual fidelity independent of content generation. */
export async function renderCommand({ input, out, scale, theme, size, photo, cover }) {
  const contentPath = path.resolve(input);
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  if (!Array.isArray(content.slides) || content.slides.length === 0) {
    throw new Error(`${contentPath} has no slides array — nothing to render.`);
  }

  const outDir = out
    ? path.resolve(out)
    : path.resolve(
        'output',
        `${dateStamp()}_${slugify(content.meta?.topic || 'untitled')}`
      );
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(contentPath, path.join(outDir, 'content.json'));

  console.log(`Rendering ${content.slides.length} slide(s) at ${scale}x (theme: ${theme || 'mill-paper'}, size: ${size || 'portrait'}) to ${outDir} ...`);
  const { pngPaths, overflowWarnings } = await captureSlides(content, outDir, { scale, theme, size, photo, cover });
  console.log(`Wrote ${pngPaths.length} PNG(s):`);
  pngPaths.forEach((p) => console.log(`  ${p}`));
  if (overflowWarnings.length) {
    console.warn(`\n${overflowWarnings.length} slide(s) have content that overflows the canvas — see warnings above. Shorten the offending fields and re-render.`);
  }

  if (pngPaths.length > 1) {
    const pdfPath = path.join(outDir, 'deck.pdf');
    await buildPdf(pngPaths, pdfPath);
    console.log(`Wrote PDF: ${pdfPath}`);
  } else {
    console.log('Single slide — skipping PDF assembly.');
  }

  if (content.captions || content.caption) {
    const captionPath = path.join(outDir, 'caption.txt');
    const lines = [];
    if (content.captions) {
      // Per-platform captions (current Writer output shape).
      for (const [platform, cap] of Object.entries(content.captions)) {
        lines.push(`=== ${platform.toUpperCase()} ===`);
        if (cap.pdfTitle) lines.push(`PDF document title (set when uploading): ${cap.pdfTitle}`);
        lines.push('', cap.primaryText || '', '');
        if (Array.isArray(cap.hashtags) && cap.hashtags.length) lines.push(cap.hashtags.join(' '), '');
      }
    } else {
      // Legacy single-caption content.json (old runs, fixtures).
      lines.push(content.caption.primaryText || '', '');
      if (Array.isArray(content.caption.hashtags) && content.caption.hashtags.length) {
        lines.push(content.caption.hashtags.join(' '));
      }
    }
    fs.writeFileSync(captionPath, lines.join('\n'), 'utf8');
    console.log(`Wrote caption: ${captionPath}`);
  }

  return outDir;
}
