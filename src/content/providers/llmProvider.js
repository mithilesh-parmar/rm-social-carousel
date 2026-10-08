import * as anthropicProvider from './anthropic.js';
import * as openaiProvider from './openai.js';

const PROVIDERS = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

/**
 * Every provider implements one function with this shape:
 *
 *   generateStructured({ apiKey, model, system, userMessage, toolName, toolDescription, schema })
 *     -> Promise<object>   // the parsed structured output, already validated as JSON
 *
 * Swapping the Planner/Writer/Critic between Anthropic and OpenAI (or adding a
 * third provider later) means adding one file here and one entry in this map —
 * runPipeline.js and models.js never need to know which SDK is underneath.
 */
export function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown LLM provider "${name}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}
