import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const OUTCOMES_LOG = path.join(LOGS_DIR, 'outcomes.jsonl');

/** Manual, freeform, append-only — intentionally NOT a structured metrics
 *  schema. There's no platform-analytics API integration yet (zero existing
 *  social presence to pull from), so forcing a rigid {impressions, likes,...}
 *  shape now would just mean empty fields. A free-text note keyed to a runId
 *  is honest about what v1 actually is: manual instrumentation, not automated
 *  learning. */
export function appendOutcomeLog({ runId, platform, postedDate, note }) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const record = { runId, platform, postedDate, note, loggedAt: new Date().toISOString() };
  fs.appendFileSync(OUTCOMES_LOG, JSON.stringify(record) + '\n', 'utf8');
  return record;
}
