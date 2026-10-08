import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COVER_IDS } from '../render/covers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Env override exists for tests only, so they never touch the real sequence.
const STATE_PATH =
  process.env.RMP_ROTATION_STATE_PATH || path.join(__dirname, '..', '..', 'state', 'grid-rotation.json');

/**
 * Profile-grid rotation strategies (handoff: "implement as a pipeline-level
 * rule that assigns each post's cover color"). Each strategy is a repeating
 * cycle of cover treatments; the persisted position advances one step per
 * REAL post generated, so the Instagram/LinkedIn grid forms the intended
 * pattern across posts — not per post.
 *
 * Cycles read oldest→newest. Green tile = 2a cover, cream tile = 2c,
 * terracotta = 2b:
 * - 2a-alternating (default): green/cream alternation, terracotta ~1 in 6 —
 *   the reference's Grid A under cover 2a.
 * - 2b-lead: terracotta/cream alternation with a green anchor per cycle.
 * - 2c-quiet: the all-cream quiet signature (emblem crop on every tile).
 *
 * Photo tiles from the reference's photo-led grids are deliberately not in
 * v1 cycles — they enter here once real factory photography exists.
 */
export const ROTATION_STRATEGIES = {
  '2a-alternating': ['2a', '2c', '2a', '2c', '2b', '2a'],
  '2b-lead': ['2b', '2c', '2b', '2c', '2a', '2b'],
  '2c-quiet': ['2c'],
};

const DEFAULT_STATE = { strategy: '2a-alternating', position: 0, history: [] };

export function readRotationState() {
  if (!fs.existsSync(STATE_PATH)) return { ...DEFAULT_STATE };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  if (!ROTATION_STRATEGIES[state.strategy]) {
    throw new Error(
      `state/grid-rotation.json names unknown strategy "${state.strategy}". Available: ${Object.keys(ROTATION_STRATEGIES).join(', ')}.`
    );
  }
  return { ...DEFAULT_STATE, ...state };
}

/** The cover the CURRENT position dictates — read-only, no advance. */
export function peekCover(state = readRotationState()) {
  const cycle = ROTATION_STRATEGIES[state.strategy];
  return cycle[state.position % cycle.length];
}

/** Consume one rotation slot: record the run and move the pointer. Called
 *  ONLY for a real generate (not --dry-run, not render, not an explicit
 *  --cover override), so test renders never corrupt the grid sequence. */
export function advanceRotation(runId, state = readRotationState()) {
  const cover = peekCover(state);
  const next = {
    ...state,
    position: state.position + 1,
    history: [...(state.history || []), { runId, cover, at: new Date().toISOString() }].slice(-60),
  };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return cover;
}

/** Resolve the cover for a run: an explicit override wins (and does NOT
 *  advance the sequence); otherwise the rotation decides. */
export function resolveRunCover({ coverOverride, dryRun = false, runId }) {
  if (coverOverride) {
    if (!COVER_IDS.includes(coverOverride)) {
      throw new Error(`Unknown cover "${coverOverride}". Available: ${COVER_IDS.join(', ')}.`);
    }
    return { cover: coverOverride, source: 'override' };
  }
  const state = readRotationState();
  if (dryRun) return { cover: peekCover(state), source: 'rotation-peek' };
  return { cover: advanceRotation(runId, state), source: 'rotation' };
}
