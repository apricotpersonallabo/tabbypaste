import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertChromeUploadSucceeded,
  CHROME_UPLOAD_STATES,
  getChromeUploadState
} from './chrome-upload-state.mjs';

test('reads SUCCEEDED from the immediate Chrome upload response', () => {
  assert.equal(
    getChromeUploadState({ uploadState: 'SUCCEEDED' }),
    CHROME_UPLOAD_STATES.SUCCEEDED
  );
});

test('reads IN_PROGRESS from the immediate Chrome upload response', () => {
  assert.equal(
    getChromeUploadState({ uploadState: 'IN_PROGRESS' }),
    CHROME_UPLOAD_STATES.IN_PROGRESS
  );
});

test('reads SUCCEEDED from the Chrome fetchStatus response', () => {
  assert.equal(
    getChromeUploadState({ lastAsyncUploadState: 'SUCCEEDED' }),
    CHROME_UPLOAD_STATES.SUCCEEDED
  );
});

test('accepts successful immediate upload and fetchStatus responses', () => {
  assert.doesNotThrow(() => assertChromeUploadSucceeded({ uploadState: 'SUCCEEDED' }));
  assert.doesNotThrow(() => {
    assertChromeUploadSucceeded({ lastAsyncUploadState: 'SUCCEEDED' });
  });
});

test('rejects failure and unknown states before publishing', () => {
  for (const state of ['FAILED', 'NOT_FOUND', 'UPLOAD_STATE_UNSPECIFIED', 'UNKNOWN']) {
    assert.throws(
      () => assertChromeUploadSucceeded({ uploadState: state }),
      new RegExp(`Chrome upload did not succeed:.*${state}`)
    );
  }
});

test('rejects responses with no recognized state field before publishing', () => {
  assert.equal(getChromeUploadState({}), '');
  assert.equal(getChromeUploadState(null), '');
  assert.throws(() => assertChromeUploadSucceeded({}), /Chrome upload did not succeed/);
  assert.throws(() => assertChromeUploadSucceeded(null), /Chrome upload did not succeed/);
});
