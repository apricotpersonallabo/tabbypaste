import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

import {
  CHROMIUM_EXTENSION_ID,
  CHROMIUM_PUBLIC_KEY,
  E2E_SHORTCUT,
  FIREFOX_ADDON_ID,
  FIREFOX_EXTENSION_UUID
} from './e2e-configuration.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const buildRoot = resolve(projectRoot, 'build');
const e2eRoot = resolve(buildRoot, 'e2e');
const chromiumRoot = resolve(e2eRoot, 'chromium');
const firefoxRoot = resolve(e2eRoot, 'firefox');
const firefoxXpi = resolve(e2eRoot, 'tabbypaste-e2e-firefox.xpi');

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const run = async (command, args, options = {}) => {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command} exited with status ${exitCode}`);
};

const calculateChromiumId = publicKey => {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 16);
  return [...digest]
    .flatMap(byte => [byte >> 4, byte & 15])
    .map(value => String.fromCharCode(97 + value))
    .join('');
};

if (calculateChromiumId(CHROMIUM_PUBLIC_KEY) !== CHROMIUM_EXTENSION_ID) {
  throw new Error('The E2E Chromium public key does not match the configured extension ID.');
}

await rm(e2eRoot, { recursive: true, force: true });
await mkdir(e2eRoot, { recursive: true });
await Promise.all([
  cp(resolve(buildRoot, 'chromium'), chromiumRoot, { recursive: true }),
  cp(resolve(buildRoot, 'firefox'), firefoxRoot, { recursive: true })
]);

const [chromiumManifest, firefoxManifest] = await Promise.all([
  readJson(resolve(chromiumRoot, 'manifest.json')),
  readJson(resolve(firefoxRoot, 'manifest.json'))
]);

chromiumManifest.key = CHROMIUM_PUBLIC_KEY;
chromiumManifest.commands.auto_paste.suggested_key = { default: E2E_SHORTCUT };
firefoxManifest.commands.auto_paste.suggested_key = { default: E2E_SHORTCUT };

await Promise.all([
  writeJson(resolve(chromiumRoot, 'manifest.json'), chromiumManifest),
  writeJson(resolve(firefoxRoot, 'manifest.json'), firefoxManifest)
]);

await run('zip', ['-qr', firefoxXpi, '.'], { cwd: firefoxRoot });
await writeJson(resolve(e2eRoot, 'metadata.json'), {
  shortcut: E2E_SHORTCUT,
  chromium: {
    extensionId: CHROMIUM_EXTENSION_ID,
    extensionRoot: chromiumRoot
  },
  firefox: {
    addonId: FIREFOX_ADDON_ID,
    extensionUuid: FIREFOX_EXTENSION_UUID,
    xpi: firefoxXpi
  }
});

console.log(`Prepared Chromium and Firefox E2E extensions with ${E2E_SHORTCUT}.`);
