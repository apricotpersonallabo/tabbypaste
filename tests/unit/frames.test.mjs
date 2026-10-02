import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/background.js', import.meta.url), 'utf8');

const loadBackground = (settings = {}, {
  clipboardResults = [{ frameId: 0, result: { text: 'Alpha\tBeta' } }],
  injectionFailure = false
} = {}) => {
  const listeners = {};
  const injections = [];
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const chrome = {
    commands: { onCommand: event('command') },
    contextMenus: { onClicked: event('menu') },
    runtime: {
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message')
    },
    scripting: {
      executeScript: async options => {
        injections.push(JSON.parse(JSON.stringify(options)));
        if (injectionFailure) throw new Error('injection denied');
        return clipboardResults;
      }
    },
    storage: {
      onChanged: event('storage'),
      sync: { get: async defaults => ({ ...defaults, ...settings }) }
    },
    tabs: { onActivated: event('activated'), onUpdated: event('updated') }
  };
  vm.runInNewContext(source, { chrome, console }, { filename: 'background.js' });
  return { listeners, injections };
};

const requestClipboard = (listeners, sender) => new Promise(resolve => {
  assert.equal(listeners.message({ type: 'readClipboardForPaste' }, sender, resolve), true);
});

test('context menu injects into the clicked frame, with a top-frame fallback', async () => {
  for (const frameId of [undefined, 0, 42]) {
    const { listeners, injections } = loadBackground();
    await listeners.menu({ menuItemId: 'tabbypaste', frameId }, { id: 7, url: 'https://example.test/' });
    assert.deepEqual(injections, [{
      target: { tabId: 7, frameIds: [frameId ?? 0] },
      files: ['filler.js']
    }]);
  }
});

test('frame context menus still honor top-level URL and global enablement', async () => {
  for (const settings of [{ enabledUrls: 'https://other.test/*' }, { extensionEnabled: false }]) {
    const { listeners, injections } = loadBackground(settings);
    await listeners.menu({
      menuItemId: 'tabbypaste', frameId: 42, frameUrl: 'https://other.test/form'
    }, { id: 7, url: 'https://example.test/' });
    assert.deepEqual(injections, []);
  }
});

test('shortcut starts in the top frame so the filler can follow the focused document', async () => {
  const { listeners, injections } = loadBackground();
  await listeners.command('auto_paste', { id: 7, url: 'https://example.test/' });
  assert.deepEqual(injections, [{ target: { tabId: 7 }, files: ['filler.js'] }]);
});

test('clipboard requests from any frame read only in that tab\'s top frame', async () => {
  for (const frameId of [0, 42]) {
    const { listeners, injections } = loadBackground();
    const response = await requestClipboard(listeners, {
      frameId, tab: { id: 7, url: 'https://example.test/' }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true, text: 'Alpha\tBeta' });
    assert.deepEqual(injections, [{ target: { tabId: 7, frameIds: [0] } }]);
  }
});

test('clipboard requests reject missing tabs, disabled URLs and global disablement', async () => {
  for (const [settings, sender] of [
    [{}, {}],
    [{ enabledUrls: 'https://other.test/*' }, { tab: { id: 7, url: 'https://example.test/' } }],
    [{ extensionEnabled: false }, { tab: { id: 7, url: 'https://example.test/' } }]
  ]) {
    const { listeners, injections } = loadBackground(settings);
    const response = await requestClipboard(listeners, sender);
    assert.equal(response.ok, false);
    assert.deepEqual(injections, []);
  }
});

test('clipboard requests preserve empty text and report read or injection failures', async () => {
  const sender = { tab: { id: 7, url: 'https://example.test/' } };
  const empty = loadBackground({}, { clipboardResults: [{ frameId: 0, result: { text: '' } }] });
  const emptyResponse = await requestClipboard(empty.listeners, sender);
  assert.equal(emptyResponse.ok, true);
  assert.equal(emptyResponse.text, '');

  for (const options of [
    { clipboardResults: [{ frameId: 0, result: { error: true } }] },
    { clipboardResults: [] },
    { injectionFailure: true }
  ]) {
    const { listeners } = loadBackground({}, options);
    assert.equal((await requestClipboard(listeners, sender)).ok, false);
  }
});
