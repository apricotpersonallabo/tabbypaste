import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
await rm(resolve(projectRoot, 'test-results', 'e2e'), { force: true, recursive: true });
const exitCode = await new Promise((resolveExit, reject) => {
  const child = spawn(process.execPath, [
    '--test',
    '--test-concurrency=2',
    'tests/e2e/chromium.test.mjs',
    'tests/e2e/firefox.test.mjs'
  ], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  child.once('error', reject);
  child.once('close', code => resolveExit(code ?? 1));
});

process.exit(exitCode);
