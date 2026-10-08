import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const RUNS_LOG = path.join(LOGS_DIR, 'runs.jsonl');

/** Appends one JSON Lines record per generation run — full structured
 *  metadata (topic, pillar, platform targets, model ids, prompt version,
 *  lint verdict, output paths). This is the "ever-learning" groundwork: no
 *  auto-optimization yet (there's no performance data to learn from), just
 *  making sure every run is reconstructable later once there is. */
export function appendRunLog(record) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(RUNS_LOG, JSON.stringify(record) + '\n', 'utf8');
}
