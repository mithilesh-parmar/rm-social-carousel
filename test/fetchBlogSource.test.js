import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractArticle, fetchBlogSource } from '../src/content/fetchBlogSource.js';

const PAGE = `
<!doctype html>
<html>
<head>
  <title>Psyllium Husk vs Powder | RM Psyllium</title>
  <meta property="og:title" content="Psyllium Husk vs Powder: What Buyers Should Order" />
  <style>body { color: red; }</style>
  <script>window.analytics = { track: () => {} };</script>
</head>
<body>
  <header><a href="/">Home</a> <a href="/blog">Blog</a></header>
  <nav>Products &middot; Pricing &middot; Contact</nav>
  <article>
    <h1>Psyllium Husk vs Powder</h1>
    <p>Husk and powder come from the same seed &amp; differ mainly in mesh size.</p>
    <ul>
      <li>Husk: 85% purity typical</li>
      <li>Powder: 40 to 100 mesh</li>
    </ul>
    <p>Most nutraceutical buyers specify husk for capsule fills.</p>
  </article>
  <article><p>Related: a short teaser card.</p></article>
  <footer>© RM Psyllium</footer>
</body>
</html>`;

test('extractArticle: prefers the article h1 (full editorial headline) over the SEO-clamped og:title', () => {
  const { title } = extractArticle(PAGE);
  assert.equal(title, 'Psyllium Husk vs Powder');
});

test('extractArticle: falls back to og:title when the article has no h1', () => {
  const { title } = extractArticle(
    '<head><title>Clamped | Site</title><meta property="og:title" content="Full OG Title" /></head><body><article><p>x</p></article></body>'
  );
  assert.equal(title, 'Full OG Title');
});

test('extractArticle: h1 with inline markup and line breaks flattens to one line', () => {
  const { title } = extractArticle('<body><article><h1>Format Guide for Drinks<br><em>Application.</em></h1><p>x</p></article></body>');
  assert.equal(title, 'Format Guide for Drinks Application.');
});

test('extractArticle: falls back to <title> with the site suffix stripped', () => {
  const { title } = extractArticle('<title>Psyllium Husk vs Powder | RM Psyllium</title><body><p>x</p></body>');
  assert.equal(title, 'Psyllium Husk vs Powder');
});

test('extractArticle: falls back to the first <h1> when no title tags exist', () => {
  const { title } = extractArticle('<body><h1>Mesh Size Explained</h1><p>x</p></body>');
  assert.equal(title, 'Mesh Size Explained');
});

test('extractArticle: scopes to the longest <article>, dropping nav/header/footer chrome', () => {
  const { text } = extractArticle(PAGE);
  assert.match(text, /mesh size/);
  assert.match(text, /capsule fills/);
  assert.doesNotMatch(text, /Pricing/); // nav
  assert.doesNotMatch(text, /©/); // footer
  assert.doesNotMatch(text, /teaser card/); // shorter sibling <article>
});

test('extractArticle: strips scripts/styles and decodes entities', () => {
  const { text } = extractArticle(PAGE);
  assert.doesNotMatch(text, /analytics/);
  assert.doesNotMatch(text, /color: red/);
  assert.match(text, /same seed & differ/);
});

test('extractArticle: list items become "- " lines', () => {
  const { text } = extractArticle(PAGE);
  assert.match(text, /- Husk: 85% purity typical/);
  assert.match(text, /- Powder: 40 to 100 mesh/);
});

test('extractArticle: falls back to <main> then <body> when there is no <article>', () => {
  const { text } = extractArticle('<body><nav>menu</nav><main><p>Main content here.</p></main></body>');
  assert.equal(text, 'Main content here.');
});

test('fetchBlogSource: rejects a non-URL without touching the network', async () => {
  await assert.rejects(() => fetchBlogSource('not a url'), /not a valid URL/);
});

test('fetchBlogSource: rejects non-http(s) protocols', async () => {
  await assert.rejects(() => fetchBlogSource('file:///etc/hosts'), /Only http\(s\) URLs/);
});
