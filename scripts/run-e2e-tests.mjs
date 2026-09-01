import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { startFixtureServer } from '../tests/e2e/support/fixture-server.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
await rm(resolve(projectRoot, 'test-results', 'e2e'), { force: true, recursive: true });
const fixtureServer = await startFixtureServer();

let exitCode = 1;
try {
  exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [
      '--test',
      '--test-concurrency=2',
      'tests/e2e/chromium.test.mjs',
      'tests/e2e/firefox.test.mjs'
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_BASE_URL: fixtureServer.baseUrl
      },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
} finally {
  await fixtureServer.close();
}

process.exit(exitCode);
