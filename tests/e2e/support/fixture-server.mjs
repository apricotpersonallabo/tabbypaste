import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

const fixturesRoot = resolve(import.meta.dirname, '..', 'fixtures');
const fixtureFiles = new Map([
  ['/', 'form.html'],
  ['/form.html', 'form.html'],
  ['/dynamic.html', 'dynamic.html'],
  ['/no-fields.html', 'no-fields.html']
]);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8']
]);

export const startFixtureServer = async () => {
  const certificateRoot = await mkdtemp(resolve(tmpdir(), 'tabbypaste-e2e-cert-'));
  const keyPath = resolve(certificateRoot, 'server-key.pem');
  const certificatePath = resolve(certificateRoot, 'server-cert.pem');
  const openssl = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certificatePath,
    '-days', '1',
    '-subj', '/CN=tests',
    '-addext', 'subjectAltName=DNS:tests'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (openssl.status !== 0) {
    await rm(certificateRoot, { recursive: true, force: true });
    throw new Error(`Could not create the E2E HTTPS certificate: ${openssl.stderr}`);
  }

  const server = createServer({
    key: await readFile(keyPath),
    cert: await readFile(certificatePath)
  }, async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(204);
      response.end();
      return;
    }
    const pathname = new URL(request.url || '/', 'https://tests').pathname;
    const fixtureName = fixtureFiles.get(pathname);
    if (!fixtureName) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      const fixturePath = resolve(fixturesRoot, fixtureName);
      response.writeHead(200, {
        'content-type': contentTypes.get(extname(fixturePath)) || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(await readFile(fixturePath));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(String(error));
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(4173, '0.0.0.0', resolveListen);
  });

  return {
    baseUrl: 'https://tests:4173',
    async close() {
      await new Promise((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose());
      });
      await rm(certificateRoot, { recursive: true, force: true });
    }
  };
};
