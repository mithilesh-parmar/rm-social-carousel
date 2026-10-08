// Blog-URL source material: fetch a post, extract the article title + readable
// text, so `generate --url <link>` can plan and write a deck from an existing
// article instead of a cold topic. Plain fetch + tag-stripping only — no
// headless browser, no readability dependency. That covers static/SSR blogs
// (including the RM Psyllium Astro site); a fully JS-rendered page that ships
// an empty <body> will fail loudly with a clear message rather than silently
// producing a deck grounded in nothing.

const MAX_SOURCE_CHARS = 24000; // keeps Planner+Writer prompts bounded on very long posts
const FETCH_TIMEOUT_MS = 20000;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The article's own <h1> first (the full editorial headline — on the RM
 *  Psyllium site, <title>/og:title are SEO-clamped and can end mid-phrase),
 *  then og:title, then <title> with any " | Site" suffix dropped. `scope` is
 *  the article container extractArticle already chose, so a site-logo <h1> in
 *  the page header can't win. */
function extractTitle(html, scope) {
  const h1 = scope.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = stripTags(h1[1]).replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]).trim();

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    const full = stripTags(titleTag[1]);
    // "Post Title | RM Psyllium" -> "Post Title" (keep the full string if the
    // split would leave nothing, e.g. a title that IS just the site name).
    const trimmed = full.split(/\s+[|–—-]\s+/)[0].trim();
    if (trimmed) return trimmed;
    if (full) return full;
  }
  return '';
}

function longestMatch(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let best = null;
  for (const m of html.matchAll(re)) {
    if (!best || m[1].length > best.length) best = m[1];
  }
  return best;
}

/** Pure HTML -> { title, text } extraction, exported separately from the
 *  network fetch so it can be unit-tested on fixtures without hitting the web. */
export function extractArticle(html) {
  let scope = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Prefer the semantic article container (longest one, in case the page also
  // wraps teasers in <article>), then <main>, then the whole <body>.
  scope = longestMatch(scope, 'article') || longestMatch(scope, 'main') || longestMatch(scope, 'body') || scope;

  // Title comes from the PRE-chrome-strip scope: post headlines routinely sit
  // in a <header> inside the article (the RM Psyllium blog does exactly this),
  // and stripping first would delete the h1 we want.
  const title = extractTitle(html, scope);

  // Page chrome inside the chosen scope is noise, not article text.
  scope = scope.replace(/<(nav|header|footer|aside|form|button)[^>]*>[\s\S]*?<\/\1>/gi, '');

  const text = stripTags(
    scope
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<(br|hr)[^>]*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|h[1-6]|li|ul|ol|blockquote|table|tr|figure|figcaption|pre)>/gi, '\n')
  );

  return { title, text };
}

function truncateAtWord(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  const cut = text.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return { text: cut.slice(0, lastBreak > maxChars * 0.8 ? lastBreak : maxChars).trimEnd(), truncated: true };
}

/** Fetches a blog post URL and returns { url, title, text, truncated }.
 *  Throws with an actionable message on anything that would otherwise produce
 *  a deck grounded in nothing (bad URL, non-HTML response, empty extraction). */
export async function fetchBlogSource(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Only http(s) URLs are supported, got "${parsed.protocol}//".`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(parsed, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'rm-psyllium-carousel/0.1 (content tool; owner-operated)' },
    });
  } catch (err) {
    throw new Error(`Could not fetch ${url}: ${err.name === 'AbortError' ? `timed out after ${FETCH_TIMEOUT_MS / 1000}s` : err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new Error(`${url} returned "${contentType}" — expected an HTML page (a PDF or feed URL won't work; link the post itself).`);
  }

  const html = await res.text();
  const { title, text } = extractArticle(html);
  if (text.length < 200) {
    throw new Error(
      `Could not extract readable article text from ${url} (got ${text.length} chars). ` +
        'If the page renders entirely in JavaScript, save the article as a text/markdown file and use --source-doc instead.'
    );
  }

  const bounded = truncateAtWord(text, MAX_SOURCE_CHARS);
  return {
    url: parsed.href,
    title: title || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname,
    text: bounded.text,
    truncated: bounded.truncated,
  };
}
