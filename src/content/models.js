/**
 * Per-stage {provider, model}, each independently overridable via env var.
 * Defaults keep the pipeline usable with only ANTHROPIC_API_KEY set — the
 * "critic on a different model than the writer" idea (recommended in the
 * project plan, to avoid the critic sharing the writer's blind spots) is an
 * easy opt-in via CRITIC_PROVIDER=openai + CRITIC_MODEL=<model>, not a
 * required default, since it needs a second API key to work at all.
 *
 * To point any stage at a cheaper/faster model for dev iteration against
 * fixtures, set e.g. PLANNER_MODEL=claude-haiku-4-5-20251001 — no code change.
 */

const DEFAULT_MODEL = 'claude-sonnet-5';

function stageConfig(prefix, globalOverride) {
  const provider = process.env[`${prefix}_PROVIDER`] || 'anthropic';
  const model = globalOverride || process.env[`${prefix}_MODEL`] || (provider === 'anthropic' ? DEFAULT_MODEL : null);
  if (!model) {
    throw new Error(
      `${prefix}_PROVIDER is set to "${provider}" but ${prefix}_MODEL is not set. ` +
        `Non-default providers require an explicit model id — no guessed default.`
    );
  }
  return { provider, model };
}

/** `modelOverride` is the CLI's --model flag, applied to all stages at once
 *  when passed; per-stage env vars still win for anything --model didn't
 *  touch on a provider that needs its own model id. */
export function getModelsConfig(modelOverride) {
  return {
    planner: stageConfig('PLANNER', modelOverride),
    writer: stageConfig('WRITER', modelOverride),
    critic: stageConfig('CRITIC', modelOverride),
    discovery: stageConfig('DISCOVERY', modelOverride),
  };
}
