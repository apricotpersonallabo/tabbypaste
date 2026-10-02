import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/background.js', import.meta.url), 'utf8');

const loadBackground = (settings = {}, {
  clipboardResults = [{ frameId: 0, result: { text: 'Alpha\tBeta' } }],
  injectionFailure = false,
  extensionResponse = { ok: true, text: 'Fallback\tText' },
  backgroundClipboard,
  creationFailure = false,
  legacyWorker = false,
  existingDocument = false
} = {}) => {
  const listeners = {};
  const injections = [];
  const offscreenCalls = [];
  let documentOpen = existingDocument;
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const chrome = {
    commands: { onCommand: event('command') },
    contextMenus: { onClicked: event('menu') },
    runtime: {
      id: 'test-extension',
      getURL: path => `chrome-extension://test-extension/${path}`,
      ...(!legacyWorker && { getContexts: async () => documentOpen
        ? [{ documentUrl: 'chrome-extension://test-extension/clipboard.html' }] : [] }),
      sendMessage: async message => {
        offscreenCalls.push(['message', message.type]);
        return typeof extensionResponse === 'function' ? extensionResponse() : extensionResponse;
      },
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message')
    },
    offscreen: {
      createDocument: async options => {
        offscreenCalls.push(['create', options.url, ...options.reasons]);
        if (creationFailure) throw new Error('offscreen creation denied');
        assert.equal(documentOpen, false, 'only one offscreen document may exist');
        documentOpen = true;
      },
      closeDocument: async () => {
        offscreenCalls.push(['close']);
        documentOpen = false;
      }
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
  vm.runInNewContext(source, {
    chrome, console,
    navigator: backgroundClipboard ? { clipboard: { readText: backgroundClipboard } } : {},
    clients: { matchAll: async () => documentOpen
      ? [{ url: 'chrome-extension://test-extension/clipboard.html' }] : [] }
  }, { filename: 'background.js' });
  return { listeners, injections, offscreenCalls };
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
    const { listeners, injections, offscreenCalls } = loadBackground(settings);
    await listeners.menu({
      menuItemId: 'tabbypaste', frameId: 42, frameUrl: 'https://other.test/form'
    }, { id: 7, url: 'https://example.test/' });
    assert.deepEqual(injections, []);
    assert.deepEqual(offscreenCalls, []);
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
    const { listeners, injections, offscreenCalls } = loadBackground(settings);
    const response = await requestClipboard(listeners, sender);
    assert.equal(response.ok, false);
    assert.deepEqual(injections, []);
    assert.deepEqual(offscreenCalls, []);
  }
});

test('clipboard requests preserve empty text without falling back', async () => {
  const sender = { tab: { id: 7, url: 'https://example.test/' } };
  const empty = loadBackground({}, { clipboardResults: [{ frameId: 0, result: { text: '' } }] });
  const emptyResponse = await requestClipboard(empty.listeners, sender);
  assert.equal(emptyResponse.ok, true);
  assert.equal(emptyResponse.text, '');
  assert.deepEqual(empty.offscreenCalls, []);
});

test('failed page reads and injections fall back to an offscreen clipboard read on HTTP', async () => {
  const sender = { frameId: 42, tab: { id: 7, url: 'http://example.test/' } };
  for (const options of [
    { clipboardResults: [{ frameId: 0, result: { error: true } }] },
    { clipboardResults: [] },
    { injectionFailure: true }
  ]) {
    const { listeners, offscreenCalls } = loadBackground({}, options);
    const response = await requestClipboard(listeners, sender);
    assert.equal(response.ok, true);
    assert.equal(response.text, 'Fallback\tText');
    assert.deepEqual(offscreenCalls, [
      ['create', 'clipboard.html', 'CLIPBOARD'], ['message', 'readClipboardOffscreen'], ['close']
    ]);
  }
});

test('Firefox reads from its background Clipboard API without offscreen documents', async () => {
  const { listeners, offscreenCalls } = loadBackground({}, {
    clipboardResults: [], backgroundClipboard: async () => 'Firefox\tText'
  });
  const response = await requestClipboard(listeners, { tab: { id: 7, url: 'http://example.test/' } });
  assert.equal(response.text, 'Firefox\tText');
  assert.deepEqual(offscreenCalls, []);
});

test('offscreen reads preserve empty text and close the document even on failure', async () => {
  const sender = { tab: { id: 7, url: 'http://example.test/' } };
  for (const extensionResponse of [{ ok: true, text: '' }, { ok: false }, undefined]) {
    const { listeners, offscreenCalls } = loadBackground({}, {
      clipboardResults: [], extensionResponse: extensionResponse ?? null
    });
    const response = await requestClipboard(listeners, sender);
    assert.equal(response.ok, Boolean(extensionResponse?.ok));
    if (response.ok) assert.equal(response.text, '');
    assert.deepEqual(offscreenCalls.at(-1), ['close']);
  }
  const failed = loadBackground({}, { clipboardResults: [], creationFailure: true });
  assert.equal((await requestClipboard(failed.listeners, sender)).ok, false);
  const firefoxFailed = loadBackground({}, {
    clipboardResults: [], backgroundClipboard: async () => { throw new Error('clipboard denied'); }
  });
  assert.equal((await requestClipboard(firefoxFailed.listeners, sender)).ok, false);
});

test('concurrent clipboard requests serialize creation, reads and cleanup', async () => {
  let counter = 0;
  const { listeners, offscreenCalls } = loadBackground({}, {
    clipboardResults: [],
    extensionResponse: async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: true, text: String(++counter) };
    }
  });
  const sender = { tab: { id: 7, url: 'http://example.test/' } };
  const responses = await Promise.all([
    requestClipboard(listeners, sender), requestClipboard(listeners, sender)
  ]);
  assert.deepEqual(responses.map(response => response.text), ['1', '2']);
  assert.deepEqual(offscreenCalls, Array(2).fill([
    ['create', 'clipboard.html', 'CLIPBOARD'], ['message', 'readClipboardOffscreen'], ['close']
  ]).flat());
});

test('offscreen reads reuse a surviving document and support pre-116 workers', async () => {
  for (const legacyWorker of [false, true]) {
    const { listeners, offscreenCalls } = loadBackground({}, {
      clipboardResults: [], existingDocument: true, legacyWorker
    });
    assert.equal((await requestClipboard(listeners, { tab: { id: 7, url: 'http://example.test/' } })).ok, true);
    assert.deepEqual(offscreenCalls, [['message', 'readClipboardOffscreen'], ['close']]);
  }
});
