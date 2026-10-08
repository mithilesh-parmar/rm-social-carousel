import { appendOutcomeLog } from '../../logging/outcomeLog.js';

export function logOutcomeCommand(opts) {
  const record = appendOutcomeLog({
    runId: opts.runId,
    platform: opts.platform,
    postedDate: opts.postedDate,
    note: opts.note,
  });
  console.log('Logged:', JSON.stringify(record, null, 2));
}
