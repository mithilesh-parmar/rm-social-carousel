import { getProvider } from './providers/llmProvider.js';
import { getModelsConfig } from './models.js';
import {
  buildDiscoverPrompt,
  buildDiscoverUserMessage,
  DISCOVER_TOOL_NAME,
  DISCOVER_TOOL_DESCRIPTION,
  DISCOVER_SCHEMA,
} from './discoverPrompt.js';

function apiKeyFor(provider) {
  const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(`Missing API key for provider "${provider}" (set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}).`);
  }
  return key;
}

/** One-shot call — not a multi-stage pipeline like generate's plan/write/
 *  critique, just a single grounded brainstorm against the ICP/brand facts
 *  already in the system. See discoverPrompt.js for why this is deliberately
 *  the smaller "v1" version, not a research-backed one. */
export async function runDiscovery({ count = 5, pillarFilter, existingTopics = [], modelOverride } = {}) {
  const models = getModelsConfig(modelOverride);
  const provider = getProvider(models.discovery.provider);

  const result = await provider.generateStructured({
    apiKey: apiKeyFor(models.discovery.provider),
    model: models.discovery.model,
    system: buildDiscoverPrompt(),
    userMessage: buildDiscoverUserMessage({ count, pillarFilter, existingTopics }),
    toolName: DISCOVER_TOOL_NAME,
    toolDescription: DISCOVER_TOOL_DESCRIPTION,
    schema: DISCOVER_SCHEMA,
  });

  return result.candidates;
}
