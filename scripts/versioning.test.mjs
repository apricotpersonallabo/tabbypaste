import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertVersionsSynchronized,
  incrementVersion,
  validateVersion
} from './versioning.mjs';

test('validates supported browser extension versions', () => {
  assert.deepEqual(validateVersion('1.0.12'), [1, 0, 12]);
  assert.deepEqual(validateVersion('1.2.3.4'), [1, 2, 3, 4]);
});

test('rejects invalid browser extension versions', () => {
  for (const version of ['', '01.2.3', '1.2.3.4.5', '1.2.beta', '1.65536.0']) {
    assert.throws(() => validateVersion(version), /Invalid browser extension version|must not exceed/);
  }
});

test('increments versions and carries overflowing components', () => {
  assert.equal(incrementVersion('1.0.11'), '1.0.12');
  assert.equal(incrementVersion('1.2.65535'), '1.3.0');
  assert.equal(incrementVersion('1.65535.65535'), '2.0.0');
});

test('accepts synchronized manifest versions', () => {
  assert.doesNotThrow(() => assertVersionsSynchronized('1.0.12', [
    { label: 'Chromium manifest', version: '1.0.12' },
    { label: 'Firefox manifest', version: '1.0.12' }
  ]));
});

test('rejects mismatched manifest versions', () => {
  assert.throws(() => assertVersionsSynchronized('1.0.12', [
    { label: 'Chromium manifest', version: '1.0.11' },
    { label: 'Firefox manifest', version: '1.0.12' }
  ]), /Chromium manifest version 1\.0\.11 does not match version\.json 1\.0\.12/);
});
