import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Pad, TrashedPad } from '../src/lib/types';

type Meta = Omit<Pad, 'content'> & { filename: string };
type TrashedMeta = Meta & { deleted_at: string };
type DataFile = { version: 3; scripts: Meta[]; trash: TrashedMeta[] };
const validId = /^[0-9a-f-]{36}$/i;
const validName = (name: unknown): name is string => typeof name === 'string' && name.endsWith('.md') && name !== '.md' && !/[\\/]/.test(name) && name !== '..md';
const isMeta = (item: unknown): item is Omit<Meta, 'filename'> => {
 if (!item || typeof item !== 'object') return false;
 const p = item as Record<string, unknown>;
 return typeof p.id === 'string' && validId.test(p.id) && typeof p.title === 'string' &&
  typeof p.pinned === 'boolean' && Number.isInteger(p.revision) &&
  typeof p.created_at === 'string' && typeof p.updated_at === 'string';
};
const clone = <T>(value: T): T => structuredClone(value);
const slug = (title: string) => (title.trim() || 'Untitled').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 180) || 'Untitled';
const metadata = ({content: _, ...rest}: Pad): Omit<Meta, 'filename'> => rest;

export class JsonPadStore {
 readonly path: string;
 readonly savesPath: string;
 readonly trashPath: string;
 private data: DataFile = { version: 3, scripts: [], trash: [] };
 private contents = new Map<string, string>();
 private pending: Promise<void> = Promise.resolve();
 private constructor(path: string) {
  this.path = resolve(path);
  const dataDir = dirname(this.path);
  const root = basename(dataDir) === 'data' ? dirname(dataDir) : dataDir;
  this.savesPath = join(root, 'saves');
  this.trashPath = join(root, 'trash');
 }
 private activePath(p: Meta) { return join(this.savesPath, p.filename); }
 private deletedPath(p: Meta) { return join(this.trashPath, p.filename); }
 private async filename(title: string, excludeId?: string): Promise<string> {
  const used = new Set(this.data.scripts.filter(p => p.id !== excludeId).map(p => p.filename.toLowerCase()));
  const existing = await readdir(this.savesPath).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return [] as string[]; throw e; });
  const current = excludeId && this.data.scripts.find(p => p.id === excludeId)?.filename;
  for (const name of existing) if (name !== current) used.add(name.toLowerCase());
  const base = slug(title);
  for (let n = 1;; n++) {
   const candidate = `${base}${n === 1 ? '' : ` (${n})`}.md`;
   if (!used.has(candidate.toLowerCase())) return candidate;
  }
 }
 private async trashFilename(title: string, excludeId?: string): Promise<string> {
  const used = new Set(this.data.trash.filter(p=>p.id!==excludeId).map(p=>p.filename.toLowerCase()));
  const existing = await readdir(this.trashPath).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [] as string[];throw e;});
  const current = excludeId && this.data.trash.find(p=>p.id===excludeId)?.filename;
  for(const name of existing) if(name!==current) used.add(name.toLowerCase());
  const base=slug(title);
  for(let n=1;;n++){const candidate=`${base}${n===1?'':` (${n})`}.md`;if(!used.has(candidate.toLowerCase()))return candidate;}
 }
 static async open(path: string): Promise<JsonPadStore> {
  const store = new JsonPadStore(path);
  let parsed: any;
  try { parsed = JSON.parse(await readFile(store.path, 'utf8')); }
  catch (error) {
   if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
   await store.persist(store.data); return store;
  }
  const scripts = Array.isArray(parsed?.scripts) ? parsed.scripts : parsed?.pads;
  const trash = parsed?.trash ?? [];
  if (!parsed || ![1,2,3].includes(parsed.version) || !Array.isArray(scripts) || !Array.isArray(trash) ||
   !scripts.every(isMeta) || !trash.every((p: unknown) => isMeta(p) && typeof (p as TrashedMeta).deleted_at === 'string') ||
   (parsed.version === 1 && ![...scripts,...trash].every((p: any) => typeof p.content === 'string')) ||
   (parsed.version === 3 && !scripts.every((p: any) => validName(p.filename)))) {
   throw new Error(`Invalid Rune data file: ${store.path}. Your file was left untouched.`);
  }
  if (parsed.version < 3) {
   const oldPaths: string[] = [];
   for (const p of scripts as Pad[]) {
    const content = parsed.version === 1 ? p.content : await readFile(join(store.savesPath, `${p.id}.md`), 'utf8');
    const filename = await store.filename(p.title);
    const meta = {...metadata({...p,content}),filename};
    await store.atomicWrite(store.activePath(meta),content);
    store.data.scripts.push(meta); store.contents.set(p.id,content);
    if (parsed.version === 2) oldPaths.push(join(store.savesPath, `${p.id}.md`));
   }
   for (const p of trash as TrashedPad[]) {
    const content = parsed.version === 1 ? p.content : await readFile(join(store.savesPath, `${p.id}.md`), 'utf8');
    const filename=await store.trashFilename(p.title);
    await store.atomicWrite(join(store.trashPath,filename),content);
    const {content: _,...rest} = p;
    store.data.trash.push({...rest,filename}); store.contents.set(p.id,content);
    if (parsed.version === 2) oldPaths.push(join(store.savesPath, `${p.id}.md`));
   }
   await store.persist(store.data);
   for (const old of oldPaths) await rm(old,{force:true});
  } else {
   store.data = {version:3,scripts:scripts as Meta[],trash:trash as TrashedMeta[]};
   for (const p of scripts as Meta[]) store.contents.set(p.id,await readFile(store.activePath(p),'utf8'));
   for (const p of trash as TrashedMeta[]) store.contents.set(p.id,await readFile(store.deletedPath(p),'utf8'));
   const obsolete:string[]=[];
   for(const p of store.data.trash){
    if(p.filename!==`${p.id}.md`)continue;
    const old=store.deletedPath(p);const filename=await store.trashFilename(p.title,p.id);
    await store.atomicWrite(join(store.trashPath,filename),store.contents.get(p.id)??'');
    p.filename=filename;obsolete.push(old);
   }
   if(obsolete.length){await store.persist(store.data);for(const path of obsolete)await rm(path,{force:true});}
  }
  return store;
 }
 private full(p: Meta): Pad { const {filename:_,...rest}=p;return {...clone(rest),content:this.contents.get(p.id) ?? ''}; }
 list(): Pad[] { return this.data.scripts.map(p=>this.full(p)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id)); }
 listTrash(): TrashedPad[] { return this.data.trash.map(p=>this.full(p) as TrashedPad).sort((a,b)=>b.deleted_at.localeCompare(a.deleted_at)||a.id.localeCompare(b.id)); }
 get(id:string):Pad|undefined { const p=this.data.scripts.find(p=>p.id===id);return p&&this.full(p); }
 async export(id:string):Promise<string|undefined> { const p=this.data.scripts.find(p=>p.id===id);return p&&readFile(this.activePath(p),'utf8'); }
 async create():Promise<Pad> { return this.mutate(async data=>{
  const now=new Date().toISOString();const pad:Pad={id:crypto.randomUUID(),title:'Untitled',content:'',pinned:false,revision:1,created_at:now,updated_at:now};
  const meta={...metadata(pad),filename:await this.filename(pad.title)};
  await this.atomicWrite(this.activePath(meta),'');data.scripts.push(meta);this.contents.set(pad.id,'');
  return {changed:true,result:pad};
 }); }
 async update(id:string,input:Pick<Pad,'title'|'content'|'pinned'|'revision'>):Promise<{status:'saved';pad:Pad}|{status:'conflict'|'missing'}> {
  return this.mutate<{status:'saved';pad:Pad}|{status:'conflict'|'missing'}>(async data=>{
   const p=data.scripts.find(p=>p.id===id);if(!p)return {changed:false,result:{status:'missing' as const}};
   if(p.revision!==input.revision)return {changed:false,result:{status:'conflict' as const}};
   const old=this.activePath(p);const title=input.title.trim()||'Untitled';
   const filename=title===p.title?p.filename:await this.filename(title,id);
   const next=join(this.savesPath,filename);
   if(next!==old || this.contents.get(id)!==input.content) await this.atomicWrite(next,input.content);
   p.title=title;p.filename=filename;p.pinned=input.pinned;p.revision++;p.updated_at=new Date().toISOString();
   this.contents.set(id,input.content);
   return {changed:true,result:{status:'saved' as const,pad:this.full(p)},remove:next===old?[]:[old]};
  });
 }
 async delete(id:string):Promise<boolean> { return this.mutate(async data=>{
  const index=data.scripts.findIndex(p=>p.id===id);if(index<0)return {changed:false,result:false};
  const p=data.scripts[index];const filename=await this.trashFilename(p.title);
  await this.atomicWrite(join(this.trashPath,filename),this.contents.get(id)??'');
  data.scripts.splice(index,1);data.trash.push({...p,filename,deleted_at:new Date().toISOString()});
  return {changed:true,result:true,remove:[this.activePath(p)]};
 }); }
 async restore(id:string):Promise<Pad|undefined> { return this.mutate(async data=>{
  const index=data.trash.findIndex(p=>p.id===id);if(index<0)return {changed:false,result:undefined};
  const p=data.trash[index];const filename=await this.filename(p.title);
  const {deleted_at:_,...rest}=p;const active={...rest,filename};
  await this.atomicWrite(this.activePath(active),this.contents.get(id)??'');
  data.trash.splice(index,1);data.scripts.push(active);
  return {changed:true,result:this.full(active),remove:[this.deletedPath(p)]};
 }); }
 async permanentlyDelete(ids:string[]):Promise<number> { return this.mutate(async data=>{
  const selected=new Set(ids);const removed=data.trash.filter(p=>selected.has(p.id));data.trash=data.trash.filter(p=>!selected.has(p.id));
  return {changed:removed.length>0,result:removed.length,remove:removed.map(p=>this.deletedPath(p)),forget:removed.map(p=>p.id)};
 }); }
 async emptyTrash():Promise<number> { return this.mutate(async data=>{
  const removed=data.trash;data.trash=[];
  return {changed:removed.length>0,result:removed.length,remove:removed.map(p=>this.deletedPath(p)),forget:removed.map(p=>p.id)};
 }); }
 private async mutate<T>(modify:(draft:DataFile)=>Promise<{changed:boolean;result:T;remove?:string[];forget?:string[]}>):Promise<T> {
  const work=this.pending.then(async()=>{
   const draft=clone(this.data);const {changed,result,remove,forget}=await modify(draft);
   if(changed){await this.persist(draft);this.data=draft;
    for(const path of remove??[]) await rm(path,{force:true});
    for(const id of forget??[]) this.contents.delete(id);
   }return result;
  });this.pending=work.then(()=>{},()=>{});return work;
 }
 private async persist(data:DataFile):Promise<void> { await this.atomicWrite(this.path,JSON.stringify(data,null,2)+'\n'); }
 private async atomicWrite(path:string,content:string):Promise<void> {
  await mkdir(dirname(path),{recursive:true});const temp=`${path}.${crypto.randomUUID()}.tmp`;
  try { const file=await open(temp,'wx',0o600);
   try { await file.writeFile(content,'utf8');await file.sync(); } finally { await file.close(); }
   await rename(temp,path);
  } catch(error) { await rm(temp,{force:true}).catch(()=>{});throw error; }
 }
}
