import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertChromeUploadSucceeded,
  CHROME_UPLOAD_STATES,
  getChromeUploadState
} from './chrome-upload-state.mjs';
import {
  assertChromePublishSubmitted,
  CHROME_ITEM_STATES,
  formatChromePublishError,
  getChromePublishState,
  getChromePublishWarnings
} from './chrome-publish-state.mjs';
import { EDGE_OPERATION_STATES, getEdgeOperationState } from './edge-operation-state.mjs';

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

test('accepts only PENDING_REVIEW after Chrome publish', () => {
  const result = { state: 'PENDING_REVIEW' };
  assert.equal(getChromePublishState(result), CHROME_ITEM_STATES.PENDING_REVIEW);
  assert.doesNotThrow(() => assertChromePublishSubmitted(result));

  for (const state of [
    'ITEM_STATE_UNSPECIFIED',
    'REJECTED',
    'CANCELLED',
    'STAGED',
    'PUBLISHED',
    'PUBLISHED_TO_TESTERS',
    'UNKNOWN'
  ]) {
    assert.throws(
      () => assertChromePublishSubmitted({ state }),
      new RegExp(`Chrome publish did not enter review:.*${state}`)
    );
  }
});

test('rejects malformed Chrome publish responses', () => {
  assert.equal(getChromePublishState({}), '');
  assert.equal(getChromePublishState(null), '');
  assert.throws(() => assertChromePublishSubmitted({}), /Chrome publish did not enter review/);
  assert.throws(() => assertChromePublishSubmitted(null), /Chrome publish did not enter review/);
});

test('reads Chrome publish warnings', () => {
  assert.deepEqual(getChromePublishWarnings({}), []);
  assert.deepEqual(
    getChromePublishWarnings({
      warningInfo: { warnings: [{ reason: 'ONLY', description: 'Only warning.' }] }
    }),
    [{ reason: 'ONLY', description: 'Only warning.' }]
  );
  assert.deepEqual(
    getChromePublishWarnings({
      warningInfo: {
        warnings: [
          { reason: 'FIRST', description: 'First warning.' },
          { reason: 'SECOND', description: 'Second warning.' }
        ]
      }
    }),
    [
      { reason: 'FIRST', description: 'First warning.' },
      { reason: 'SECOND', description: 'Second warning.' }
    ]
  );
});

test('formats INVALID_ITEM_METADATA Chrome publish errors with the dashboard link', () => {
  const body = {
    error: {
      message: 'Generic message.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'INVALID_ITEM_METADATA'
        },
        {
          '@type': 'type.googleapis.com/google.rpc.LocalizedMessage',
          message: 'Complete the item metadata.'
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [{ url: 'https://example.test/edit-item' }]
        }
      ]
    }
  };

  assert.match(formatChromePublishError(body), /Complete the item metadata/);
  assert.match(formatChromePublishError(body), /INVALID_ITEM_METADATA/);
  assert.match(formatChromePublishError(body), /https:\/\/example\.test\/edit-item/);
  assert.equal(formatChromePublishError({ error: { details: [] } }), '');
  assert.equal(formatChromePublishError({ error: { details: [{ '@type': 1 }] } }), '');
});

test('reads every supported Edge operation state exactly', () => {
  for (const state of Object.values(EDGE_OPERATION_STATES)) {
    assert.equal(getEdgeOperationState({ status: state }), state);
  }
});

test('returns an empty Edge operation state for malformed responses', () => {
  assert.equal(getEdgeOperationState({}), '');
  assert.equal(getEdgeOperationState({ status: 1 }), '');
  assert.equal(getEdgeOperationState(null), '');
});
