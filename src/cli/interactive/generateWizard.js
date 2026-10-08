import { select, input, confirm, number } from '@inquirer/prompts';
import { loadSeedTopics } from '../../topics/resolveTopic.js';
import { appendTopicToBacklog } from '../../topics/backlogWriter.js';
import { runDiscovery } from '../../content/runDiscovery.js';
import { fetchBlogSource } from '../../content/fetchBlogSource.js';
import { tokens } from '../../render/tokens.js';

async function pickFromBacklog() {
  const topics = loadSeedTopics();
  if (!topics.length) {
    console.log('Backlog is empty — falling back to an ad-hoc topic.');
    return pickAdHoc();
  }
  const id = await select({
    message: 'Pick a topic from the backlog:',
    choices: topics.map((t) => ({ name: `${t.topic}  [${t.pillar}]`, value: t.id })),
  });
  return { topicId: id };
}

async function pickAdHoc() {
  const topic = await input({ message: 'Topic (ad-hoc):', validate: (v) => v.trim().length > 0 || 'Required.' });
  const pillar = await input({
    message: 'Content pillar/angle hint (optional — press enter to let the Planner decide):',
  });
  return { topic, pillar: pillar || undefined };
}

async function pickFromUrl() {
  const url = await input({
    message: 'Blog post URL:',
    validate: (v) => {
      try {
        const u = new URL(v.trim());
        return ['http:', 'https:'].includes(u.protocol) || 'Must be an http(s) URL.';
      } catch {
        return 'Not a valid URL.';
      }
    },
  });

  console.log('Fetching the article ...');
  let source;
  try {
    source = await fetchBlogSource(url.trim());
  } catch (err) {
    console.log(`Could not read that page: ${err.message}`);
    const retry = await confirm({ message: 'Try another URL?', default: true });
    return retry ? pickFromUrl() : pickAdHoc();
  }
  console.log(`Article: "${source.title}" (${source.text.length} chars extracted${source.truncated ? ', truncated' : ''})`);

  const useTitle = await confirm({ message: 'Use the article title as the carousel topic?', default: true });
  const topic = useTitle
    ? undefined
    : await input({ message: 'Topic to use instead:', validate: (v) => v.trim().length > 0 || 'Required.' });
  const pillar = await input({
    message: 'Content pillar/angle hint (optional — press enter to let the Planner decide):',
  });

  // prefetchedBlogSource hands the already-fetched article to generateCommand
  // so the page isn't fetched a second time.
  return { url: source.url, topic, pillar: pillar || undefined, prefetchedBlogSource: source };
}

async function pickViaDiscovery() {
  const count = await number({ message: 'How many candidates to generate?', default: 5 });
  const pillar = await input({
    message: 'Restrict to one pillar/angle (optional — press enter for any):',
  });

  console.log('Discovering candidates ...');
  const existingTopics = loadSeedTopics().map((t) => t.topic);
  const candidates = await runDiscovery({ count: count || 5, pillarFilter: pillar, existingTopics });

  if (!candidates.length) {
    console.log('No candidates came back — falling back to an ad-hoc topic.');
    return pickAdHoc();
  }

  const chosen = await select({
    message: 'Pick one:',
    choices: [
      ...candidates.map((c, i) => ({
        name: `${c.topic}\n     targets: ${c.icpTarget}\n     why: ${c.rationale}`,
        value: i,
      })),
      { name: 'None of these — enter an ad-hoc topic instead', value: -1 },
    ],
  });
  if (chosen === -1) return pickAdHoc();

  const picked = candidates[chosen];
  const save = await confirm({ message: 'Save this to the backlog for next time?', default: true });
  if (save) {
    const id = appendTopicToBacklog({ topic: picked.topic, pillar: picked.pillar, notes: picked.rationale });
    return { topicId: id };
  }
  return { topic: picked.topic, pillar: picked.pillar };
}

/** Runs when `generate` is invoked with no --topic-id and no --topic — walks
 *  through every decision the flag-based invocation would otherwise require,
 *  and returns an opts object shaped exactly like commander's parsed options
 *  so generateCommand() doesn't need to know which path produced them. */
