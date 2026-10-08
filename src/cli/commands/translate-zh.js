import fs from 'fs';
import path from 'path';
import { runTranslation } from '../../content/runTranslation.js';
import { runLinter } from '../../linter/runLinter.js';
import { captureSlides } from '../../render/captureSlides.js';

/**
 * Produces the Chinese (Douyin) variant of an already-generated run:
 * content-zh.json + story-size (9:16) slides under slides-zh/ + caption-zh.txt.
 *
 * The English claim-safety linter is regex/wordlist-based and does not
 * meaningfully lint Chinese text — it still runs (Latin-script violations
 * like forbidden certification names would be caught) and its report is
 * saved, but it never blocks here: the zh variant is ALWAYS
 * manual-review-before-posting.
 */
export async function produceZhVariant({ runDir, theme, cover, scale = 2, modelOverride }) {
  const outlinePath = path.join(runDir, 'outline.json');
  const contentPath = path.join(runDir, 'content.json');
  if (!fs.existsSync(outlinePath) || !fs.existsSync(contentPath)) {
    throw new Error(`${runDir} does not look like a generate run (missing outline.json/content.json).`);
  }
  const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  console.log('Translating to Simplified Chinese for Douyin ...');
  const contentZh = await runTranslation({ outline, content, modelOverride });
  fs.writeFileSync(path.join(runDir, 'content-zh.json'), JSON.stringify(contentZh, null, 2), 'utf8');

  const lintResult = runLinter(contentZh);
  fs.writeFileSync(
    path.join(runDir, 'zh-lint-report.json'),
    JSON.stringify(
      {
        note: 'English regex linter over Chinese text — advisory only, never blocking. The zh variant always requires human review before posting.',
        blockingFindingsDowngraded: lintResult.blockingFindings,
        warnings: lintResult.warnings,
      },
      null,
      2
    ),
    'utf8'
  );
  const findingCount = lintResult.blockingFindings.length + lintResult.warnings.length;
  if (findingCount) {
    console.warn(`zh linter notes: ${findingCount} finding(s) recorded in zh-lint-report.json (advisory only for the zh variant).`);
  }

  console.log(`Rendering zh variant at ${scale}x (theme: ${theme || 'mill-paper'}, cover: ${cover || '2a'}, size: story) ...`);
  const { pngPaths, overflowWarnings } = await captureSlides(contentZh, runDir, {
    scale,
    theme,
    cover,
    size: 'story',
    slidesSubdir: 'slides-zh',
  });
  if (overflowWarnings.length) {
    console.warn(`${overflowWarnings.length} zh slide(s) overflow the canvas — see warnings above.`);
  }

  const captionLines = [
    `标题 (title, ≤20 chars): ${contentZh.caption.douyinTitle || ''}`,
    '',
    contentZh.caption.primaryText,
    '',
    contentZh.caption.hashtags.join(' '),
    '',
    '--- Douyin (抖音) — no UTM links; post images from slides-zh/ ---',
  ];
  fs.writeFileSync(path.join(runDir, 'caption-zh.txt'), captionLines.join('\n'), 'utf8');

  console.log(`zh variant done: ${pngPaths.length} slide(s) in ${path.join(runDir, 'slides-zh')}, caption-zh.txt written.`);
  console.log('Reminder: the Chinese copy is machine-translated from approved English — review before posting.');
  return { pngPaths, contentZh };
}

/** `carousel translate-zh --run-id <id>` — CLI wrapper around produceZhVariant.
 *  Theme and cover default to what the original run recorded in
 *  run-meta.json, so the zh variant matches the English post it mirrors. */
export async function translateZhCommand(opts) {
  const runDir = path.resolve('output', opts.runId);
  let runMeta = {};
  const runMetaPath = path.join(runDir, 'run-meta.json');
  if (fs.existsSync(runMetaPath)) {
    runMeta = JSON.parse(fs.readFileSync(runMetaPath, 'utf8'));
  }
  await produceZhVariant({
    runDir,
    theme: opts.theme || runMeta.theme,
    cover: runMeta.cover || undefined,
    scale: opts.scale,
    modelOverride: opts.model,
  });
}
