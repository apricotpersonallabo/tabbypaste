import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const backgroundUrl = new URL('../src/background.js', import.meta.url);
const localesUrl = new URL('../src/_locales/', import.meta.url);
const welcomeHtmlUrl = new URL('../src/welcome.html', import.meta.url);
const welcomeScriptUrl = new URL('../src/welcome.js', import.meta.url);

const WELCOME_MESSAGE_KEYS = [
  'welcomePageTitle',
  'welcomeHeading',
  'welcomeIntro',
  'welcomeStepCopyTitle',
  'welcomeStepCopyDescription',
  'welcomeStepFocusTitle',
  'welcomeStepFocusDescription',
  'welcomeStepRunTitle',
  'welcomeStepRunDescription',
  'welcomeCurrentShortcut',
  'welcomeShortcutLoading',
  'welcomeShortcutNotSet',
  'welcomeShortcutUnavailable',
  'welcomeOpenSettings',
  'welcomeViewManual',
  'welcomeClose'
];

const createEvent = (capture) => ({
  addListener(listener) {
    if (capture) capture(listener);
  }
});

const loadBackground = async () => {
  const source = await readFile(backgroundUrl, 'utf8');
  const calls = {
    contextMenus: [],
    createdTabs: [],
    tabQueries: 0
  };
  let installedListener;

  const chrome = {
    action: {
      enable: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setIcon: async () => {}
    },
    commands: {
      onCommand: createEvent()
    },
    contextMenus: {
      create(options) {
        calls.contextMenus.push(options);
      },
      onClicked: createEvent()
    },
    i18n: {
      getMessage: () => 'Tabby Paste'
    },
    runtime: {
      getURL: path => `extension://test/${path}`,
      onInstalled: createEvent(listener => {
        installedListener = listener;
      }),
      onMessage: createEvent(),
      onStartup: createEvent()
    },
    scripting: {
      executeScript: async () => {}
    },
    storage: {
      onChanged: createEvent(),
      sync: {
        get: async defaults => defaults
      }
    },
    tabs: {
      create: async options => {
        calls.createdTabs.push(options);
      },
      get: async tabId => ({ id: tabId, url: 'https://example.test/' }),
      onActivated: createEvent(),
      onUpdated: createEvent(),
      query: async () => {
        calls.tabQueries++;
        return [];
      }
    }
  };

  vm.runInNewContext(source, { chrome, console }, { filename: 'background.js' });
  assert.equal(typeof installedListener, 'function');

  return { calls, installedListener };
};

test('opens the local welcome page once on initial installation', async () => {
  const { calls, installedListener } = await loadBackground();

  installedListener({ reason: 'install' });
  await Promise.resolve();

  assert.equal(calls.createdTabs.length, 1);
  assert.equal(calls.createdTabs[0].url, 'extension://test/welcome.html');
  assert.equal(calls.contextMenus.length, 1);
  assert.equal(calls.tabQueries, 1);
});

test('does not open the welcome page for extension or browser updates', async () => {
  for (const reason of ['update', 'chrome_update', 'browser_update']) {
    const { calls, installedListener } = await loadBackground();

    installedListener({ reason });
    await Promise.resolve();

    assert.deepEqual(calls.createdTabs, [], reason);
    assert.equal(calls.contextMenus.length, 1, reason);
    assert.equal(calls.tabQueries, 1, reason);
  }
});

test('defines every welcome message in every locale', async () => {
  const localeEntries = await readdir(localesUrl, { withFileTypes: true });
  const localeNames = localeEntries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  assert.deepEqual(localeNames, ['de', 'en', 'es', 'ja', 'ko', 'zh_CN', 'zh_TW']);

  for (const localeName of localeNames) {
    const messagesUrl = new URL(`${localeName}/messages.json`, localesUrl);
    const messages = JSON.parse(await readFile(messagesUrl, 'utf8'));

    for (const key of WELCOME_MESSAGE_KEYS) {
      assert.equal(
        typeof messages[key]?.message,
        'string',
        `${localeName} is missing ${key}`
      );
      assert.notEqual(messages[key].message.trim(), '', `${localeName}.${key} is empty`);
    }
  }
});

test('keeps the manual link isolated from the welcome page', async () => {
  const welcomeHtml = await readFile(welcomeHtmlUrl, 'utf8');

  assert.match(welcomeHtml, /target="_blank"/);
  assert.match(welcomeHtml, /rel="noopener noreferrer"/);
});

test('shows the configured shortcut and wires the welcome actions', async () => {
  const source = await readFile(welcomeScriptUrl, 'utf8');
  const listeners = {};
  const elements = {
    closeButton: {
      addEventListener(type, listener) {
        listeners[`closeButton.${type}`] = listener;
      }
    },
    currentShortcut: {
      dataset: { i18n: 'welcomeShortcutLoading' },
      textContent: 'Loading...'
    },
    settingsButton: {
      addEventListener(type, listener) {
        listeners[`settingsButton.${type}`] = listener;
      }
    }
  };
  let closeCalls = 0;
  let openOptionsCalls = 0;
  const messages = {
    welcomePageTitle: 'Welcome to Tabby Paste',
    welcomeShortcutLoading: 'Loading...',
    welcomeShortcutNotSet: 'Not set',
    welcomeShortcutUnavailable: 'Unavailable'
  };
  const chrome = {
    commands: {
      getAll: async () => [
        { name: 'auto_paste', shortcut: 'Ctrl+Shift+V' }
      ]
    },
    i18n: {
      getMessage: key => messages[key] || '',
      getUILanguage: () => 'ja_JP'
    },
    runtime: {
      openOptionsPage: async () => {
        openOptionsCalls++;
      }
    }
  };
  const document = {
    documentElement: { lang: 'en' },
    getElementById: id => elements[id],
    querySelectorAll: () => [elements.currentShortcut],
    title: ''
  };
  const window = {
    close() {
      closeCalls++;
    }
  };

  vm.runInNewContext(source, { chrome, console, document, window }, { filename: 'welcome.js' });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(document.documentElement.lang, 'ja-JP');
  assert.equal(document.title, 'Welcome to Tabby Paste');
  assert.equal(elements.currentShortcut.textContent, 'Ctrl+Shift+V');

  await listeners['settingsButton.click']();
  listeners['closeButton.click']();

  assert.equal(openOptionsCalls, 1);
  assert.equal(closeCalls, 1);
});
