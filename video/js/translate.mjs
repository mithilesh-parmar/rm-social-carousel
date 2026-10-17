#!/usr/bin/env node
// Translation bridge for the Python video module.
//
// Reuses the carousel pipeline's LLM plumbing (src/content/models.js provider/model
// selection + runPipeline.generateValidated tool-use + validate-and-retry loop), so the
// video translator honours the same env vars as `carousel translate-zh`:
// ANTHROPIC_API_KEY (or OPENAI_API_KEY with WRITER_PROVIDER=openai), WRITER_MODEL, ...
//
// stdin : {lang, langName, items:[{id, text}], glossary:[...], rules:[{id, why}], context}
// stdout: {items:{id: translated}}
import path from 'path';
import { fileURLToPath } from 'url';
import { getModelsConfig } from '../../src/content/models.js';
import { generateValidated } from '../../src/content/runPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const TOOL = 'emit_video_translation';
const CUE = /\[\[([A-Za-z0-9_-]+)\]\]/g;

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}

function systemPrompt({ lang, langName, glossary, rules, context }) {
  return `
You are localising the narration and on-screen copy of a short vertical explainer video
(Instagram Reels / YouTube Shorts) for RM Psyllium, an Indian psyllium husk mill, into ${langName} (${lang}).
${context ? `Video topic: ${context}\n` : ''}
Each item is one string. Item ids ending in ".say" are SPOKEN narration (a neural TTS voice reads
them); the rest are short ON-SCREEN text (headlines, labels, captions) that must stay short.

Rules:
- Natural, idiomatic ${langName} as a native explainer-video narrator would say it - not word-for-word.
  Keep each narration line about as long (in speaking time) as the English, so the video timing holds.
- On-screen strings: as short as the English or shorter; keep line-break markers " | " if present.
- Keep these terms EXACTLY as written, in Latin script, never transliterated or translated:
  ${glossary.join(', ')}.
- Keep every marker like [[name]] exactly once, placed immediately before the word that carries
  the same meaning as the word it precedes in the English line.
- Keep all numbers and units numerically identical (80%, 250 kg, 1,000 kg, ₹2,917 crore, 2025-26).
  You may write numbers as words in narration where that is how a narrator would say them.
- "{v}" placeholders inside format strings must be kept verbatim.
- Words wrapped in *asterisks* are emphasised on screen: wrap the equivalent word(s) of your
  translation in *asterisks* too (same number of *...* spans). Narration (.say) never has them.
- Do not add, strengthen, or weaken any claim. Never introduce any of the following:
${rules.map((r) => `  * ${r.why}`).join('\n')}
- Hashtags: localise to tags ${langName} viewers actually use; keep the leading #.

Respond only via the ${TOOL} tool call.`.trim();
}

const input = JSON.parse(await readStdin());
const models = getModelsConfig(process.env.VIDEO_TRANSLATE_MODEL);
const props = {};
for (const it of input.items) props[it.id] = { type: 'string', minLength: 1 };
const schema = { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };

const userMessage = [
  `Translate every item into ${input.langName}. Return an object with the same ids.`,
  JSON.stringify(Object.fromEntries(input.items.map((i) => [i.id, i.text])), null, 1),
].join('\n\n');

const result = await generateValidated({
  stageName: `Video translator (${input.lang})`,
  stageConfig: models.writer,
  system: systemPrompt(input),
  userMessage,
  toolName: TOOL,
  toolDescription: 'Emit every translated string, keyed by the same ids.',
  schema,
  validate: (res) => {
    const errors = [];
    for (const it of input.items) {
      const out = res[it.id];
      if (typeof out !== 'string' || !out.trim()) { errors.push(`${it.id}: missing`); continue; }
      const a = [...it.text.matchAll(CUE)].map((m) => m[1]).sort().join(',');
      const b = [...out.matchAll(CUE)].map((m) => m[1]).sort().join(',');
      if (a !== b) errors.push(`${it.id}: cue markers must be exactly [${a}] (got [${b}])`);
      for (const g of input.glossary) {
        if (it.text.includes(g) && !out.toLowerCase().includes(g.toLowerCase())) errors.push(`${it.id}: keep "${g}" verbatim`);
      }
      if (it.text.includes('{v}') && !out.includes('{v}')) errors.push(`${it.id}: keep the {v} placeholder`);
      const stars = (x) => (x.match(/\*/g) || []).length;
      if (stars(it.text) !== stars(out)) errors.push(`${it.id}: needs exactly ${stars(it.text) / 2} *emphasis* span(s)`);
    }
    return { valid: errors.length === 0, errors };
  },
});

process.stdout.write(JSON.stringify({ items: result, model: models.writer.model, provider: models.writer.provider }));
