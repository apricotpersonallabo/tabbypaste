import { readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDirectories = [
  ['scripts', new Set(['.mjs'])],
  ['src', new Set(['.js'])],
  ['docs/assets', new Set(['.js'])],
  ['tests', new Set(['.js', '.mjs'])]
];

const sourceFiles = [];
const collectSourceFiles = async (absoluteDirectory, extensions) => {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = resolve(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(entryPath, extensions);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      sourceFiles.push(entryPath);
    }
  }
};

for (const [directory, extensions] of sourceDirectories) {
  await collectSourceFiles(resolve(projectRoot, directory), extensions);
}

sourceFiles.sort();
for (const sourceFile of sourceFiles) {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, ['--check', sourceFile], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) process.exit(exitCode);
}

console.log(`JavaScript syntax is valid: ${sourceFiles.length} files`);
