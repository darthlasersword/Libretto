import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Pad, TrashedPad } from '../src/lib/types';

type DataFile = { version: 1; scripts: Pad[]; trash: TrashedPad[] };
const isPad = (item: unknown): item is Pad => {
 if (!item || typeof item !== 'object') return false;
 const p = item as Record<string, unknown>;
 return typeof p.id === 'string' && /^[0-9a-f-]{36}$/i.test(p.id) &&
  typeof p.title === 'string' && typeof p.content === 'string' &&
  typeof p.pinned === 'boolean' && Number.isInteger(p.revision) &&
  typeof p.created_at === 'string' && typeof p.updated_at === 'string';
};
const clone = <T>(value: T): T => structuredClone(value);

export class JsonPadStore {
 readonly path: string;
 private data: DataFile = { version: 1, scripts: [], trash: [] };
 private pending: Promise<void> = Promise.resolve();
 private constructor(path: string) { this.path = resolve(path); }

 static async open(path: string): Promise<JsonPadStore> {
  const store = new JsonPadStore(path);
  try {
   const parsed: unknown = JSON.parse(await readFile(store.path, 'utf8'));
   const file = parsed as Partial<DataFile> & { pads?: unknown };
   const scripts = Array.isArray(file?.scripts) ? file.scripts : file?.pads;
   if (!file || file.version !== 1 || !Array.isArray(scripts) || !scripts.every(isPad) || (file.trash !== undefined && (!Array.isArray(file.trash) || !file.trash.every((p: unknown) => isPad(p) && typeof (p as TrashedPad).deleted_at === 'string')))) {
    throw new Error(`Invalid Libretto data file: ${store.path}. Your file was left untouched.`);
   }
   store.data = {version: 1, scripts, trash: file.trash ?? []};
   if (!Array.isArray(file.scripts) || !Array.isArray(file.trash)) await store.persist(store.data);
  } catch (error) {
   if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
   const first: DataFile = { version: 1, scripts: [], trash: [] };
   await store.persist(first);
   store.data = first;
  }
  return store;
 }

 list(): Pad[] {
  return clone([...this.data.scripts].sort((a,b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)));
 }
 listTrash(): TrashedPad[] {
  return clone([...this.data.trash].sort((a,b) => b.deleted_at.localeCompare(a.deleted_at) || a.id.localeCompare(b.id)));
 }
 get(id: string): Pad | undefined {
  const pad = this.data.scripts.find(p => p.id === id);
  return pad && clone(pad);
 }
 async create(): Promise<Pad> {
  return this.mutate(data => {
   const now = new Date().toISOString();
   const pad: Pad = {id: crypto.randomUUID(), title:'Untitled',content:'',pinned:false,revision:1,created_at:now,updated_at:now};
   data.scripts.push(pad);
   return {changed:true, result:clone(pad)};
  });
 }
 async update(id: string, input: Pick<Pad,'title'|'content'|'pinned'|'revision'>): Promise<{status:'saved'; pad:Pad} | {status:'conflict'|'missing'}> {
  return this.mutate<{status:'saved'; pad:Pad} | {status:'conflict'|'missing'}>(data => {
   const pad = data.scripts.find(p => p.id === id);
   if (!pad) return {changed:false,result:{status:'missing' as const}};
   if (pad.revision !== input.revision) return {changed:false,result:{status:'conflict' as const}};
   pad.title = input.title.trim() || 'Untitled';
   pad.content = input.content;
   pad.pinned = input.pinned;
   pad.revision++;
   pad.updated_at = new Date().toISOString();
   return {changed:true,result:{status:'saved' as const,pad:clone(pad)}};
  });
 }
 async delete(id: string): Promise<boolean> {
  return this.mutate(data => {
   const index = data.scripts.findIndex(p => p.id === id);
   if (index === -1) return {changed:false,result:false};
   const [pad] = data.scripts.splice(index,1);
   data.trash.push({...pad,deleted_at:new Date().toISOString()});
   return {changed:true,result:true};
  });
 }
 async restore(id:string):Promise<Pad|undefined> {
  return this.mutate(data => {
   const index=data.trash.findIndex(p=>p.id===id);
   if(index===-1) return {changed:false,result:undefined};
   const {deleted_at:_,...pad}=data.trash.splice(index,1)[0];
   data.scripts.push(pad);
   return {changed:true,result:clone(pad)};
  });
 }
 async permanentlyDelete(ids:string[]):Promise<number> {
  return this.mutate(data => {
   const selected=new Set(ids);
   const before=data.trash.length;
   data.trash=data.trash.filter(p=>!selected.has(p.id));
   return {changed:before!==data.trash.length,result:before-data.trash.length};
  });
 }
 async emptyTrash():Promise<number> {
  return this.mutate(data => {
   const count=data.trash.length;
   data.trash=[];
   return {changed:count>0,result:count};
  });
 }
 private async mutate<T>(modify:(draft:DataFile)=>{changed:boolean;result:T}):Promise<T> {
  const work = this.pending.then(async () => {
   const draft = clone(this.data);
   const {changed,result} = modify(draft);
   if (changed) { await this.persist(draft); this.data = draft; }
   return result;
  });
  this.pending = work.then(() => {}, () => {});
  return work;
 }
 private async persist(data:DataFile):Promise<void> {
  await mkdir(dirname(this.path), {recursive:true});
  const temp = `${this.path}.${crypto.randomUUID()}.tmp`;
  try {
   const file = await open(temp,'wx',0o600);
   try { await file.writeFile(JSON.stringify(data,null,2)+'\n','utf8'); await file.sync(); }
   finally { await file.close(); }
   await rename(temp,this.path);
  } catch (error) {
   await rm(temp,{force:true}).catch(() => {});
   throw error;
  }
 }
}
