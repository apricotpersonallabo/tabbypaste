import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { buildBrowserExtensions } from './sync-manifest-version.mjs';
import { FIREFOX_ADDON_ID } from './e2e-configuration.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const buildRoot = resolve(projectRoot, 'build');
const distRoot = resolve(projectRoot, 'dist');
const resultsRoot = resolve(projectRoot, 'test-results');

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));

const run = async (command, args, options = {}) => {
  let stdout = '';
  let stderr = '';
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      ...options
    });
    if (options.capture) {
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) {
    if (stderr) process.stderr.write(stderr);
    throw new Error(`${command} exited with status ${exitCode}`);
  }
  return stdout;
};

const verifyPackage = async (archivePath, expectedVersion) => {
  await run('unzip', ['-tq', archivePath]);
  const entries = (await run('unzip', ['-Z1', archivePath], { capture: true }))
    .split(/\r?\n/)
    .map(entry => entry.replace(/^\.\//, ''))
    .filter(Boolean);

  if (entries.filter(entry => entry === 'manifest.json').length !== 1) {
    throw new Error(`${basename(archivePath)} must contain exactly one root manifest.json.`);
  }
  if (entries.some(entry => /(^|\/)manifest\.firefox\.json$/.test(entry))) {
    throw new Error(`${basename(archivePath)} contains manifest.firefox.json.`);
  }
  if (entries.some(entry => /(^|\/)node_modules\/|\.map$|(^|\/)\.DS_Store$|\.log$/.test(entry))) {
    throw new Error(`${basename(archivePath)} contains an excluded file.`);
  }

  const manifest = JSON.parse(await run('unzip', ['-p', archivePath, 'manifest.json'], { capture: true }));
  if (manifest.version !== expectedVersion) {
    throw new Error(`${basename(archivePath)} manifest version does not match ${expectedVersion}.`);
  }
  if (manifest.key || manifest.browser_specific_settings?.gecko?.id === FIREFOX_ADDON_ID) {
    throw new Error(`${basename(archivePath)} contains E2E-only manifest settings.`);
  }
};

const packageConfig = await readJson(resolve(projectRoot, 'package.json'));
const versionConfig = await readJson(resolve(projectRoot, 'version.json'));
const version = versionConfig.version;
const tag = `v${version}`;
const chromiumZip = `${packageConfig.name}-${tag}-chromium.zip`;
const firefoxZip = `${packageConfig.name}-${tag}-firefox.zip`;
const chromiumArchive = resolve(distRoot, chromiumZip);
const firefoxArchive = resolve(distRoot, firefoxZip);

await buildBrowserExtensions({
  sourceRoot: resolve(projectRoot, 'src'),
  buildRoot,
  version
});
await run('pnpm', ['exec', 'web-ext', 'lint', '--source-dir', resolve(buildRoot, 'firefox'), '--boring']);
await mkdir(distRoot, { recursive: true });
await Promise.all([
  rm(chromiumArchive, { force: true }),
  rm(firefoxArchive, { force: true })
]);
await run('zip', [
  '-qr', chromiumArchive, '.',
  '-x', 'node_modules/*', '*.map', '.DS_Store', '*.log'
], { cwd: resolve(buildRoot, 'chromium') });
await run('zip', [
  '-qr', firefoxArchive, '.',
  '-x', 'node_modules/*', '*.map', '.DS_Store', '*.log'
], { cwd: resolve(buildRoot, 'firefox') });
await Promise.all([
  verifyPackage(chromiumArchive, version),
  verifyPackage(firefoxArchive, version)
]);

await mkdir(resultsRoot, { recursive: true });
await writeFile(resolve(resultsRoot, 'package-metadata.json'), `${JSON.stringify({
  version,
  tag,
  chromiumZip,
  firefoxZip
}, null, 2)}\n`, 'utf8');

console.log(`Built and verified dist/${chromiumZip} and dist/${firefoxZip}.`);
