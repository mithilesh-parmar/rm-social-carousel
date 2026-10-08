import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_TOPICS_PATH = path.join(__dirname, 'seedTopics.json');

export function loadSeedTopics() {
  return JSON.parse(fs.readFileSync(SEED_TOPICS_PATH, 'utf8'));
}

/** --topic-id looks up the owner-editable backlog; --topic is a full ad-hoc
 *  override. --pillar (either path) is an OPTIONAL steer for the Planner,
 *  not a requirement — the Planner decides the actual pillar/angle itself
 *  (see planPrompt.js) if none is given, or refines the hint if one is. */
export function resolveTopic({ topicId, topic, pillar, sourceDoc }) {
  if (topicId) {
    const seedTopics = loadSeedTopics();
    const entry = seedTopics.find((t) => t.id === topicId);
    if (!entry) {
      throw new Error(`No seed topic with id "${topicId}". Run "carousel list-topics" to see available ids.`);
    }
    return {
      topic: entry.topic,
      pillarHint: pillar || entry.pillar,
      sourceDoc: sourceDoc || entry.sourceDoc,
      targetQueries: entry.targetQueries || [],
    };
  }
  if (topic) {
    return { topic, pillarHint: pillar, sourceDoc, targetQueries: [] };
  }
  throw new Error('Provide either --topic-id <id> or --topic "<ad-hoc topic>".');
}
