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
const siteCss = await readFile(path.join(docsRoot, 'assets', 'site.css'), 'utf8');
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

test('documents the browser-specific shortcut defaults in every language', () => {
  for (const language of supportedLanguages) {
    assert.match(translations[language]['manual.media.runCaption'], /Chromium/);
    assert.match(translations[language]['manual.run.shortcutDescription'], /Firefox/);
    assert.match(translations[language]['manual.settings.browserDescription'], /Firefox/);
  }
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

test('manual thumbnails preserve source ratios and practice content is stacked', () => {
  const manual = pages['manual.html'];
  const thumbnailDimensions = Object.fromEntries(
    collectMatches(manual, /<button class="media-button"[\s\S]*?<img\s+([^>]+)>/g)
      .map(attributes => {
        const source = attributes.match(/src="([^"]+)"/)?.[1];
        const width = Number(attributes.match(/width="(\d+)"/)?.[1]);
        const height = Number(attributes.match(/height="(\d+)"/)?.[1]);
        return [source, [width, height]];
      })
  );

  assert.deepEqual(thumbnailDimensions['assets/images/popup.webp'], [240, 160]);
  assert.deepEqual(thumbnailDimensions['assets/images/options.webp'], [700, 900]);
  for (const source of [
    'assets/images/quick-copy.webp',
    'assets/images/quick-focus.webp',
    'assets/images/quick-run.webp',
    'assets/images/welcome.webp'
  ]) {
    assert.deepEqual(thumbnailDimensions[source], [1280, 800], `${source} has incorrect dimensions`);
  }

  const mediaImageRule = siteCss.match(/\.media-button img\s*{([^}]+)}/)?.[1] || '';
  assert.match(mediaImageRule, /width:\s*100%/);
  assert.match(mediaImageRule, /height:\s*auto/);
  assert.doesNotMatch(mediaImageRule, /aspect-ratio|object-fit|object-position/);

  const practiceRule = siteCss.match(/\.practice-shell\s*{([^}]+)}/)?.[1] || '';
  assert.match(practiceRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('sample table keeps copy controls in the first column without changing TSV order', () => {
  const manual = pages['manual.html'];
  const table = manual.match(/<table class="sample-table">([\s\S]*?)<\/table>/)?.[1] || '';
  const headerRow = table.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1]?.trim() || '';
  assert.match(headerRow, /^<th[^>]+data-i18n-aria-label="manual\.practice\.action"/);

  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
  const rows = collectMatches(body, /<tr>([\s\S]*?)<\/tr>/g).map(row => row.trim());
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => /^<td class="copy-cell"><button class="copy-row-button"/.test(row)));
  assert.deepEqual(
    rows.map(row => collectMatches(row, /data-copy-value="([^"]+)"/g)),
    [
      ['E001', 'Alex Morgan', 'Sales', 'Active'],
      ['E002', 'Jamie Lee', 'Engineering', 'Inactive']
    ]
  );
});
