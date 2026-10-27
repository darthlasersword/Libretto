import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = await mkdtemp(join(tmpdir(), 'rune-desktop-'));
let child: ReturnType<typeof Bun.spawn> | undefined;
async function start() {
 child = Bun.spawn([resolve('src-tauri/binaries/rune-server.exe')], { env: {...process.env, RUNE_DATA_FILE: join(root,'data/scripts.json')}, stdin:'pipe', stdout:'pipe', stderr:'inherit' });
 const reader = child.stdout.getReader();
 let timer: ReturnType<typeof setTimeout>;
 const output = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000); })]).finally(() => clearTimeout(timer));
 const url = new TextDecoder().decode(output.value).trim();
 assert.equal(url, 'http://127.0.0.1:43187/');
 return url;
}
async function stop() { child?.stdin.end(); await child?.exited; child=undefined; }
try {
 const base=await start();
 assert.equal((await fetch(base+'api/health')).status,200);
 const html=await (await fetch(base)).text();
 const asset=html.match(/src="([^"]+\.js)"/)![1];
 const js=await fetch(new URL(asset,base));
 assert.match(js.headers.get('content-type')!, /javascript/);
 assert.ok((await js.text()).length>1000);
 const pad=await (await fetch(base+'api/pads',{method:'POST'})).json();
 const save=await fetch(base+'api/pads/'+pad.id,{method:'PUT',headers:{'content-type':'application/json',origin:base.slice(0,-1)},body:JSON.stringify({...pad,title:'Desktop smoke',content:'# Windows \u2713'})});
 assert.equal(save.status,200);
 await stop();
 await start();
 const saved=await (await fetch(base+'api/pads/'+pad.id)).json();
 assert.equal(saved.content,'# Windows \u2713');
 assert.equal(saved.title,'Desktop smoke');
 console.log('Compiled desktop server: assets, MIME, create, save, restart persistence, and shutdown passed.');
} finally { await stop(); await rm(root,{recursive:true,force:true}); }
