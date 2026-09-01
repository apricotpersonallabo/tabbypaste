import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const docsRoot = path.join(repositoryRoot, 'docs');
const pageNames = ['index.html', 'privacy.html', '404.html'];

const pages = Object.fromEntries(await Promise.all(pageNames.map(async name => [
  name,
  await readFile(path.join(docsRoot, name), 'utf8')
])));

const collectMatches = (source, expression, group = 1) => (
  [...source.matchAll(expression)].map(match => match[group])
);

test('GitHub Pages includes its required static files', async () => {
  for (const relativePath of [
    '.nojekyll',
    'index.html',
    'privacy.html',
    '404.html',
    'assets/icon128.png',
    'assets/site.css',
    'assets/site.js'
  ]) {
    await access(path.join(docsRoot, relativePath));
  }
});

test('local links and assets stay inside docs and point to existing files', async () => {
  for (const [pageName, source] of Object.entries(pages)) {
    for (const reference of collectMatches(source, /(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:|#)/.test(reference)) continue;
      const localPath = reference.split(/[?#]/, 1)[0];
      const resolvedPath = path.resolve(docsRoot, path.dirname(pageName), localPath);
      assert.ok(resolvedPath.startsWith(`${docsRoot}${path.sep}`), `${reference} escapes docs/`);
      await access(resolvedPath);
    }
  }
});

test('external new-tab links prevent opener access', () => {
  for (const [pageName, source] of Object.entries(pages)) {
    const anchors = collectMatches(source, /(<a\b[^>]*>)/g);
    for (const anchor of anchors) {
      const href = anchor.match(/href="([^"]+)"/)?.[1];
      if (!href?.startsWith('http')) continue;
      assert.match(anchor, /target="_blank"/, `${pageName}: ${href} must open a new tab`);
      assert.match(anchor, /rel="[^"]*noopener[^"]*"/, `${pageName}: ${href} lacks noopener`);
      assert.match(anchor, /rel="[^"]*noreferrer[^"]*"/, `${pageName}: ${href} lacks noreferrer`);
    }
  }
});

test('pages keep CSS and JavaScript in external files', () => {
  for (const [pageName, source] of Object.entries(pages)) {
    assert.doesNotMatch(source, /\sstyle\s*=/i, `${pageName} contains inline CSS`);
    assert.doesNotMatch(source, /<style\b/i, `${pageName} contains an inline style block`);
    assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${pageName} contains an inline event handler`);
    assert.doesNotMatch(source, /<script(?!\s[^>]*\bsrc=)[^>]*>/i, `${pageName} contains inline JavaScript`);
  }
});
