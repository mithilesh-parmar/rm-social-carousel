import { rules } from './rules.js';

/** Runs every rule against a content object (the {meta, slides, caption} shape
 *  produced by the Writer). Block-severity findings should halt the pipeline
 *  before the render step; warn-severity findings are written to lint-report.json
 *  and surfaced in the CLI summary, but never block — everything here is
 *  draft-only anyway, so warnings exist to make sure a human reviewer doesn't
 *  miss something before posting, not to gate an automated publish step. */
export function runLinter(content) {
  const findings = rules.flatMap((rule) => rule.test(content));
  const blockingFindings = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');
  return {
    blocked: blockingFindings.length > 0,
    blockingFindings,
    warnings,
  };
}
