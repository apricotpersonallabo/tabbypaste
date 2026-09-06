import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const composeArgs = ['compose', '-f', 'docker/compose.test.yml'];
const environment = {
  ...process.env,
  TEST_UID: typeof process.getuid === 'function' ? String(process.getuid()) : (process.env.TEST_UID || '1000'),
  TEST_GID: typeof process.getgid === 'function' ? String(process.getgid()) : (process.env.TEST_GID || '1000')
};

const runDocker = args => spawnSync('docker', [...composeArgs, ...args], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit'
});

const saveWebDriverLogs = () => {
  const result = spawnSync('docker', [
    ...composeArgs,
    'logs', '--no-color', 'chromium', 'firefox'
  ], {
    cwd: projectRoot,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const resultsRoot = resolve(projectRoot, 'test-results', 'e2e');
  mkdirSync(resultsRoot, { recursive: true });
  writeFileSync(
    resolve(resultsRoot, 'webdriver.log'),
    `${result.stdout || ''}${result.stderr || ''}`,
    'utf8'
  );
};

let status = 1;
try {
  const result = runDocker([
    'up',
    '--build',
    '--abort-on-container-exit',
    '--exit-code-from', 'tests',
    '--remove-orphans'
  ]);
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  if (status !== 0) {
    try {
      saveWebDriverLogs();
    } catch (error) {
      console.error(`Failed to save WebDriver logs: ${error.message}`);
    }
  }
  const cleanup = runDocker(['down', '--volumes', '--remove-orphans']);
  if (cleanup.error) console.error(`Failed to clean up test containers: ${cleanup.error.message}`);
  if (status === 0 && cleanup.status !== 0) status = cleanup.status ?? 1;
}

process.exit(status);
