import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { PDFDocument } from 'pdf-lib';

/** Converts one PNG to a single-page PDF with macOS's built-in `sips`
 *  (Scriptable Image Processing System). Returns null when sips is missing
 *  or fails, so the caller can fall back to raw PNG embedding. Why bother:
 *  sips writes JPEG-compressed PDF pages, typically several times smaller
 *  than a pdf-lib raw-PNG embed — which matters for LinkedIn document
 *  uploads. */
function sipsPngToPdf(pngPath, tmpDir, index) {
  const outPath = path.join(tmpDir, `page-${index}.pdf`);
  try {
    execFileSync('sips', ['-s', 'format', 'pdf', pngPath, '--out', outPath], { stdio: 'ignore' });
    return fs.existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}

/**
 * Assembles slide PNGs into one PDF, in order, and stamps the metadata Title
 * (LinkedIn shows it on document posts). On macOS each page is converted via
 * the built-in `sips` tool (JPEG-compressed pages, much smaller files) and
 * pdf-lib only merges pages + writes metadata; anywhere sips is unavailable
 * it falls back to embedding the PNGs directly. Skipped by the caller when
 * there's only one slide (a single-image post has no PDF to assemble).
 */
export async function buildPdf(pngPaths, outPath, { title } = {}) {
  const pdf = await PDFDocument.create();

  const tmpDir = process.platform === 'darwin' ? fs.mkdtempSync(path.join(os.tmpdir(), 'rmp-pdf-')) : null;

  try {
    for (const [index, pngPath] of pngPaths.entries()) {
      const pagePdfPath = tmpDir && sipsPngToPdf(pngPath, tmpDir, index);
      if (pagePdfPath) {
        const pageDoc = await PDFDocument.load(fs.readFileSync(pagePdfPath));
        const [page] = await pdf.copyPages(pageDoc, [0]);
        pdf.addPage(page);
      } else {
        // Non-macOS (or sips failure): embed the PNG directly.
        const image = await pdf.embedPng(fs.readFileSync(pngPath));
        const page = pdf.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
    }
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (title) pdf.setTitle(title);
  pdf.setProducer('RM Psyllium social-carousel');

  const pdfBytes = await pdf.save();
  fs.writeFileSync(outPath, pdfBytes);
  return outPath;
}
