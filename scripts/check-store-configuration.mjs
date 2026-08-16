import { appendFile } from 'node:fs/promises';

import {
  classifyStoreConfiguration,
  STORE_CONFIGURATION_STATES
} from './store-configuration.mjs';

const [storeLabel, ...environmentNames] = process.argv.slice(2);
if (!storeLabel || environmentNames.length === 0) {
  throw new Error(
    'Usage: node scripts/check-store-configuration.mjs <store-label> <environment-name...>'
  );
}

const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) throw new Error('GITHUB_OUTPUT is not set.');

let state;
try {
  state = classifyStoreConfiguration(environmentNames.map(name => process.env[name]));
} catch (error) {
  throw new Error(`${storeLabel} configuration is incomplete.`, { cause: error });
}

const enabled = state === STORE_CONFIGURATION_STATES.ENABLED;
await appendFile(outputPath, `enabled=${enabled}\n`, 'utf8');
if (!enabled) console.log(`::notice::${storeLabel} submission is disabled.`);
