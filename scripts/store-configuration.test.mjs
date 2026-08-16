import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyStoreConfiguration,
  STORE_CONFIGURATION_STATES
} from './store-configuration.mjs';

test('disables a store when every configuration value is absent', () => {
  assert.equal(
    classifyStoreConfiguration([undefined, '', '  ']),
    STORE_CONFIGURATION_STATES.DISABLED
  );
});

test('enables a store when every configuration value is present', () => {
  assert.equal(
    classifyStoreConfiguration(['client', 'secret', 'publisher']),
    STORE_CONFIGURATION_STATES.ENABLED
  );
});

test('rejects a partially configured store', () => {
  assert.throws(
    () => classifyStoreConfiguration(['client', '', 'publisher']),
    /Store configuration is incomplete \(2\/3 values set\)/
  );
});
