import fs from 'fs';
import path from 'path';
import { runPipeline } from '../../content/runPipeline.js';
import { captureSlides } from '../../render/captureSlides.js';
import { buildPdf } from '../../render/buildPdf.js';
import { resolveTopic } from '../../topics/resolveTopic.js';
import { fetchBlogSource } from '../../content/fetchBlogSource.js';
import { produceZhVariant } from './translate-zh.js';
import { buildUtmLinks } from '../../logging/utm.js';
import { appendRunLog } from '../../logging/runLog.js';
import { resolveRunCover } from '../../rotation/gridRotation.js';
import { themeFamily } from '../../render/themes.js';
import { slugify } from '../../lib/slugify.js';
import { dateStamp } from '../../lib/dateStamp.js';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const DEFAULT_ACCENT = '#B8753A'; // rm-copper, per docs/rm-psyllium-design-system.md

function readSourceMaterial(sourceDoc) {
  if (!sourceDoc) return undefined;
  const literalPath = sourceDoc.split('#')[0];
  const candidates = [path.resolve(literalPath), path.resolve(REPO_ROOT, literalPath)];
  const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!found) {
    console.warn(`Warning: --source-doc "${sourceDoc}" is not a readable file (only plain text/markdown files are auto-loaded; a "src/data/site.ts#slug" reference is not auto-extracted in v1) — continuing without source material.`);
    return undefined;
  }
  return fs.readFileSync(found, 'utf8');
}

