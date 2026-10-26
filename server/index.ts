import { JsonPadStore } from './json-store';
import { createApi } from './api';
import { resolve, sep } from 'node:path';
import { access } from 'node:fs/promises';
const scriptsFile=resolve(import.meta.dir,'../data/scripts.json');
const previousFile=resolve(import.meta.dir,'../data/pads.json');
let defaultFile=scriptsFile;
try { await access(scriptsFile); } catch { try { await access(previousFile); defaultFile=previousFile; } catch { /* New library. */ } }
const store=await JsonPadStore.open(process.env.RUNE_DATA_FILE || process.env.LIBRETTO_DATA_FILE || process.env.CARETI_DATA_FILE || defaultFile);
const devOrigins=process.env.CARETI_DEV_SERVER==='1'?new Set(['http://127.0.0.1:4173','http://localhost:4173']):new Set<string>();
const api=createApi(store,devOrigins);
const root=resolve(import.meta.dir,'../dist');
const server=Bun.serve({hostname:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3001),maxRequestBodySize:52000000,async fetch(req){
 const url=new URL(req.url);
 if(url.pathname.startsWith('/api/')) return api(req);
 if(req.method!=='GET'&&req.method!=='HEAD') return new Response('Method not allowed',{status:405});
 let decoded:string;try{decoded=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
 const path=resolve(root,'.'+decoded);
 if(path!==root&&!path.startsWith(root+sep)) return new Response('Forbidden',{status:403});
 const file=Bun.file(path);
 if(await file.exists()) return new Response(file);
 if(url.pathname.includes('.')) return new Response('Not found',{status:404});
 const index=Bun.file(resolve(root,'index.html'));
 return await index.exists()?new Response(index):new Response('Frontend not built. Run bun run dev in another terminal.',{status:503});
}});
console.log(`Rune: ${server.url}`);
