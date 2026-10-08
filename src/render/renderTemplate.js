import fs from 'fs';

/** Minimal hand-rolled substitution: {{field.path}} scalars (HTML-escaped,
 *  the default since Writer-generated copy is plain text, never markup),
 *  {{{field.path}}} raw/unescaped (only for pre-vetted markup this codebase
 *  generates itself, e.g. inline icon SVGs from icons.js — never for
 *  Writer-authored text), and {{#each list}}...{{/each}} blocks (one level
 *  deep — no slide type needs nested loops). Upgrade to `mustache` if a
 *  future slide type needs nested loops or {{#if}} — not needed yet. */
export function renderTemplate(templateSource, data) {
  let out = templateSource.replace(/{{#each\s+([\w.]+)}}([\s\S]*?){{\/each}}/g, (_match, path, block) => {
    const arr = getPath(data, path);
    if (!Array.isArray(arr)) return '';
    return arr.map((item) => substitute(block, item)).join('');
  });
  out = substitute(out, data);
  return out;
}

export function renderTemplateFile(templatePath, data) {
  const source = fs.readFileSync(templatePath, 'utf8');
  return renderTemplate(source, data);
}

function substitute(str, data) {
  // Raw/unescaped triple-brace first — it fully consumes `{{{x}}}` so the
  // escaped double-brace pass below never sees the leftover braces.
  let out = str.replace(/{{{\s*([\w.@]+)\s*}}}/g, (_match, path) => {
    const val = resolveValue(path, data);
    return val === undefined || val === null ? '' : String(val);
  });
  out = out.replace(/{{\s*([\w.@]+)\s*}}/g, (_match, path) => {
    const val = resolveValue(path, data);
    return val === undefined || val === null ? '' : escapeHtml(String(val));
  });
  return out;
}

function resolveValue(path, data) {
  // `{{.}}` inside an #each block refers to the item itself — needed for
  // arrays of plain strings (e.g. pillTags), not just arrays of objects.
  return path === '.' ? data : getPath(data, path);
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
