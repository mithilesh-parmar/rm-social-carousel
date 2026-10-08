import { loadSeedTopics } from '../../topics/resolveTopic.js';

export function listTopicsCommand() {
  const topics = loadSeedTopics();
  console.log(`${topics.length} topic(s) in src/topics/seedTopics.json:\n`);
  topics.forEach((t) => {
    console.log(`${t.id}`);
    console.log(`  topic:  ${t.topic}`);
    console.log(`  pillar: ${t.pillar}`);
    if (t.sourceDoc) console.log(`  source: ${t.sourceDoc}`);
    if (t.notes) console.log(`  notes:  ${t.notes}`);
    console.log('');
  });
}
