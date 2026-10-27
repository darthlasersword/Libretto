import { JsonPadStore } from './json-store';
import { createApi } from './api';
import assets from './desktop-assets.generated';

if (!process.env.RUNE_DATA_FILE) throw new Error('Desktop data path is required');
const store = await JsonPadStore.open(process.env.RUNE_DATA_FILE);
const api = createApi(store);
const server = Bun.serve({
 hostname: '127.0.0.1', port: 43187, maxRequestBodySize: 52_000_000,
 async fetch(req) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return api(req);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
  return asset ? new Response(Bun.file(asset)) : new Response('Not found', { status: 404 });
 }
});
// The parent owns our lifetime; closing its stdin also handles an unexpected exit.
void (async () => {
 const reader = Bun.stdin.stream().getReader();
 while (!(await reader.read()).done) { /* Keep the parent pipe open. */ }
 server.stop(true); process.exit(0);
})();
console.log(server.url.toString());
