import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { slugify } from '../lib/slugify.js';
import { loadSeedTopics } from './resolveTopic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_TOPICS_PATH = path.join(__dirname, 'seedTopics.json');

/** Appends a discovered candidate to the owner-editable backlog. Kept as an
 *  explicit opt-in action (never automatic) — discovery just proposes,
 *  the human decides what's actually worth adding. */
export function appendTopicToBacklog({ topic, pillar, notes }) {
  const topics = loadSeedTopics();
  const id = slugify(topic);
  if (topics.some((t) => t.id === id)) {
    throw new Error(`A backlog entry with id "${id}" already exists.`);
  }
  topics.push({ id, topic, pillar, notes: notes || '' });
  fs.writeFileSync(SEED_TOPICS_PATH, JSON.stringify(topics, null, 2) + '\n', 'utf8');
  return id;
}
