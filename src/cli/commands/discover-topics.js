import { runDiscovery } from '../../content/runDiscovery.js';
import { loadSeedTopics } from '../../topics/resolveTopic.js';
import { appendTopicToBacklog } from '../../topics/backlogWriter.js';

export async function discoverTopicsCommand(opts) {
  const existingTopics = loadSeedTopics().map((t) => t.topic);
  const count = parseInt(opts.count, 10) || 5;

  console.log(`Discovering ${count} ICP-targeted candidate topic(s)${opts.pillar ? ` for pillar "${opts.pillar}"` : ''} ...`);
  const candidates = await runDiscovery({
    count,
    pillarFilter: opts.pillar,
    existingTopics,
    modelOverride: opts.model,
  });

  candidates.forEach((c, i) => {
    console.log(`\n${i + 1}. ${c.topic}`);
    console.log(`   pillar: ${c.pillar}`);
    console.log(`   targets: ${c.icpTarget}`);
    console.log(`   why: ${c.rationale}`);
  });

  if (opts.appendAll) {
    console.log('\n--append-all set: adding every candidate to the backlog.');
    candidates.forEach((c) => {
      const id = appendTopicToBacklog({ topic: c.topic, pillar: c.pillar, notes: c.rationale });
      console.log(`  added "${id}"`);
    });
  } else {
    console.log('\nNothing added to the backlog. Re-run with --append-all to save all of these, or add manually to src/topics/seedTopics.json.');
  }

  return candidates;
}
