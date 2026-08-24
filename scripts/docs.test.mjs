import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const docsRoot = path.join(repositoryRoot, 'docs');
const pageNames = ['index.html', 'manual.html'];
const supportedLanguages = ['ja', 'en', 'de', 'es', 'ko', 'zh-CN', 'zh-TW'];
const storeUrls = [
  'https://chromewebstore.google.com/detail/tabby-paste/pnfhlnlilceabibdeamkinhjjgmmnhme',
  'https://microsoftedge.microsoft.com/addons/detail/tabby-paste/gjkopcpoddbifofepjnopohpcoeehlbg',
  'https://addons.mozilla.org/en-US/firefox/addon/tabby-paste/'
];

const pages = Object.fromEntries(await Promise.all(pageNames.map(async name => [
  name,
  await readFile(path.join(docsRoot, name), 'utf8')
])));

const translationSource = await readFile(path.join(docsRoot, 'assets', 'translations.js'), 'utf8');
const translationContext = { window: {} };
vm.runInNewContext(translationSource, translationContext, { filename: 'translations.js' });
const translations = translationContext.window.TABBY_PASTE_TRANSLATIONS;

const collectMatches = (source, expression, group = 1) => {
  const matches = [];
  for (const match of source.matchAll(expression)) matches.push(match[group]);
  return matches;
};

test('all page translation keys exist in every supported language', () => {
  assert.deepEqual(Object.keys(translations).sort(), [...supportedLanguages].sort());

  const requiredKeys = new Set([
    'index.meta.title',
    'index.meta.description',
    'manual.meta.title',
    'manual.meta.description',
    'manual.practice.copySuccess',
    'manual.practice.copyError'
  ]);
  for (const source of Object.values(pages)) {
    for (const key of collectMatches(source, /data-i18n(?:-alt|-aria-label)?="([^"]+)"/g)) {
      requiredKeys.add(key);
    }
  }

  for (const language of supportedLanguages) {
    assert.ok(translations[language], `missing locale: ${language}`);
    assert.deepEqual(
      Object.keys(translations[language]).sort(),
      Object.keys(translations.en).sort(),
      `${language} translation keys differ from English`
    );
    for (const key of requiredKeys) {
      assert.equal(
        typeof translations[language][key],
        'string',
        `${language} is missing ${key}`
      );
      assert.ok(translations[language][key].trim(), `${language}.${key} is empty`);
    }
  }
});

test('internal links and media point to existing files', async () => {
  for (const [pageName, source] of Object.entries(pages)) {
    const references = [
      ...collectMatches(source, /(?:href|src|poster|data-dialog-image)="([^"]+)"/g)
    ];
    for (const reference of references) {
      if (/^(?:https?:|#|data:|mailto:|tel:)/.test(reference)) continue;
      const localPath = reference.split(/[?#]/, 1)[0];
      if (!localPath) continue;
      const resolvedPath = path.resolve(docsRoot, path.dirname(pageName), localPath);
      assert.ok(resolvedPath.startsWith(`${docsRoot}${path.sep}`), `path escapes docs/: ${reference}`);
      assert.ok((await stat(resolvedPath)).isFile(), `${pageName} references missing ${reference}`);
    }
  }
});

test('official store links are present without a displayed version', () => {
  for (const storeUrl of storeUrls) assert.ok(pages['index.html'].includes(storeUrl));
  assert.doesNotMatch(pages['index.html'], /(?:version|v)\s*\d+\.\d+/i);
});

test('external new-tab links use safe relationship attributes', () => {
  for (const [pageName, source] of Object.entries(pages)) {
    const anchorTags = collectMatches(source, /(<a\b[^>]*>)/g, 1);
    for (const anchor of anchorTags) {
      const href = anchor.match(/href="([^"]+)"/)?.[1];
      if (!href?.startsWith('http')) continue;
      assert.match(anchor, /target="_blank"/, `${pageName}: external link must open a new tab: ${href}`);
      const rel = anchor.match(/rel="([^"]+)"/)?.[1]?.split(/\s+/) || [];
      assert.ok(rel.includes('noopener'), `${pageName}: ${href} lacks noopener`);
      assert.ok(rel.includes('noreferrer'), `${pageName}: ${href} lacks noreferrer`);
    }
  }
});

test('pages avoid inline behavior and obsolete media', () => {
  for (const [pageName, source] of Object.entries(pages)) {
    assert.doesNotMatch(source, /\sstyle\s*=/i, `${pageName} contains inline CSS`);
    assert.doesNotMatch(source, /<style\b/i, `${pageName} contains an inline style block`);
    assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${pageName} contains an inline event handler`);
    assert.doesNotMatch(source, /<script(?!\s[^>]*\bsrc=)[^>]*>/i, `${pageName} contains inline JavaScript`);
    assert.doesNotMatch(source, /assets\/images\/(?:[1-5]\.png|demo\.gif)/, `${pageName} uses obsolete media`);
  }
});
