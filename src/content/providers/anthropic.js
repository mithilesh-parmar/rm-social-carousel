import Anthropic from '@anthropic-ai/sdk';

/** Claude via tool-use / structured output — the model must respond with a
 *  single tool call matching `schema`, so the result is already-parsed JSON,
 *  no prose-then-JSON.parse repair loop needed. */
export async function generateStructured({ apiKey, model, system, userMessage, toolName, toolDescription, schema }) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: userMessage }],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: schema,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`Anthropic response had no tool_use block for "${toolName}". Stop reason: ${response.stop_reason}`);
  }
  return toolUse.input;
}
