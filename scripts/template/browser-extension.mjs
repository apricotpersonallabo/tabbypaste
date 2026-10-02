import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, '..', '..');
const sourceRoot = resolve(projectRoot, 'templates', 'browser-extension');
const packagesRoot = resolve(projectRoot, 'templates', 'packages');
const archivePath = resolve(packagesRoot, 'browser-extension-template.zip');
const archiveRootName = 'browser-extension-template';
const excludedDirectories = new Set([
  '.cache',
  '.git',
  '.nyc_output',
  '.pnpm-store',
  'artifacts',
  'coverage',
  'node_modules',
  'playwright-report'
]);

const toArchivePath = sourcePath => (
  `${archiveRootName}/${relative(sourceRoot, sourcePath).split(sep).join('/')}`
);

const shouldInclude = sourcePath => {
  const relativePath = relative(sourceRoot, sourcePath);
  if (!relativePath) return true;
  const parts = relativePath.split(sep);
  if (parts.some(part => excludedDirectories.has(part))) return false;

  const name = parts.at(-1);
  return name !== '.DS_Store'
    && !name.endsWith('.log')
    && !name.endsWith('.crx')
    && !name.endsWith('.xpi');
};

const collectSourceFiles = async (directory = sourceRoot) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (!shouldInclude(entryPath)) continue;
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort();
};

const readArchiveEntries = async () => {
  const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout
    .split(/\r?\n/)
    .filter(entry => entry && !entry.endsWith('/'))
    .sort();
};

const checkArchive = async () => {
  const sourceFiles = await collectSourceFiles();
  const expectedEntries = sourceFiles.map(toArchivePath).sort();
  const archiveEntries = await readArchiveEntries();
  if (JSON.stringify(archiveEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error('Template archive file list does not match templates/browser-extension/.');
  }

  for (let index = 0; index < sourceFiles.length; index++) {
    const [sourceContents, archivedContents] = await Promise.all([
      readFile(sourceFiles[index]),
      execFileAsync('unzip', ['-p', archivePath, expectedEntries[index]], {
        encoding: null,
        maxBuffer: 20 * 1024 * 1024
      }).then(result => result.stdout)
    ]);
    if (!sourceContents.equals(archivedContents)) {
      throw new Error(`Template archive content differs: ${expectedEntries[index]}`);
    }
  }

  console.log('Template source and templates/packages/browser-extension-template.zip are synchronized.');
};

const packageArchive = async () => {
  const stagingRoot = await mkdtemp(join(tmpdir(), 'tabbypaste-template-'));
  try {
    const stagedSource = resolve(stagingRoot, archiveRootName);
    await cp(sourceRoot, stagedSource, {
      recursive: true,
      filter: shouldInclude
    });
    await mkdir(packagesRoot, { recursive: true });
    await rm(archivePath, { force: true });
    await execFileAsync('zip', ['-X', '-qr', archivePath, archiveRootName], {
      cwd: stagingRoot,
      maxBuffer: 10 * 1024 * 1024
    });
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }

  await checkArchive();
};

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/template/browser-extension.mjs [--check]');
}

if (args[0] === '--check') {
  await checkArchive();
} else {
  await packageArchive();
}
