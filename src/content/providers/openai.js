import OpenAI from 'openai';

/** GPT via function-calling — same contract as anthropic.js: forced tool call,
 *  already-parsed JSON out, no free-text parsing. */
export async function generateStructured({ apiKey, model, system, userMessage, toolName, toolDescription, schema }) {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: toolName,
          description: toolDescription,
          parameters: schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: toolName } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error(`OpenAI response had no tool call for "${toolName}". Finish reason: ${response.choices[0]?.finish_reason}`);
  }
  return JSON.parse(toolCall.function.arguments);
}