function writeAuditFiles({ outDir, blogSource, outline, content, critique, lintResult }) {
  if (blogSource) {
    // Exactly what was extracted from the URL and fed to the pipeline (the
    // page may change or disappear later).
    fs.writeFileSync(
      path.join(outDir, 'source-article.txt'),
      `source url: ${blogSource.url}\ntitle: ${blogSource.title}\ntruncated: ${blogSource.truncated}\n\n${blogSource.text}`,
      'utf8'
    );
  }
  fs.writeFileSync(path.join(outDir, 'outline.json'), JSON.stringify(outline, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify(content, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'critic-report.json'), JSON.stringify(critique, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'lint-report.json'),
    JSON.stringify({ blocked: lintResult.blocked, blockingFindings: lintResult.blockingFindings, warnings: lintResult.warnings }, null, 2),
    'utf8'
  );
}

function printFindingsTable(label, findings) {
  console.log(`\n${label} (${findings.length}):`);
  findings.forEach((f) => {
    console.log(`  [${f.ruleId}] ${f.field}: ${f.message}`);
    console.log(`    "${f.excerpt}"`);
  });
}

export async function generateCommand(opts) {
  // --url: read the linked blog post first — its title can stand in for the
  // topic and its text becomes the source material for Planner + Writer. The
  // wizard prefetches (to confirm the title interactively) and passes the
  // result through, so the page isn't fetched twice.
  let blogSource;
  if (opts.url) {
    blogSource = opts.prefetchedBlogSource;
    if (!blogSource) {
      console.log(`Fetching ${opts.url} ...`);
      blogSource = await fetchBlogSource(opts.url);
    }
    console.log(`Article: "${blogSource.title}" (${blogSource.text.length} chars extracted${blogSource.truncated ? ', truncated' : ''})`);
  }

  const { topic: resolvedTopic, pillarHint, sourceDoc, targetQueries } =
    !opts.topicId && !opts.topic && blogSource
      ? { topic: blogSource.title, pillarHint: opts.pillar, sourceDoc: undefined, targetQueries: [] }
      : resolveTopic({
          topicId: opts.topicId,
          topic: opts.topic,
          pillar: opts.pillar,
          sourceDoc: opts.sourceDoc,
        });
  if (blogSource && sourceDoc) {
    console.warn(`Note: both --url and a source doc ("${sourceDoc}") were given — the fetched article wins as source material.`);
  }
  const sourceMaterial = blogSource ? blogSource.text : readSourceMaterial(sourceDoc);
  const accentColor = opts.accent || DEFAULT_ACCENT;
  const format = opts.format || 'carousel';

  console.log(`Planning "${resolvedTopic}"${pillarHint ? ` (hint: ${pillarHint})` : ''} (--format ${format}) ...`);
  const { outline, content, critique, lintResult, promptVersion, models } = await runPipeline({
    topic: resolvedTopic,
    pillarHint,
    accentColor,
    format,
    sourceMaterial,
    targetQueries,
    modelOverride: opts.model,
  });

  console.log(`Pillar (decided by Planner): ${outline.meta.pillar}`);
  console.log(`Outline: ${outline.slides.length} slide(s) — ${outline.slides.map((s) => s.type).join(' -> ')}`);

  if (critique.findings.length) {
    printFindingsTable('Critic findings', critique.findings.map((f) => ({ ruleId: 'critic', ...f, message: f.concern })));
  }
  if (lintResult.warnings.length) {
    printFindingsTable('Linter warnings', lintResult.warnings);
  }

  const topicSlug = slugify(resolvedTopic);
  const runId = `${dateStamp()}_${topicSlug}`;
  const outDir = path.resolve('output', runId);
  fs.mkdirSync(outDir, { recursive: true });

  // Audit files are written BEFORE the lint-block gate: a blocked run must
  // leave its outline/content/reports on disk so the finding can be inspected,
  // the copy hand-fixed, and the result re-rendered — returning early with
  // nothing written threw the whole (paid) run away.
  writeAuditFiles({ outDir, blogSource, outline, content, critique, lintResult });

  if (lintResult.blocked) {
    printFindingsTable('Linter BLOCKING findings', lintResult.blockingFindings);
    if (!opts.skipLintBlock) {
      console.error(`\nBlocked by the claim-safety linter. The run's audit files are in ${outDir} — fix content.json there and re-render with "carousel render --input ${path.join(outDir, 'content.json')}", or re-run with --skip-lint-block to override (not recommended for real posts).`);
      process.exitCode = 1;
      return;
    }
    console.warn('\n--skip-lint-block set: proceeding despite blocking findings. lint-report.json will still record them.');
  }

  // Cover treatment: the grid rotation decides (and advances one slot for a
  // real run) unless --cover overrides — overrides never touch the rotation,
  // so a one-off special post can't break the profile-grid pattern. Legacy
  // themes ignore the cover entirely; the rotation is not consumed for them.
  // Resolved AFTER the lint gate so a blocked run never advances the rotation.
  const theme = opts.theme || 'mill-paper';
  const isBranded = themeFamily(theme) === 'branded';
  const { cover, source: coverSource } = isBranded
    ? resolveRunCover({ coverOverride: opts.cover, dryRun: Boolean(opts.dryRun), runId })
    : { cover: null, source: 'n/a-legacy-theme' };
  if (isBranded) {
    console.log(`Cover treatment: ${cover} (${coverSource === 'override' ? '--cover override' : `grid rotation${opts.dryRun ? ', peek only' : ''}`})`);
  }

  const utmLinks = buildUtmLinks(topicSlug);
  const utmByPlatform = Object.fromEntries(utmLinks.map((l) => [l.platform, l.url]));
  // One section per platform, each with its own caption and its own UTM link
  // — copy the whole block for the platform you're posting to.
  const captionLines = [];
  for (const platform of ['linkedin', 'instagram', 'facebook', 'tiktok']) {
    // Belt and braces: captions are schema-validated upstream, but a
    // hand-edited content.json or --skip-lint-block rerun shouldn't crash here.
    const cap = content.captions?.[platform];
    if (!cap) continue;
    captionLines.push(`=== ${platform.toUpperCase()} ===`);
    if (platform === 'linkedin' && cap.pdfTitle) {
      captionLines.push(`PDF document title (set when uploading): ${cap.pdfTitle}`);
    }
    captionLines.push('', cap.primaryText || '', '');
    const tags = Array.isArray(cap.hashtags) ? cap.hashtags.join(' ') : '';
    if (tags) captionLines.push(tags, '');
    if (utmByPlatform[platform]) captionLines.push(`link: ${utmByPlatform[platform]}`, '');
  }
  fs.writeFileSync(path.join(outDir, 'caption.txt'), captionLines.join('\n'), 'utf8');

  // One size renders into slides/ (back-compat); multiple sizes each get
  // slides/<size>/ + deck-<size>.pdf. Default is portrait-only (owner call):
  // 4:5 is the feed-optimal size on Instagram and Facebook, and LinkedIn
  // takes the PDF (built from the same portrait pages) — so one size covers
  // all three. square/story remain opt-in.
  const sizes = String(opts.sizes || 'portrait').split(',').map((s) => s.trim()).filter(Boolean);
  const renders = {}; // size -> { pngPaths, pdfPath }
  let overflowWarnings = [];
  if (!opts.dryRun) {
    for (const size of sizes) {
      console.log(`Rendering ${content.slides.length} slide(s) at ${opts.scale}x (theme: ${theme}${isBranded ? `, cover: ${cover}` : ''}, size: ${size}) ...`);
      const slidesSubdir = sizes.length === 1 ? 'slides' : path.join('slides', size);
      const result = await captureSlides(content, outDir, { scale: opts.scale, theme, size, slidesSubdir, photo: opts.photo, cover: cover || undefined });
      let pdfPath = null;
      if (result.pngPaths.length > 1) {
        pdfPath = path.join(outDir, sizes.length === 1 ? 'deck.pdf' : `deck-${size}.pdf`);
        // The LinkedIn pdfTitle becomes the PDF's metadata Title — what
        // LinkedIn displays on the document post.
        await buildPdf(result.pngPaths, pdfPath, { title: content.captions?.linkedin?.pdfTitle || resolvedTopic });
      }
      renders[size] = { pngPaths: result.pngPaths, pdfPath };
      overflowWarnings.push(...result.overflowWarnings.map((w) => ({ ...w, size })));
    }
    if (overflowWarnings.length) {
      console.warn(`\n${overflowWarnings.length} slide(s) have content that overflows the canvas — see warnings above. Shorten the offending fields and re-render.`);
    }
  } else {
    console.log('--dry-run set: skipping render.');
  }

  const runMeta = {
    runId,
    timestamp: new Date().toISOString(),
    topic: resolvedTopic,
    pillar: outline.meta.pillar,
    format,
    theme,
    cover,
    coverSource,
    sizes,
    platformTargets: utmLinks.map((l) => l.platform),
    promptVersion,
    models,
    sourceDoc: sourceDoc || null,
    sourceUrl: blogSource ? blogSource.url : null,
    photo: opts.photo || null,
    targetQueries: targetQueries || [],
    lintBlocked: lintResult.blocked,
    criticFindingCount: critique.findings.length,
    overflowWarnings,
    outputPaths: {
      outline: path.join(outDir, 'outline.json'),
      content: path.join(outDir, 'content.json'),
      criticReport: path.join(outDir, 'critic-report.json'),
      lintReport: path.join(outDir, 'lint-report.json'),
      caption: path.join(outDir, 'caption.txt'),
      ...(blogSource ? { sourceArticle: path.join(outDir, 'source-article.txt') } : {}),
      renders,
    },
  };
  fs.writeFileSync(path.join(outDir, 'run-meta.json'), JSON.stringify(runMeta, null, 2), 'utf8');
  appendRunLog(runMeta);

  // Optional Douyin variant — after the English run is fully written, so a
  // translation failure never takes the English assets down with it.
  if (opts.zh && !opts.dryRun) {
    try {
      await produceZhVariant({ runDir: outDir, theme, cover, scale: opts.scale, modelOverride: opts.model });
    } catch (err) {
      console.error(`zh variant failed (English run is unaffected): ${err.message}`);
      console.error(`Retry later with: carousel translate-zh --run-id ${runId}`);
    }
  }

  console.log(`\nDone. Output: ${outDir}`);
  return outDir;
}
