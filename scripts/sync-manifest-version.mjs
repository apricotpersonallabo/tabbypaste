import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertVersionsSynchronized,
  incrementVersion,
  validateVersion
} from './versioning.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = resolve(projectRoot, 'version.json');
const manifestPaths = [
  resolve(projectRoot, 'src', 'manifest.json'),
  resolve(projectRoot, 'src', 'manifest.firefox.json')
];

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter(arg => !['--check', '--increment'].includes(arg));
if (unknownArgs.length) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}
if (args.has('--check') && args.has('--increment')) {
  throw new Error('--check and --increment cannot be used together.');
}

const versionConfig = await readJson(versionPath);
let version = versionConfig.version;
validateVersion(version);

const manifests = await Promise.all(manifestPaths.map(async manifestPath => ({
  manifestPath,
  manifest: await readJson(manifestPath)
})));

if (args.has('--check')) {
  assertVersionsSynchronized(version, manifests.map(({ manifestPath, manifest }) => ({
    label: manifestPath,
    version: manifest.version
  })));
  console.log(`Version files are synchronized: ${version}`);
  process.exit(0);
}

if (args.has('--increment')) {
  version = incrementVersion(version);
  versionConfig.version = version;
  await writeJson(versionPath, versionConfig);
}

for (const { manifestPath, manifest } of manifests) {
  manifest.version = version;
  await writeJson(manifestPath, manifest);
}

console.log(`Synchronized extension version: ${version}`);
