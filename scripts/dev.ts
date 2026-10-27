// Bun serves the JSON API while Vite serves the Svelte client.
import { fileURLToPath } from 'node:url';

process.env.CARETI_DEV_SERVER='1';
await import('../server/index');
const { createServer }=await import('vite');
const vite=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url)),server:{host:process.env.HOST||'127.0.0.1',port:4173,strictPort:true}});
await vite.listen();
vite.printUrls();
