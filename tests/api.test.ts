import { afterAll, beforeAll, test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonPadStore } from '../server/json-store';
import { createApi } from '../server/api';
let dir:string, file:string, store:JsonPadStore, api:ReturnType<typeof createApi>;
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),'libretto-json-test-'));
 file=join(dir,'scripts.json');
 store=await JsonPadStore.open(file);
 expect(store.list()).toEqual([]);
 api=createApi(store);
});
afterAll(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
const req=(path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>api(new Request('http://localhost:3001/api'+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}));
test('Reset removes active and trashed files and persists an empty library',async()=>{
 const resetDir=await mkdtemp(join(tmpdir(),'rune-reset-test-'));
 try {
  const path=join(resetDir,'scripts.json');const resetStore=await JsonPadStore.open(path);const resetApi=createApi(resetStore);
  const active=await resetStore.create();const deleted=await resetStore.create();await resetStore.delete(deleted.id);
  const response=await resetApi(new Request('http://localhost:3001/api/reset',{method:'POST'}));
  expect(await response.json()).toEqual({reset:true});
  expect((await JsonPadStore.open(path)).list()).toEqual([]);expect((await JsonPadStore.open(path)).listTrash()).toEqual([]);
  expect(await readdir(resetStore.savesPath)).toEqual([]);expect(await readdir(resetStore.trashPath)).toEqual([]);
  expect(resetStore.get(active.id)).toBeUndefined();
 } finally {await rm(resetDir,{recursive:true,force:true});}
});
test('JSON persists Unicode and revisions across restart',async()=>{
 expect(await (await req('/health')).json()).toEqual({database:'json',ok:true});
 const created=await req('/pads','POST');expect(created.status).toBe(201);const pad=await created.json();
 const content='# Draft\n\n日本語 — café\n\n**Bold** and `code`.';
 const saved=await req('/pads/'+pad.id,'PUT',{...pad,title:"Writer's pad",content,pinned:true});expect(saved.status).toBe(200);
 const updated=await saved.json();expect(updated.revision).toBe(2);expect(updated.pinned).toBe(true);
 const raw=JSON.parse(await readFile(file,'utf8'));
 expect(raw.version).toBe(3);
 expect(raw.scripts.find((p:any)=>p.id===pad.id).content).toBeUndefined();
 expect(await readFile(join(dir,'saves',"Writer's pad.md"),'utf8')).toBe(content);
 expect(await (await req('/pads/'+pad.id+'/export')).text()).toBe(content);
 expect((await JsonPadStore.open(file)).get(pad.id)?.content).toBe(content);
 expect((await req('/pads/'+pad.id,'PUT',{...pad,content:'stale'})).status).toBe(409);
 expect((await (await req('/pads')).json()).some((p:any)=>p.id===pad.id)).toBe(true);
 expect((await req('/pads/'+pad.id,'DELETE')).status).toBe(204);
 expect((await readdir(join(dir,'saves'))).includes("Writer's pad.md")).toBe(false);
 expect(await readFile(join(dir,'trash',"Writer's pad.md"),'utf8')).toBe(content);
 expect((await JsonPadStore.open(file)).get(pad.id)).toBeUndefined();
 expect((await req('/pads/'+pad.id+'/export')).status).toBe(404);
 expect((await readdir(dir)).filter(n=>n.endsWith('.tmp'))).toEqual([]);
});
test('Simultaneous saves serialize; only one stale revision commits',async()=>{
 const pad=await (await req('/pads','POST')).json();
 const [a,b]=await Promise.all([req('/pads/'+pad.id,'PUT',{...pad,content:'first'}),req('/pads/'+pad.id,'PUT',{...pad,content:'second'})]);
 expect([a.status,b.status].sort()).toEqual([200,409]);
 expect((await (await req('/pads/'+pad.id)).json()).revision).toBe(2);
 await req('/pads/'+pad.id,'DELETE');
});
test('Titles name active files, collisions get suffixes, and Trash moves content',async()=>{
 const a=await store.create();const b=await store.create();
 expect((await readdir(join(dir,'saves'))).filter(n=>n.startsWith('Untitled'))).toEqual(['Untitled (2).md','Untitled.md']);
 const renamed=await (await req('/pads/'+a.id,'PUT',{...a,title:'Notes',content:'first'})).json();
 expect(await readFile(join(dir,'saves','Notes.md'),'utf8')).toBe('first');
 expect((await readdir(join(dir,'saves'))).includes('Untitled.md')).toBe(false);
 await req('/pads/'+a.id,'DELETE');
 expect((await readdir(join(dir,'saves'))).includes('Notes.md')).toBe(false);
 expect(await readFile(join(dir,'trash','Notes.md'),'utf8')).toBe('first');
 await req('/trash/'+a.id+'/restore','POST');
 expect(await readFile(join(dir,'saves','Notes.md'),'utf8')).toBe('first');
 expect((await readdir(join(dir,'trash'))).includes('Notes.md')).toBe(false);
 await req('/pads/'+renamed.id,'DELETE');await req('/pads/'+b.id,'DELETE');
});
test('Reject invalid input, malformed JSON, and cross-origin writes',async()=>{
 const pad=await (await req('/pads','POST')).json();
 expect((await req('/pads/'+pad.id,'PUT',{...pad,title:'x'.repeat(201)})).status).toBe(400);
 expect((await req('/pads/'+pad.id,'PUT',{...pad,pinned:'yes'})).status).toBe(400);
 expect((await req('/pads/'+pad.id,'PUT',{...pad,content:'x'.repeat(2_000_001)})).status).toBe(400);
 expect((await req('/pads/not-a-uuid')).status).toBe(404);
 expect((await req('/pads','POST',undefined,{origin:'https://untrusted.example'})).status).toBe(403);
 const response=await api(new Request('http://localhost:3001/api/pads/'+pad.id,{method:'PUT',body:'{oops'}));expect(response.status).toBe(400);
 await req('/pads/'+pad.id,'DELETE');
});
test('Explicit development origin is allowed without allowing arbitrary origins',async()=>{
 const devApi=createApi(store,new Set(['http://localhost:4173']));
 const response=await devApi(new Request('http://localhost:3001/api/pads',{method:'POST',headers:{origin:'http://localhost:4173'}}));
 expect(response.status).toBe(201);const pad=await response.json();await req('/pads/'+pad.id,'DELETE');
});
test('Empty database stays empty; corrupt JSON is never overwritten',async()=>{
 const another=join(dir,'empty.json');
 const empty=await JsonPadStore.open(another);
 for(const pad of empty.list()) await empty.delete(pad.id);
 expect((await JsonPadStore.open(another)).list()).toEqual([]);
 const bad=join(dir,'invalid.json');await writeFile(bad,'{ broken data');
 await expect(JsonPadStore.open(bad)).rejects.toThrow();
 expect(await readFile(bad,'utf8')).toBe('{ broken data');
});
test('Previous JSON shape upgrades without losing a file',async()=>{
 const previous=join(dir,'previous.json');
 const existing=await store.create();
 await writeFile(previous,JSON.stringify({version:1,pads:[existing]}));
 const loaded=await JsonPadStore.open(previous);
 expect(loaded.get(existing.id)?.title).toBe(existing.title);
 expect(JSON.parse(await readFile(previous,'utf8')).scripts[0].content).toBeUndefined();
 expect(await readFile(join(dir,'saves','Untitled.md'),'utf8')).toBe(existing.content);
 await store.delete(existing.id);
});
test('Partially migrated version 2 data opens title-based files without losing content',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rune-partial-migration-'));
 try {
  const index=join(root,'data','scripts.json');
  const active={id:crypto.randomUUID(),title:'Hello',pinned:false,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const deleted={...active,id:crypto.randomUUID(),title:'Old note',deleted_at:new Date().toISOString()};
  await mkdir(join(root,'data'),{recursive:true});
  await mkdir(join(root,'saves'));await mkdir(join(root,'trash'));
  await writeFile(index,JSON.stringify({version:2,scripts:[active],trash:[deleted]}));
  await writeFile(join(root,'saves','Hello.md'),'kept active');
  await writeFile(join(root,'trash','Old note.md'),'kept deleted');
  const recovered=await JsonPadStore.open(index);
  expect(recovered.get(active.id)?.content).toBe('kept active');
  expect(recovered.listTrash()[0]?.content).toBe('kept deleted');
  expect(JSON.parse(await readFile(index,'utf8')).version).toBe(3);
  expect((await JsonPadStore.open(index)).get(active.id)?.content).toBe('kept active');
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('Backup restores active files and Trash as copies without changing existing work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rune-backup-test-'));
 try {
  const source=await JsonPadStore.open(join(root,'source','data','scripts.json'));
  const active=await source.create();
  await source.update(active.id,{...active,title:'Draft',content:'Before edit'});
  const old=await source.create();
  await source.update(old.id,{...old,title:'Deleted',content:'Recover me'});
  await source.delete(old.id);
  const backup=await source.backup();
  expect(backup.scripts[0].content).toBe('Before edit');
  expect(backup.trash[0].content).toBe('Recover me');
  await source.update(active.id,{...source.get(active.id)!,content:'After edit'});
  const result=await source.importBackup(backup);
  expect(result).toEqual({scripts:1,trash:1});
  expect(source.get(active.id)?.content).toBe('After edit');
  expect(source.list().map(p=>p.content).sort()).toEqual(['After edit','Before edit']);
  expect(source.listTrash()).toHaveLength(2);
  const reopened=await JsonPadStore.open(join(root,'source','data','scripts.json'));
  expect(reopened.list().map(p=>p.content).sort()).toEqual(['After edit','Before edit']);
  expect(reopened.listTrash().map(p=>p.content)).toEqual(['Recover me','Recover me']);
  const before=await readFile(join(root,'source','data','scripts.json'),'utf8');
  await expect(source.importBackup({...backup,scripts:[{...backup.scripts[0],content:12}]})).rejects.toThrow('Invalid Rune backup file');
  expect(await readFile(join(root,'source','data','scripts.json'),'utf8')).toBe(before);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('Backup API accepts a valid archive and rejects invalid imports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rune-backup-api-'));
 try {
  const backupStore=await JsonPadStore.open(join(root,'data','scripts.json'));
  const backupApi=createApi(backupStore);
  const pad=await backupStore.create();
  await backupStore.update(pad.id,{...pad,title:'Transfer',content:'portable'});
  const get=await backupApi(new Request('http://localhost/api/backup'));
  expect(get.status).toBe(200);
  const archive=await get.json();
  const post=await backupApi(new Request('http://localhost/api/backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(archive)}));
  expect(post.status).toBe(200);
  expect(await post.json()).toEqual({scripts:1,trash:0});
  expect(backupStore.list().map(p=>p.content)).toEqual(['portable','portable']);
  const invalid=await backupApi(new Request('http://localhost/api/backup',{method:'POST',body:'{"kind":"wrong"}'}));
  expect(invalid.status).toBe(400);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('Trash persists, restores files, and permanently deletes selected or all',async()=>{
 const trashFile=join(dir,'trash.json');
 const trashStore=await JsonPadStore.open(trashFile);
 const trashApi=createApi(trashStore);
 const req=(path:string,method='GET',body?:unknown)=>trashApi(new Request('http://localhost:3001/api'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
 const first=await (await req('/pads','POST')).json();
 const second=await (await req('/pads','POST')).json();
 expect((await req('/pads/'+first.id,'DELETE')).status).toBe(204);
 expect((await req('/pads/'+second.id,'DELETE')).status).toBe(204);
 expect((await req('/pads/'+first.id)).status).toBe(404);
 expect((await (await req('/trash')).json()).map((p:any)=>p.id).sort()).toEqual([first.id,second.id].sort());
 expect((await JsonPadStore.open(trashFile)).listTrash()).toHaveLength(2);
 const restored=await req('/trash/'+first.id+'/restore','POST');
 expect(restored.status).toBe(200);
 expect((await restored.json()).id).toBe(first.id);
 expect((await req('/trash/'+first.id+'/restore','POST')).status).toBe(404);
 const secondName=JSON.parse(await readFile(trashFile,'utf8')).trash.find((p:any)=>p.id===second.id).filename;
 expect((await req('/trash/delete','POST',{ids:[second.id]})).status).toBe(204);
 expect((await readdir(join(dir,'trash'))).includes(secondName)).toBe(false);
 expect((await (await req('/trash')).json())).toEqual([]);
 await req('/pads/'+first.id,'DELETE');
 expect((await req('/trash','DELETE')).status).toBe(204);
 expect((await JsonPadStore.open(trashFile)).listTrash()).toEqual([]);
 expect((await req('/trash/delete','POST',{ids:['bad']})).status).toBe(400);
});

test('A chosen storage folder persists scripts without overwriting existing files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rune-chosen-folder-'));
 try {
  const folder=join(root,'my files');const index=join(root,'data','scripts.json');
  await mkdir(folder);await writeFile(join(folder,'Untitled.md'),'existing file');
  const chosen=await JsonPadStore.open(index,folder);
  const pad=await chosen.create();
  expect(await readFile(join(folder,'Untitled.md'),'utf8')).toBe('existing file');
  expect(await readFile(join(folder,'Untitled (2).md'),'utf8')).toBe('');
  const saved=await chosen.update(pad.id,{...pad,content:'Hello'});
  expect(saved.status).toBe('saved');
  expect((await JsonPadStore.open(index,folder)).get(pad.id)?.content).toBe('Hello');
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('Folder browsing returns the selection or cancellation and rejects cross-origin requests',async()=>{
 let selected:string|null='/home/example/My Notes';
 let calls=0;
 const setup={status:()=>({required:true,path:'/default'}),configure:async()=>store,chooseFolder:async()=>{calls++;return selected;}};
 const chooserApi=createApi(store,new Set(),setup);
 const browse=(origin?:string)=>chooserApi(new Request('http://localhost:3001/api/setup/browse',{method:'POST',headers:origin?{origin}:{}}));
 expect(await (await browse()).json()).toEqual({path:selected});
 selected=null;
 expect(await (await browse()).json()).toEqual({path:null});
 expect((await browse('https://untrusted.example')).status).toBe(403);
 expect(calls).toBe(2);
});
