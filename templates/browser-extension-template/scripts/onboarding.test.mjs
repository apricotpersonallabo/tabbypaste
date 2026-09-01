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
  'welcomeEyebrow',
  'welcomeHeading',
  'welcomeIntro',
  'welcomeStepOneTitle',
  'welcomeStepOneDescription',
  'welcomeStepTwoTitle',
  'welcomeStepTwoDescription',
  'welcomeStepThreeTitle',
  'welcomeStepThreeDescription',
  'welcomeVersion',
  'welcomeOpenSettings',
  'welcomeClose'
];

const loadBackground = async () => {
  const source = await readFile(backgroundUrl, 'utf8');
  const createdTabs = [];
  let installedListener;

  const chrome = {
    runtime: {
      getURL: path => `extension://test/${path}`,
      onInstalled: {
        addListener(listener) {
          installedListener = listener;
        }
      }
    },
    storage: {
      sync: {
        get: async defaults => defaults,
        set: async () => {}
      }
    },
    tabs: {
      create: async options => {
        createdTabs.push(options);
      }
    }
  };

  vm.runInNewContext(source, { chrome, console }, { filename: 'background.js' });
  return { createdTabs, installedListener };
};

test('opens the local welcome page only on initial installation', async () => {
  const install = await loadBackground();
  install.installedListener({ reason: 'install' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(
    install.createdTabs.map(tab => tab.url),
    ['extension://test/welcome.html']
  );

  for (const reason of ['update', 'chrome_update', 'browser_update']) {
    const update = await loadBackground();
    update.installedListener({ reason });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(update.createdTabs, [], reason);
  }
});

test('defines every welcome message in every locale', async () => {
  const localeNames = (await readdir(localesUrl, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  for (const localeName of localeNames) {
    const messages = JSON.parse(await readFile(new URL(`${localeName}/messages.json`, localesUrl), 'utf8'));
    for (const key of WELCOME_MESSAGE_KEYS) {
      assert.ok(messages[key]?.message?.trim(), `${localeName} is missing ${key}`);
    }
  }
});

test('welcome page keeps behavior and styles in external files', async () => {
  const html = await readFile(welcomeHtmlUrl, 'utf8');
  assert.match(html, /<script src="welcome\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="welcome\.css">/);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('shows the current version and wires the welcome actions', async () => {
  const source = await readFile(welcomeScriptUrl, 'utf8');
  const listeners = {};
  const elements = {
    closeWelcome: {
      addEventListener(type, listener) {
        listeners[`closeWelcome.${type}`] = listener;
      }
    },
    openSettings: {
      addEventListener(type, listener) {
        listeners[`openSettings.${type}`] = listener;
      }
    },
    version: { textContent: '' }
  };
  const localizedElement = { dataset: { i18n: 'welcomeHeading' }, textContent: '' };
  let closeCalls = 0;
  let openOptionsCalls = 0;

  const chrome = {
    i18n: {
      getMessage: (key, substitution) => {
        if (key === 'extName') return 'Example Extension';
        if (key === 'welcomePageTitle') return `Welcome to ${substitution}`;
        if (key === 'welcomeVersion') return `Version ${substitution}`;
        return key === 'welcomeHeading' ? 'Your extension is ready' : '';
      },
      getUILanguage: () => 'ja_JP'
    },
    runtime: {
      getManifest: () => ({ version: '0.1.0' }),
      openOptionsPage: async () => {
        openOptionsCalls++;
      }
    }
  };
  const document = {
    documentElement: { lang: 'en' },
    title: '',
    getElementById: id => elements[id],
    querySelectorAll: () => [localizedElement]
  };
  const window = {
    close() {
      closeCalls++;
    }
  };

  vm.runInNewContext(source, { chrome, document, window }, { filename: 'welcome.js' });
  assert.equal(document.documentElement.lang, 'ja-JP');
  assert.equal(document.title, 'Welcome to Example Extension');
  assert.equal(elements.version.textContent, 'Version 0.1.0');
  assert.equal(localizedElement.textContent, 'Your extension is ready');

  await listeners['openSettings.click']();
  listeners['closeWelcome.click']();
  assert.equal(openOptionsCalls, 1);
  assert.equal(closeCalls, 1);
});
