import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runVersionCommand } from './sync-manifest-version.mjs';
import {
  MANIFEST_TEMPLATE_VERSION,
  assertManifestTemplates,
  assertVersionsSynchronized,
  incrementVersion,
  materializeManifestVersion,
  validateVersion
} from './versioning.mjs';

const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));

const createVersionFixture = async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tabbypaste-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sourceRoot = path.join(root, 'src');
  await mkdir(path.join(sourceRoot, 'nested'), { recursive: true });
  await Promise.all([
    writeJson(path.join(root, 'version.json'), { version: '1.0.13' }),
    writeJson(path.join(sourceRoot, 'manifest.json'), {
      manifest_version: 3,
      version: MANIFEST_TEMPLATE_VERSION,
      name: 'Chromium fixture'
    }),
    writeJson(path.join(sourceRoot, 'manifest.firefox.json'), {
      manifest_version: 3,
      version: MANIFEST_TEMPLATE_VERSION,
      name: 'Firefox fixture',
      browser_specific_settings: { gecko: { id: 'fixture@example.com' } }
    }),
    writeFile(path.join(sourceRoot, 'nested', 'background.js'), 'void 0;\n', 'utf8')
  ]);

  return { root, sourceRoot };
};

test('validates supported browser extension versions', () => {
  assert.deepEqual(validateVersion('1.0.12'), [1, 0, 12]);
  assert.deepEqual(validateVersion('1.2.3.4'), [1, 2, 3, 4]);
});

test('rejects invalid browser extension versions', () => {
  for (const version of ['', '01.2.3', '1.2.3.4.5', '1.2.beta', '1.65536.0']) {
    assert.throws(() => validateVersion(version), /Invalid browser extension version|must not exceed/);
  }
});

test('increments versions and carries overflowing components', () => {
  assert.equal(incrementVersion('1.0.11'), '1.0.12');
  assert.equal(incrementVersion('1.2.65535'), '1.3.0');
  assert.equal(incrementVersion('1.65535.65535'), '2.0.0');
});

test('requires source manifests to keep the valid dummy version', () => {
  assert.doesNotThrow(() => assertManifestTemplates([
    { label: 'Chromium manifest', version: MANIFEST_TEMPLATE_VERSION },
    { label: 'Firefox manifest', version: MANIFEST_TEMPLATE_VERSION }
  ]));
  assert.throws(() => assertManifestTemplates([
    { label: 'Chromium manifest', version: '1.0.13' }
  ]), /must remain the template value 0\.0\.0\.1/);
});

test('materializes a release version without mutating the template object', () => {
  const template = { manifest_version: 3, version: MANIFEST_TEMPLATE_VERSION };
  const materialized = materializeManifestVersion(template, '1.0.13');
  assert.equal(template.version, MANIFEST_TEMPLATE_VERSION);
  assert.equal(materialized.version, '1.0.13');
});

test('accepts synchronized manifest versions', () => {
  assert.doesNotThrow(() => assertVersionsSynchronized('1.0.12', [
    { label: 'Chromium manifest', version: '1.0.12' },
    { label: 'Firefox manifest', version: '1.0.12' }
  ]));
});

test('rejects mismatched manifest versions', () => {
  assert.throws(() => assertVersionsSynchronized('1.0.12', [
    { label: 'Chromium manifest', version: '1.0.11' },
    { label: 'Firefox manifest', version: '1.0.12' }
  ]), /Chromium manifest version 1\.0\.11 does not match version\.json 1\.0\.12/);
});

test('builds both browser directories from dummy templates using version.json', async t => {
  const { root, sourceRoot } = await createVersionFixture(t);
  const buildRoot = path.join(root, 'build');

  await writeJson(path.join(root, 'version.json'), { version: '1.0.14' });
  await runVersionCommand([], root);

  const chromiumManifest = await readJson(path.join(buildRoot, 'chromium', 'manifest.json'));
  const firefoxManifest = await readJson(path.join(buildRoot, 'firefox', 'manifest.json'));
  const chromiumTemplate = await readJson(path.join(sourceRoot, 'manifest.json'));
  const firefoxTemplate = await readJson(path.join(sourceRoot, 'manifest.firefox.json'));

  assert.equal(chromiumManifest.version, '1.0.14');
  assert.equal(firefoxManifest.version, '1.0.14');
  assert.equal(chromiumTemplate.version, MANIFEST_TEMPLATE_VERSION);
  assert.equal(firefoxTemplate.version, MANIFEST_TEMPLATE_VERSION);
  assert.equal(firefoxManifest.browser_specific_settings.gecko.id, 'fixture@example.com');
  await assert.rejects(access(path.join(buildRoot, 'chromium', 'manifest.firefox.json')));
  await assert.rejects(access(path.join(buildRoot, 'firefox', 'manifest.firefox.json')));
  await access(path.join(buildRoot, 'chromium', 'nested', 'background.js'));
  await access(path.join(buildRoot, 'firefox', 'nested', 'background.js'));
});

test('increments only version.json and rejects changed template versions', async t => {
  const { root, sourceRoot } = await createVersionFixture(t);

  assert.equal(await runVersionCommand(['--increment'], root), '1.0.14');
  assert.equal((await readJson(path.join(root, 'version.json'))).version, '1.0.14');
  assert.equal((await readJson(path.join(sourceRoot, 'manifest.json'))).version, MANIFEST_TEMPLATE_VERSION);
  assert.equal(
    (await readJson(path.join(sourceRoot, 'manifest.firefox.json'))).version,
    MANIFEST_TEMPLATE_VERSION
  );

  const chromiumTemplatePath = path.join(sourceRoot, 'manifest.json');
  const chromiumTemplate = await readJson(chromiumTemplatePath);
  chromiumTemplate.version = '1.0.14';
  await writeJson(chromiumTemplatePath, chromiumTemplate);
  await assert.rejects(runVersionCommand(['--check'], root), /must remain the template value/);
  await assert.rejects(runVersionCommand([], root), /must remain the template value/);
  await assert.rejects(access(path.join(root, 'build', 'chromium')));
});

test('rejects invalid version.json before creating build output', async t => {
  const { root } = await createVersionFixture(t);
  await writeJson(path.join(root, 'version.json'), { version: '1.0.invalid' });

  await assert.rejects(runVersionCommand([], root), /Invalid browser extension version/);
  await assert.rejects(access(path.join(root, 'build', 'chromium')));
});