export async function runGenerateWizard(baseOpts) {
  const topicSource = await select({
    message: 'How do you want to pick a topic?',
    choices: [
      { name: 'Pick from the backlog', value: 'backlog' },
      { name: 'Enter an ad-hoc topic', value: 'adhoc' },
      { name: 'Paste a blog post URL — read the article and build the deck from it', value: 'url' },
      { name: 'Discover new ICP-targeted candidates', value: 'discover' },
    ],
  });

  const topicAnswers =
    topicSource === 'backlog'
      ? await pickFromBacklog()
      : topicSource === 'adhoc'
        ? await pickAdHoc()
        : topicSource === 'url'
          ? await pickFromUrl()
          : await pickViaDiscovery();

  const format = await select({
    message: 'Output format:',
    choices: [
      { name: 'Carousel (multi-slide)', value: 'carousel' },
      { name: 'Single image (one standalone post)', value: 'single' },
    ],
    default: 'carousel',
  });

  const theme = await select({
    message: 'Visual theme:',
    choices: [
      { name: 'Mill Paper — premium editorial (serif display, hairline ledger rules). The branded default', value: 'mill-paper' },
      { name: 'Spec Sheet — raw-material trade document (mono doc codes, framed grid). Best for spec/QA/data topics', value: 'spec-sheet' },
      { name: 'Grove — warm & human (pills, rounded cards, seed dots). Best for origin/people stories', value: 'grove' },
      { name: '[legacy] Ledger — the previous export-document look', value: 'ledger' },
      { name: '[legacy] Certificate — COA-style formality', value: 'certificate' },
      { name: '[legacy] Mill — industrial spec-sheet', value: 'mill' },
      { name: '[legacy] Harvest — olive-led editorial', value: 'harvest' },
    ],
    default: 'mill-paper',
  });

  const cover = await select({
    message: 'Cover treatment (branded themes only):',
    choices: [
      { name: 'Follow the grid rotation (recommended — keeps the profile-grid pattern intact)', value: undefined },
      { name: '2a — deep green field (override, does not advance the rotation)', value: '2a' },
      { name: '2b — terracotta field (override)', value: '2b' },
      { name: '2c — cream with the giant emblem signature (override)', value: '2c' },
    ],
    default: undefined,
  });

  const accent = await select({
    message: 'Accent color:',
    choices: tokens.color.accentOptions.map((hex) => ({ name: hex, value: hex })),
    default: tokens.color.accentDefault,
  });

  const sizes = await select({
    message: 'Canvas sizes to export:',
    choices: [
      { name: 'Portrait (4:5) — feed-optimal on Instagram/Facebook; LinkedIn takes the PDF (recommended)', value: 'portrait' },
      { name: 'Portrait + Square', value: 'portrait,square' },
      { name: 'Portrait + Story (9:16 for TikTok)', value: 'portrait,story' },
      { name: 'All three — portrait + square + story', value: 'portrait,square,story' },
    ],
    default: 'portrait',
  });

  const zh = await confirm({
    message: 'Also produce a Chinese (Douyin) variant? Translated copy + 9:16 slides — extra API call, review before posting.',
    default: false,
  });

  const scale = await select({
    message: 'Export density:',
    choices: [
      { name: '2x (2160px wide, standard)', value: 2 },
      { name: '3x (3240px wide, extra sharp)', value: 3 },
    ],
    default: 2,
  });

  // A URL-sourced run is already grounded in the fetched article — asking for
  // a source file on top of it would just be overridden by the article anyway.
  let sourceDoc;
  if (!topicAnswers.url) {
    const useSourceDoc = await confirm({ message: 'Ground the copy in an existing source file?', default: false });
    sourceDoc = useSourceDoc ? await input({ message: 'Path to the source file:' }) : undefined;
  }

  const dryRun = await confirm({ message: 'Dry run only (plan + write + critique, skip render)?', default: false });

  const proceed = await confirm({
    message: 'Proceed? This calls the API for planning, writing, and critique.',
    default: true,
  });
  if (!proceed) {
    console.log('Cancelled.');
    process.exit(0);
  }

  return {
    ...baseOpts,
    ...topicAnswers,
    format,
    theme,
    cover,
    accent,
    sizes,
    zh,
    scale,
    sourceDoc,
    dryRun,
  };
}
