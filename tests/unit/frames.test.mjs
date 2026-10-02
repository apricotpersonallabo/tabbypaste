import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/background.js', import.meta.url), 'utf8');

const loadBackground = (settings = {}) => {
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
      executeScript: async options => { injections.push(JSON.parse(JSON.stringify(options))); }
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
