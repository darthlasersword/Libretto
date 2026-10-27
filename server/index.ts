import { JsonPadStore } from './json-store';
import { createApi } from './api';
import { chooseFolder } from './folder-picker';
import { resolve, sep, isAbsolute, dirname, join } from 'node:path';
import { access, readFile, writeFile, rename, mkdir, stat, open, rm } from 'node:fs/promises';
const scriptsFile=resolve(import.meta.dir,'../data/scripts.json');
const previousFile=resolve(import.meta.dir,'../data/pads.json');
let defaultFile=scriptsFile;
try { await access(scriptsFile); } catch { try { await access(previousFile); defaultFile=previousFile; } catch { /* New library. */ } }
const dataFile=process.env.RUNE_DATA_FILE || process.env.LIBRETTO_DATA_FILE || process.env.CARETI_DATA_FILE || defaultFile;
const configFile=resolve(dataFile)+'.location.json';
let config: { required: boolean; path: string };
try {
 config=JSON.parse(await readFile(configFile,'utf8'));
 if(typeof config.required!=='boolean' || typeof config.path!=='string' || !isAbsolute(config.path)) throw new Error('Invalid Rune storage configuration.');
} catch (error) {
 if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
 let existing=true;
 try { await access(dataFile); } catch (e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') existing=false; else throw e; }
 const dataDir=dirname(resolve(dataFile));
 const root=basenameForData(dataDir);
 config={required:!existing, path:join(root,'saves')};
 await saveConfig(config);
}
function basenameForData(dataDir:string) { return dataDir.split(sep).pop()==='data' ? dirname(dataDir) : dataDir; }
async function saveConfig(value:typeof config) {
 await mkdir(dirname(configFile),{recursive:true});
 const temp=configFile+'.'+crypto.randomUUID()+'.tmp';
 try { await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}); await rename(temp,configFile); }
 finally { await rm(temp,{force:true}); }
}
let store=await JsonPadStore.open(dataFile,config.path);
let configuring=false;
const setup={
 chooseFolder,
 status:()=>({...config}),
 async reset() {
  if(configuring) throw new Error('Storage is being set up.');
  const next={required:true,path:join(basenameForData(dirname(resolve(dataFile))),'saves')};
  await saveConfig(next); config=next;
 },
 async configure(path:string) {
  if(configuring || !config.required) throw new Error('Storage is already being set up.');
  configuring=true;
  try {
   if(!isAbsolute(path)) throw new Error('Enter an absolute folder path.');
   const folder=resolve(path);
   // The suggested default may not exist yet; other paths must already exist.
   if(folder===config.path) await mkdir(folder,{recursive:true});
   try { if(!(await stat(folder)).isDirectory()) throw new Error(); }
   catch { throw new Error('Choose an existing folder on the computer running Rune.'); }
   const probe=join(folder,'.rune-'+crypto.randomUUID()+'.tmp');
   try { const handle=await open(probe,'wx',0o600); await handle.close(); await rm(probe); }
   catch { throw new Error('Rune cannot write to this folder. Check its permissions.'); }
   const next=await JsonPadStore.open(dataFile,folder);
   const nextConfig={required:false,path:folder};
   await saveConfig(nextConfig); config=nextConfig; store=next; return next;
  } finally { configuring=false; }
 }
};
const devOrigins=process.env.CARETI_DEV_SERVER==='1'?new Set(['http://127.0.0.1:4173','http://localhost:4173']):new Set<string>();
const api=createApi(store,devOrigins,setup);
const root=resolve(import.meta.dir,'../dist');
const server=Bun.serve({hostname:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3001),maxRequestBodySize:52000000,async fetch(req,server){
 const url=new URL(req.url);
 // The native folder chooser can remain open longer than Bun's idle timeout.
 // The chooser itself has a five-minute timeout.
 if(url.pathname==='/api/setup/browse' && req.method==='POST') server.timeout(req,0);
 if(url.pathname.startsWith('/api/')) return api(req);
 if(req.method!=='GET'&&req.method!=='HEAD') return new Response('Method not allowed',{status:405});
 if(process.env.CARETI_DEV_SERVER==='1') {
  url.port='4173';
  return Response.redirect(url.toString(),302);
 }
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
