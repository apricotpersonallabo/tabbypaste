import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const validateVersion = (version) => {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
    throw new Error(`Invalid browser extension version: ${version}`);
  }

  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535)) {
    throw new Error(`Version components must not exceed 65535: ${version}`);
  }

  return parts;
};

const incrementVersion = (version) => {
  const parts = validateVersion(version);
  while (parts.length < 3) parts.push(0);

  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index] < 65535) {
      parts[index]++;
      return parts.join('.');
    }
    parts[index] = 0;
  }

  throw new Error(`Version cannot be incremented further: ${version}`);
};

const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter(arg => arg !== '--increment');
if (unknownArgs.length) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

const versionConfig = await readJson(versionPath);
let version = versionConfig.version;
validateVersion(version);

if (args.has('--increment')) {
  version = incrementVersion(version);
  versionConfig.version = version;
  await writeJson(versionPath, versionConfig);
}

for (const manifestPath of manifestPaths) {
  const manifest = await readJson(manifestPath);
  manifest.version = version;
  await writeJson(manifestPath, manifest);
}

console.log(`Synchronized extension version: ${version}`);
