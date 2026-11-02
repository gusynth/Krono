import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

// Processo descartável: só o proxy loopback da fixture, sem configuração do Windows.
const builderRequire = createRequire(createRequire(import.meta.url).resolve('app-builder-lib'));
const server = http.createServer((request, response) => {
  if (request.url !== 'http://krono-proxy.invalid/fixture') {
    response.writeHead(400).end();
    return;
  }
  response.end('krono proxy fixture');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${server.address().port}`;
  process.env.GLOBAL_AGENT_NO_PROXY = '';
  builderRequire('@electron/get').initializeProxy();
  const body = await new Promise((resolve, reject) => {
    const request = http.get('http://krono-proxy.invalid/fixture', (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    });
    request.setTimeout(5000, () => request.destroy(new Error('PROXY_TIMEOUT')));
    request.on('error', reject);
  });
  assert.equal(body, 'krono proxy fixture');
  console.log(
    'passed: downloader do empacotador usa proxy local com global-agent fixado; nenhum destino externo ou configuração do Windows',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
