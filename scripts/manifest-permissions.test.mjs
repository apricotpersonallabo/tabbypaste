import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Chromium manifest declares configurable access to all HTTP(S) sites', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(manifest.host_permissions, [
    'http://*/*',
    'https://*/*'
  ]);
});
