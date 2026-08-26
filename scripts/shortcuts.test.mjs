import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const optionsScriptPath = path.join(repositoryRoot, 'src', 'options.js');
const optionsHtmlPath = path.join(repositoryRoot, 'src', 'options.html');
const localesRoot = path.join(repositoryRoot, 'src', '_locales');

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));

const createOptionsHarness = async ({
  browser = 'firefox',
  shortcut = '',
  shortcutSettingsFailure = false
} = {}) => {
  const source = await readFile(optionsScriptPath, 'utf8');
  const listeners = {};
  const createdTabs = [];
  let shortcutSettingsCalls = 0;

  const createElement = id => ({
    id,
    checked: true,
    dataset: {},
    files: [],
    hidden: true,
    href: '',
    textContent: '',
    value: '',
    addEventListener(type, listener) {
      listeners[`${id}.${type}`] = listener;
    },
    click() {}
  });

  const elementIds = [
    'currentShortcut',
    'delayMs',
    'enabledUrls',
    'exportButton',
    'extensionSettingsLink',
    'firefoxExtensionSettingsHint',
    'firefoxShortcutHint',
    'importButton',
    'importFile',
    'optionsForm',
    'optionsHeading',
    'selectWaitOptions',
    'shortcutSettingsButton',
    'status'
  ];
  const elements = Object.fromEntries(elementIds.map(id => [id, createElement(id)]));

  const messages = {
    optionsLoaded: 'Settings loaded.',
    optionsPageHeading: 'Tabby Paste settings',
    optionsShortcutNotSet: 'Not set',
    optionsShortcutSettingsOpenFailed: 'Could not open shortcut settings.'
  };
  const commands = {
    getAll: async () => [{ name: 'auto_paste', shortcut }],
    openShortcutSettings: async () => {
      shortcutSettingsCalls++;
      if (shortcutSettingsFailure) throw new Error('shortcut settings failed');
    }
  };

  const chrome = {
    commands,
    i18n: {
      getMessage: key => messages[key] || '',
    },
    runtime: {
      id: 'test-extension-id'
    },
    storage: {
      sync: {
        get: async defaults => ({ ...defaults }),
        set: async () => {}
      }
    },
    tabs: {
      create: async options => {
        createdTabs.push(options);
      }
    }
  };
  const document = {
    title: '',
    visibilityState: 'visible',
    getElementById: id => elements[id],
    querySelectorAll: () => [],
    addEventListener(type, listener) {
      listeners[`document.${type}`] = listener;
    }
  };
  const window = {
    addEventListener(type, listener) {
      listeners[`window.${type}`] = listener;
    }
  };
  const navigator = {
    userAgent: browser === 'firefox'
      ? 'Mozilla/5.0 Firefox/153.0'
      : 'Mozilla/5.0 Chrome/153.0.0.0'
  };

  vm.runInNewContext(
    source,
    { Blob, URL, chrome, clearTimeout, console, document, navigator, setTimeout, window },
    { filename: 'options.js' }
  );
  await new Promise(resolve => setImmediate(resolve));

  return {
    createdTabs,
    shortcutSettingsCalls: () => shortcutSettingsCalls,
    elements,
    listeners
  };
};

test('keeps the Chromium shortcut and requires Firefox 140 with no default shortcut', async () => {
  const chromiumManifest = await readJson(path.join(repositoryRoot, 'src', 'manifest.json'));
  const firefoxManifest = await readJson(path.join(repositoryRoot, 'src', 'manifest.firefox.json'));
  const optionsSource = await readFile(optionsScriptPath, 'utf8');
  const optionsHtml = await readFile(optionsHtmlPath, 'utf8');

  assert.equal(
    chromiumManifest.commands.auto_paste.suggested_key.default,
    'Ctrl+Shift+V'
  );
  assert.equal(firefoxManifest.commands.auto_paste.suggested_key, undefined);
  assert.equal(firefoxManifest.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.equal(
    firefoxManifest.commands.auto_paste.description,
    chromiumManifest.commands.auto_paste.description
  );
  assert.doesNotMatch(optionsSource, /about:addons/);
  assert.match(optionsHtml, /<button[\s\S]+id="shortcutSettingsButton"/);
});

test('defines the Firefox shortcut guidance in every extension locale', async () => {
  const localeEntries = await readdir(localesRoot, { withFileTypes: true });
  const localeNames = localeEntries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  assert.deepEqual(localeNames, ['de', 'en', 'es', 'ja', 'ko', 'zh_CN', 'zh_TW']);
  for (const localeName of localeNames) {
    const messages = await readJson(path.join(localesRoot, localeName, 'messages.json'));
    for (const key of [
      'optionsFirefoxExtensionSettingsHint',
      'optionsFirefoxShortcutHint',
      'optionsShortcutSettingsOpenFailed'
    ]) {
      assert.ok(messages[key]?.message?.trim(), `${localeName} is missing ${key}`);
    }
  }
});

test('opens Firefox shortcut settings through the dedicated API', async () => {
  const harness = await createOptionsHarness();

  assert.equal(harness.elements.firefoxShortcutHint.hidden, false);
  assert.equal(harness.elements.firefoxExtensionSettingsHint.hidden, false);
  assert.equal(harness.elements.extensionSettingsLink.hidden, true);
  assert.equal(harness.elements.currentShortcut.textContent, 'Not set');

  await harness.listeners['shortcutSettingsButton.click']();

  assert.equal(harness.shortcutSettingsCalls(), 1);
  assert.deepEqual(harness.createdTabs, []);
});

test('shows an error instead of opening a privileged URL when the Firefox API fails', async () => {
  const harness = await createOptionsHarness({ shortcutSettingsFailure: true });

  await harness.listeners['shortcutSettingsButton.click']();

  assert.equal(harness.shortcutSettingsCalls(), 1);
  assert.deepEqual(harness.createdTabs, []);
  assert.equal(harness.elements.status.textContent, 'Could not open shortcut settings.');
});

test('keeps the existing Chromium shortcut settings behavior', async () => {
  const harness = await createOptionsHarness({
    browser: 'chromium',
    shortcut: 'Ctrl+Shift+V'
  });

  assert.equal(harness.elements.firefoxShortcutHint.hidden, true);
  assert.equal(harness.elements.firefoxExtensionSettingsHint.hidden, true);
  assert.equal(harness.elements.extensionSettingsLink.hidden, false);
  assert.equal(harness.elements.currentShortcut.textContent, 'Ctrl+Shift+V');

  await harness.listeners['shortcutSettingsButton.click']();
  await harness.listeners['extensionSettingsLink.click']({ preventDefault() {} });

  assert.deepEqual(
    harness.createdTabs.map(tab => tab.url),
    [
      'chrome://extensions/shortcuts',
      'chrome://extensions/?id=test-extension-id'
    ]
  );
});
