#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { renderCommand } from '../src/cli/commands/render.js';
import { generateCommand } from '../src/cli/commands/generate.js';
import { listTopicsCommand } from '../src/cli/commands/list-topics.js';
import { logOutcomeCommand } from '../src/cli/commands/log-outcome.js';
import { discoverTopicsCommand } from '../src/cli/commands/discover-topics.js';
import { translateZhCommand } from '../src/cli/commands/translate-zh.js';
import { previewMatrixCommand } from '../src/cli/commands/preview-matrix.js';
import { runGenerateWizard } from '../src/cli/interactive/generateWizard.js';

// Node doesn't read .env automatically — load it explicitly, from this
// project's own root (not the caller's cwd, so `carousel` works the same
// whether run from inside social-carousel/ or, after `npm link`, from
// anywhere else). Missing .env is fine for `render`/`list-topics`, which
// don't need an API key — only fail loudly when a key is actually missing.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const program = new Command();

program
  .name('carousel')
  .description('RM Psyllium social carousel automation — topic to branded slides/caption.');

program
  .command('generate')
  .description('Full pipeline: plan -> write -> critique -> lint -> render. Requires an API key.')
  .option('--topic-id <id>', 'look up a topic in the seed backlog (see "carousel list-topics")')
  .option('--topic <text>', 'ad-hoc topic override')
  .option('--url <blog-url>', 'blog post URL to build the deck from: the article title becomes the topic (unless --topic overrides) and the article text grounds both planning and writing')
  .option('--pillar <text>', 'optional content-angle steer for the Planner (e.g. "Technical Authority") — omit to let it decide')
  .option('--format <format>', 'carousel | single', 'carousel')
  .option('--accent <hex>', 'accent color override (legacy themes only), default the brand copper (#B8753A)')
  .option('--theme <name>', 'visual theme: mill-paper | spec-sheet | grove (branded), or legacy: ledger | certificate | mill | harvest', 'mill-paper')
  .option('--cover <id>', 'cover treatment override: 2a (green) | 2b (terracotta) | 2c (cream signature). Omit to follow the grid rotation (recommended); an override never advances the rotation')
  .option('--sizes <list>', 'comma-separated canvas sizes: portrait (4:5, IG/FB feed + LinkedIn PDF, default) | square (1:1) | story (9:16, TikTok/Douyin)', 'portrait')
  .option('--scale <n>', 'device pixel ratio (2 or 3)', (v) => parseInt(v, 10), 2)
  .option('--source-doc <path>', 'optional fact-source file for the Writer to prefer over cold research')
  .option('--photo <path>', 'background-removed product cutout (png/jpg/webp) for the cover hero; omit for the botanical line art')
  .option('--model <id>', 'override the model for all three LLM stages at once')
  .option('--zh', 'also produce a Chinese (Douyin) variant: translated copy + story-size slides')
  .option('--dry-run', 'plan + write + critique + lint, skip rendering')
  .option('--skip-lint-block', 'proceed past blocking linter findings (still recorded in lint-report.json)')
  .action(async (opts) => {
    try {
      // No --topic-id, no --topic, and no --url means the caller gave no way
      // to identify a topic at all — that's the signal to walk through it
      // interactively instead of failing with "provide either --topic-id or
      // --topic". Scripted/automated invocations always pass one of the
      // three, so they never see the wizard.
      const finalOpts = !opts.topicId && !opts.topic && !opts.url ? await runGenerateWizard(opts) : opts;
      await generateCommand(finalOpts);
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        console.log('\nCancelled.');
        return;
      }
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('render')
  .description('Render an existing content.json to PNGs + PDF. No API key needed.')
  .requiredOption('--input <path>', 'path to a content.json (fixture or a prior run\'s output)')
  .option('--out <dir>', 'output directory (default: output/<date>_<topic-slug>/)')
  .option('--theme <name>', 'visual theme: mill-paper | spec-sheet | grove (branded), or legacy: ledger | certificate | mill | harvest', 'mill-paper')
  .option('--cover <id>', 'cover treatment: 2a | 2b | 2c (branded themes; render never touches the rotation state)', '2a')
  .option('--size <name>', 'canvas size: portrait (4:5, default) | square (1:1) | story (9:16)', 'portrait')
  .option('--photo <path>', 'background-removed product cutout (png/jpg/webp) for the cover hero; omit for the botanical line art')
  .option('--scale <n>', 'device pixel ratio (2 or 3)', (v) => parseInt(v, 10), 2)
  .action(async (opts) => {
    try {
      await renderCommand(opts);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('preview-matrix')
  .description('Design-system contact sheet: every branded slide type × theme × cover treatment + profile-grid strips, into one index.html. No API key.')
  .option('--out <dir>', 'output directory', 'output/preview-matrix')
  .option('--scale <n>', 'device pixel ratio (1 is plenty for eyeballing)', (v) => parseInt(v, 10), 1)
  .option('--size <name>', 'canvas size: portrait (default) | square | story', 'portrait')
  .action(async (opts) => {
    try {
      await previewMatrixCommand(opts);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('list-topics')
  .description('Print the owner-editable topic backlog (src/topics/seedTopics.json).')
  .action(() => {
    try {
      listTopicsCommand();
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('discover-topics')
  .description('Grounded brainstorm: propose ICP-targeted candidate topics not already in the backlog. Requires an API key.')
  .option('--count <n>', 'how many candidates to propose', '5')
  .option('--pillar <text>', 'restrict candidates to one pillar/angle (free text, e.g. "Sourcing De-risked")')
  .option('--model <id>', 'override the discovery-stage model')
  .option('--append-all', 'save every candidate straight to src/topics/seedTopics.json')
  .action(async (opts) => {
    try {
      await discoverTopicsCommand(opts);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('translate-zh')
  .description('Produce the Chinese (Douyin) variant of a prior run: translated copy + 9:16 slides + caption-zh.txt. Requires an API key.')
  .requiredOption('--run-id <id>', 'the runId from a prior generate run (output/<runId>/)')
  .option('--theme <name>', 'visual theme override; defaults to the theme recorded in the run\'s run-meta.json')
  .option('--scale <n>', 'device pixel ratio (2 or 3)', (v) => parseInt(v, 10), 2)
  .option('--model <id>', 'override the translation-stage model')
  .action(async (opts) => {
    try {
      await translateZhCommand(opts);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program
  .command('log-outcome')
  .description('Append a manual, freeform post-hoc outcome note against a prior run.')
  .requiredOption('--run-id <id>', 'the runId from a prior generate run (output/<runId>/)')
  .requiredOption('--platform <platform>', 'linkedin | instagram | facebook | tiktok')
  .requiredOption('--posted-date <date>', 'YYYY-MM-DD')
  .requiredOption('--note <text>', 'freeform outcome note (impressions, replies, sample requests, etc.)')
  .action((opts) => {
    try {
      logOutcomeCommand(opts);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
