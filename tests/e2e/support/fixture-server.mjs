import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

const fixturesRoot = resolve(import.meta.dirname, '..', 'fixtures');
const fixtureFiles = new Map([
  ['/', 'form.html'],
  ['/form.html', 'form.html'],
  ['/dynamic.html', 'dynamic.html'],
  ['/frames.html', 'frames.html'],
  ['/frame-container.html', 'frame-container.html'],
  ['/legacy-frames.html', 'legacy-frames.html'],
  ['/legacy-nested-frames.html', 'legacy-nested-frames.html'],
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

  const serveFixture = async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url || '/', 'https://tests');
    const pathname = url.pathname;
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
        ...(url.searchParams.has('clipboardDenied') ? { 'permissions-policy': 'clipboard-read=()' } : {}),
        'cache-control': 'no-store'
      });
      response.end(await readFile(fixturePath));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(String(error));
    }
  };
  const server = createHttpsServer({
    key: await readFile(keyPath),
    cert: await readFile(certificatePath)
  }, serveFixture);
  const httpServer = createHttpServer(serveFixture);

  const listen = (server, port) => new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolveListen);
  });
  await listen(server, 4173);
  await listen(httpServer, 4174);

  return {
    baseUrl: 'https://tests:4173',
    httpBaseUrl: 'http://tests:4174',
    async close() {
      await Promise.all([server, httpServer].map(server => new Promise((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose());
      })));
      await rm(certificateRoot, { recursive: true, force: true });
    }
  };
};
