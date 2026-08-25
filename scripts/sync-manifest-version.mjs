import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertManifestTemplates,
  assertVersionsSynchronized,
  incrementVersion,
  materializeManifestVersion,
  validateVersion
} from './versioning.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readManifestTemplates = async sourceRoot => {
  const manifests = [
    {
      label: 'Chromium manifest template',
      path: resolve(sourceRoot, 'manifest.json')
    },
    {
      label: 'Firefox manifest template',
      path: resolve(sourceRoot, 'manifest.firefox.json')
    }
  ];

  return Promise.all(manifests.map(async entry => ({
    ...entry,
    manifest: await readJson(entry.path)
  })));
};

const validateManifestTemplates = templates => {
  assertManifestTemplates(templates.map(({ label, manifest }) => ({
    label,
    version: manifest.version
  })));
};

export const buildBrowserExtensions = async ({ sourceRoot, buildRoot, version }) => {
  validateVersion(version);

  const templates = await readManifestTemplates(sourceRoot);
  validateManifestTemplates(templates);

  const chromiumOutput = resolve(buildRoot, 'chromium');
  const firefoxOutput = resolve(buildRoot, 'firefox');
  const chromiumTemplatePath = templates[0].path;
  const firefoxTemplatePath = templates[1].path;

  await Promise.all([
    rm(chromiumOutput, { recursive: true, force: true }),
    rm(firefoxOutput, { recursive: true, force: true })
  ]);

  await cp(sourceRoot, chromiumOutput, {
    recursive: true,
    filter: source => source !== firefoxTemplatePath
  });
  await cp(sourceRoot, firefoxOutput, {
    recursive: true,
    filter: source => source !== chromiumTemplatePath && source !== firefoxTemplatePath
  });

  const chromiumManifestPath = resolve(chromiumOutput, 'manifest.json');
  const firefoxManifestPath = resolve(firefoxOutput, 'manifest.json');
  const chromiumManifest = materializeManifestVersion(templates[0].manifest, version);
  const firefoxManifest = materializeManifestVersion(templates[1].manifest, version);

  await Promise.all([
    writeJson(chromiumManifestPath, chromiumManifest),
    writeJson(firefoxManifestPath, firefoxManifest)
  ]);

  assertVersionsSynchronized(version, [
    { label: chromiumManifestPath, version: chromiumManifest.version },
    { label: firefoxManifestPath, version: firefoxManifest.version }
  ]);

  return { chromiumOutput, firefoxOutput };
};

export const runVersionCommand = async (rawArgs, root = projectRoot) => {
  const args = new Set(rawArgs);
  const unknownArgs = [...args].filter(arg => !['--check', '--increment'].includes(arg));
  if (unknownArgs.length) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }
  if (args.has('--check') && args.has('--increment')) {
    throw new Error('--check and --increment cannot be used together.');
  }

  const versionPath = resolve(root, 'version.json');
  const sourceRoot = resolve(root, 'src');
  const versionConfig = await readJson(versionPath);
  let version = versionConfig.version;
  validateVersion(version);

  const templates = await readManifestTemplates(sourceRoot);
  validateManifestTemplates(templates);

  if (args.has('--check')) {
    console.log(`Version source and manifest templates are valid: ${version}`);
    return version;
  }

  if (args.has('--increment')) {
    version = incrementVersion(version);
    versionConfig.version = version;
    await writeJson(versionPath, versionConfig);
    console.log(`Incremented extension version: ${version}`);
    return version;
  }

  await buildBrowserExtensions({
    sourceRoot,
    buildRoot: resolve(root, 'build'),
    version
  });
  console.log(`Built Chromium and Firefox extensions: ${version}`);
  return version;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runVersionCommand(process.argv.slice(2));
}
