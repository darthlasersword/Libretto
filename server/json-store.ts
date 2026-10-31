import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Folder, Pad, TrashedPad } from '../src/lib/types';
import { titleError, FileNameError } from '../src/lib/file-names';

type Meta = Omit<Pad, 'content'> & { filename: string };
type TrashedMeta = Meta & { deleted_at: string };
type DataFile = { version: 3; scripts: Meta[]; trash: TrashedMeta[]; folders: Folder[] };
type BackupFile = { kind: 'rune-backup'; version: 1; exported_at: string; scripts: Pad[]; trash: TrashedPad[]; folders?: Folder[] };
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
 private data: DataFile = { version: 3, scripts: [], trash: [], folders: [] };
 private contents = new Map<string, string>();
 private pending: Promise<void> = Promise.resolve();
 private constructor(path: string, savesPath?: string) {
  this.path = resolve(path);
  const dataDir = dirname(this.path);
  const root = basename(dataDir) === 'data' ? dirname(dataDir) : dataDir;
  this.savesPath = savesPath ? resolve(savesPath) : join(root, 'saves');
  this.trashPath = join(root, 'trash');
 }
 private activePath(p: Meta) { return join(this.savesPath, p.filename); }
 private deletedPath(p: Meta) { return join(this.trashPath, p.filename); }
 // Check within the serialized mutation so concurrent requests cannot claim the same title.
 private checkTitle(title: string, data: DataFile, excludeId?: string) {
  const error = titleError(title, [...data.scripts, ...data.trash].filter(p => p.id !== excludeId).map(p => p.title));
  if (error) throw new FileNameError(error);
 }
 // Automatic names preserve imported data and never replace an unrelated disk file.
 private async availableTitle(title: string, data: DataFile): Promise<string> {
  let base = slug(title).trim().normalize('NFC');
  if (titleError(base)) base = 'Untitled';
  const existing = [...data.scripts, ...data.trash].map(p => p.title);
  for (let n = 1; ; n++) {
   const suffix = n === 1 ? '' : ` (${n})`;
   let prefix = base;
   while (new TextEncoder().encode(prefix + suffix).length > 180) prefix = Array.from(prefix).slice(0, -1).join('');
   const candidate = prefix + suffix;
   if (!titleError(candidate, existing) && await this.filename(candidate) === candidate + '.md') return candidate;
  }
 }
 private async filename(title: string, excludeId?: string): Promise<string> {
  const used = new Set(this.data.scripts.filter(p => p.id !== excludeId).map(p => p.filename.normalize('NFC').toLowerCase()));
  const existing = await readdir(this.savesPath).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return [] as string[]; throw e; });
  const current = excludeId && this.data.scripts.find(p => p.id === excludeId)?.filename;
  for (const name of existing) if (name !== current) used.add(name.normalize('NFC').toLowerCase());
  const base = slug(title);
  for (let n = 1;; n++) {
   const candidate = `${base}${n === 1 ? '' : ` (${n})`}.md`;
   if (!used.has(candidate.normalize('NFC').toLowerCase())) return candidate;
  }
 }
 private async trashFilename(title: string, excludeId?: string): Promise<string> {
  const used = new Set(this.data.trash.filter(p=>p.id!==excludeId).map(p=>p.filename.normalize('NFC').toLowerCase()));
  const existing = await readdir(this.trashPath).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [] as string[];throw e;});
  const current = excludeId && this.data.trash.find(p=>p.id===excludeId)?.filename;
  for(const name of existing) if(name!==current) used.add(name.normalize('NFC').toLowerCase());
  const base=slug(title);
  for(let n=1;;n++){const candidate=`${base}${n===1?'':` (${n})`}.md`;if(!used.has(candidate.normalize('NFC').toLowerCase()))return candidate;}
 }
 static async open(path: string, savesPath?: string): Promise<JsonPadStore> {
  const store = new JsonPadStore(path, savesPath);
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
   // A previous migration may have written title-based files before updating the index.
   // Resolve every source before writing anything, so a missing file leaves the index intact.
   const legacyContent = async (p: Pad, deleted: boolean): Promise<string> => {
    if (parsed.version === 1) return p.content;
    const paths = deleted
     ? [join(store.savesPath, `${p.id}.md`), join(store.trashPath, `${p.id}.md`), join(store.trashPath, `${slug(p.title)}.md`)]
     : [join(store.savesPath, `${p.id}.md`), join(store.savesPath, `${slug(p.title)}.md`)];
    for (const path of paths) {
     try { return await readFile(path, 'utf8'); }
     catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    throw new Error(`Missing content for ${deleted ? 'trashed' : 'active'} Rune file "${p.title}" (${p.id}). Checked: ${paths.join(', ')}. Your index was left untouched.`);
   };
   const activeContents = await Promise.all((scripts as Pad[]).map(p => legacyContent(p, false)));
   const trashContents = await Promise.all((trash as TrashedPad[]).map(p => legacyContent(p, true)));
   const oldPaths: string[] = [];
   for (const [index, p] of (scripts as Pad[]).entries()) {
    const content = activeContents[index];
    const filename = await store.filename(p.title);
    const meta = {...metadata({...p,content}),filename};
    await store.atomicWrite(store.activePath(meta),content);
    store.data.scripts.push(meta); store.contents.set(p.id,content);
    if (parsed.version === 2) oldPaths.push(join(store.savesPath, `${p.id}.md`));
   }
   for (const [index, p] of (trash as TrashedPad[]).entries()) {
    const content = trashContents[index];
    const filename=await store.trashFilename(p.title);
    await store.atomicWrite(join(store.trashPath,filename),content);
    const {content: _,...rest} = p;
    store.data.trash.push({...rest,filename}); store.contents.set(p.id,content);
    if (parsed.version === 2) oldPaths.push(join(store.savesPath, `${p.id}.md`));
   }
   await store.persist(store.data);
   for (const old of oldPaths) await rm(old,{force:true});
  } else {
   const folders=parsed.folders ?? [];
   if (!Array.isArray(folders) || !folders.every((f:any)=>f && typeof f.id==='string' && validId.test(f.id) && typeof f.name==='string' && f.name.trim() && f.name.length<=200 && (f.parent_id===null || typeof f.parent_id==='string' && validId.test(f.parent_id)))) throw new Error(`Invalid Rune folder data: ${store.path}. Your file was left untouched.`);
   store.data = {version:3,scripts:scripts as Meta[],trash:trash as TrashedMeta[],folders};
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
 listFolders():Folder[] { return clone(this.data.folders); }
 async backup(): Promise<BackupFile> {
  await this.pending;
  return {kind:'rune-backup',version:1,exported_at:new Date().toISOString(),scripts:this.list(),trash:this.listTrash(),folders:this.listFolders()};
 }
 async importBackup(input: unknown): Promise<{scripts:number;trash:number}> {
  const backup=input as Partial<BackupFile> | null;
  const validPad=(item:unknown,deleted:boolean):boolean=>{
   if(!isMeta(item))return false;
   const p=item as Record<string,unknown>;
   return validId.test(p.id as string) && typeof p.content==='string' && new TextEncoder().encode(p.content).length<=2_000_000 &&
    (p.title as string).length<=200 && (!deleted || typeof p.deleted_at==='string');
  };
  if(!backup || backup.kind!=='rune-backup' || backup.version!==1 || !Array.isArray(backup.scripts) || !Array.isArray(backup.trash) ||
   backup.scripts.length+backup.trash.length>10000 || !backup.scripts.every(p=>validPad(p,false)) || !backup.trash.every(p=>validPad(p,true)) ||
   (backup.folders!==undefined && (!Array.isArray(backup.folders) || backup.folders.length>10000 || !backup.folders.every(f=>f && typeof f.id==='string' && validId.test(f.id) && typeof f.name==='string' && !!f.name.trim() && f.name.length<=200 && (f.parent_id===null || typeof f.parent_id==='string' && validId.test(f.parent_id))))))
   throw new TypeError('Invalid Rune backup file.');
  const work=this.pending.then(async()=>{
   const draft=clone(this.data);
   const folderMap=new Map<string,string>();
   for(const folder of backup.folders ?? []) folderMap.set(folder.id,crypto.randomUUID());
   for(const folder of backup.folders ?? []) draft.folders.push({id:folderMap.get(folder.id)!,name:folder.name,parent_id:folder.parent_id ? folderMap.get(folder.parent_id) ?? null : null});
   const created:string[]=[];
   const imported:{id:string;content:string}[]=[];
   try {
    for(const p of backup.scripts as Pad[]){
     const id=crypto.randomUUID();const title=await this.availableTitle(p.title,draft);const filename=await this.filename(title);
     const meta:Meta={...metadata(p),id,title,filename,folder_id:p.folder_id ? folderMap.get(p.folder_id) ?? null : null};
     const path=this.activePath(meta);await this.atomicWrite(path,p.content);
     created.push(path);draft.scripts.push(meta);imported.push({id,content:p.content});
    }
    for(const p of backup.trash as TrashedPad[]){
     const id=crypto.randomUUID();const title=await this.availableTitle(p.title,draft);const filename=await this.trashFilename(title);
     const {content:_,...rest}=p;const meta:TrashedMeta={...rest,id,title,filename,folder_id:p.folder_id ? folderMap.get(p.folder_id) ?? null : null};
     const path=this.deletedPath(meta);await this.atomicWrite(path,p.content);
     created.push(path);draft.trash.push(meta);imported.push({id,content:p.content});
    }
    await this.persist(draft);
    this.data=draft;
    for(const p of imported)this.contents.set(p.id,p.content);
    return {scripts:backup.scripts!.length,trash:backup.trash!.length};
   } catch(error){for(const path of created)await rm(path,{force:true}).catch(()=>{});throw error;}
  });
  this.pending=work.then(()=>{},()=>{});
  return work;
 }
 get(id:string):Pad|undefined { const p=this.data.scripts.find(p=>p.id===id);return p&&this.full(p); }
 async export(id:string):Promise<string|undefined> { const p=this.data.scripts.find(p=>p.id===id);return p&&readFile(this.activePath(p),'utf8'); }
 async create(input?:{title:string;content:string;folder_id:string|null;autoTitle?:boolean}):Promise<Pad> { return this.mutate(async data=>{
  if(input?.folder_id && !data.folders.some(f=>f.id===input.folder_id)) throw new TypeError('Folder not found.');
  const title = input?.autoTitle || !input ? await this.availableTitle(input?.title || 'Untitled',data) : input.title.trim().normalize('NFC');
  this.checkTitle(title,data);
  const now=new Date().toISOString();const pad:Pad={id:crypto.randomUUID(),title,content:input?.content??'',folder_id:input?.folder_id??null,pinned:false,revision:1,created_at:now,updated_at:now};
  const meta={...metadata(pad),filename:await this.filename(pad.title)};
  if(meta.filename !== pad.title + '.md') throw new FileNameError('A file with this name already exists in the storage folder.');
  await this.atomicWrite(this.activePath(meta),pad.content);data.scripts.push(meta);this.contents.set(pad.id,pad.content);
  return {changed:true,result:pad};
 }); }
 async createFolder(name:string,parent_id:string|null):Promise<Folder> {return this.mutate(async data=>{
  if(parent_id && !data.folders.some(f=>f.id===parent_id)) throw new TypeError('Folder not found.');
  const folder={id:crypto.randomUUID(),name:name.trim(),parent_id};data.folders.push(folder);return {changed:true,result:folder};
 });}
 async renameFolder(id:string,name:string):Promise<Folder|undefined> {return this.mutate(async data=>{
  const folder=data.folders.find(f=>f.id===id);if(!folder)return {changed:false,result:undefined};
  folder.name=name.trim();return {changed:true,result:clone(folder)};
 });}
 async moveFolder(id:string,parent_id:string|null):Promise<Folder|undefined> {return this.mutate(async data=>{
  const folder=data.folders.find(f=>f.id===id);if(!folder)return {changed:false,result:undefined};
  let parent=parent_id ? data.folders.find(f=>f.id===parent_id) : undefined;
  if(parent_id && !parent) throw new TypeError('Folder not found.');
  const seen=new Set<string>();
  while(parent){if(parent.id===id || seen.has(parent.id)) throw new TypeError('Invalid folder destination.');seen.add(parent.id);parent=parent.parent_id ? data.folders.find(f=>f.id===parent!.parent_id) : undefined;}
  folder.parent_id=parent_id;return {changed:true,result:clone(folder)};
 });}
 async deleteFolder(id:string):Promise<boolean> {
  if(!this.data.folders.some(f=>f.id===id)) return false;
  await this.bulkDelete([], [id]); return true;
 }
 private folderTree(data:DataFile, folderIds:string[]):Set<string> {
  const ids=new Set(folderIds);let count=-1;
  while(count!==ids.size){count=ids.size;for(const f of data.folders)if(f.parent_id && ids.has(f.parent_id))ids.add(f.id);}
  return ids;
 }
 async bulkMove(fileIds:string[],folderIds:string[],parent_id:string|null):Promise<void> {return this.mutate(async data=>{
  const selectedFolders=new Set(folderIds), selectedFiles=new Set(fileIds);
  if(folderIds.some(id=>!data.folders.some(f=>f.id===id)) || fileIds.some(id=>!data.scripts.some(p=>p.id===id))) throw new TypeError('Selection not found.');
  if(parent_id && !data.folders.some(f=>f.id===parent_id)) throw new TypeError('Folder not found.');
  const tree=this.folderTree(data,folderIds);
  if(parent_id && tree.has(parent_id)) throw new TypeError('Invalid folder destination.');
  for(const f of data.folders) if(selectedFolders.has(f.id) && (!f.parent_id || !tree.has(f.parent_id))) f.parent_id=parent_id;
  for(const p of data.scripts) if(selectedFiles.has(p.id) && (!p.folder_id || !tree.has(p.folder_id))) p.folder_id=parent_id;
  return {changed:!!(fileIds.length||folderIds.length),result:undefined};
 });}
 async bulkDelete(fileIds:string[],folderIds:string[]):Promise<void> {return this.mutate(async data=>{
  if(folderIds.some(id=>!data.folders.some(f=>f.id===id)) || fileIds.some(id=>!data.scripts.some(p=>p.id===id))) throw new TypeError('Selection not found.');
  const removedFolders=this.folderTree(data,folderIds), selectedFiles=new Set(fileIds);
  const removed=data.scripts.filter(p=>selectedFiles.has(p.id) || !!p.folder_id && removedFolders.has(p.folder_id));
  const created:string[]=[]; const deletedAt=new Date().toISOString();
  try {
   for(const p of removed){const filename=await this.trashFilename(p.title);const path=join(this.trashPath,filename);await this.atomicWrite(path,this.contents.get(p.id)??'');created.push(path);data.trash.push({...p,filename,folder_id:null,deleted_at:deletedAt});}
  } catch(e) { for(const path of created) await rm(path,{force:true}).catch(()=>{}); throw e; }
  data.scripts=data.scripts.filter(p=>!removed.includes(p));data.folders=data.folders.filter(f=>!removedFolders.has(f.id));
  for(const p of data.trash)if(p.folder_id && removedFolders.has(p.folder_id))p.folder_id=null;
  return {changed:!!(removed.length||removedFolders.size),result:undefined,remove:removed.map(p=>this.activePath(p)),rollback:created};
 });}
 async movePad(id:string,folder_id:string|null):Promise<Pad|undefined> {return this.mutate(async data=>{
  if(folder_id && !data.folders.some(f=>f.id===folder_id)) throw new TypeError('Folder not found.');
  const pad=data.scripts.find(p=>p.id===id);if(!pad)return {changed:false,result:undefined};
  pad.folder_id=folder_id;return {changed:true,result:this.full(pad)};
 });}
 async update(id:string,input:Pick<Pad,'title'|'content'|'pinned'|'revision'>):Promise<{status:'saved';pad:Pad}|{status:'conflict'|'missing'}> {
  return this.mutate<{status:'saved';pad:Pad}|{status:'conflict'|'missing'}>(async data=>{
   const p=data.scripts.find(p=>p.id===id);if(!p)return {changed:false,result:{status:'missing' as const}};
   if(p.revision!==input.revision)return {changed:false,result:{status:'conflict' as const}};
   const old=this.activePath(p);const title=input.title===p.title ? p.title : input.title.trim().normalize('NFC');
   if(title!==p.title) this.checkTitle(title,data,id);
   const filename=title===p.title?p.filename:await this.filename(title,id);
   if(title!==p.title && filename!==title+'.md') throw new FileNameError('A file with this name already exists in the storage folder.');
   const next=join(this.savesPath,filename);
   if(next!==old || this.contents.get(id)!==input.content) await this.atomicWrite(next,input.content);
   p.title=title;p.filename=filename;p.pinned=input.pinned;p.revision++;p.updated_at=new Date().toISOString();
   this.contents.set(id,input.content);
   // A case-only rename refers to the same file on Windows; do not remove it.
   return {changed:true,result:{status:'saved' as const,pad:this.full(p)},remove:next===old || (process.platform === 'win32' && next.toLowerCase() === old.toLowerCase())?[]:[old]};
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
  const p=data.trash[index];
  const others={...data,trash:data.trash.filter(item=>item.id!==id)};
  const title=await this.availableTitle(p.title,others);const filename=await this.filename(title);
  const {deleted_at:_,...rest}=p;const active={...rest,title,filename};
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
 async reset():Promise<void> { return this.mutate(async data=>{
  const active=data.scripts;const deleted=data.trash;
  const hadFolders=data.folders.length>0;data.scripts=[];data.trash=[];data.folders=[];
  return {changed:active.length+deleted.length>0||hadFolders,result:undefined,remove:[...active.map(p=>this.activePath(p)),...deleted.map(p=>this.deletedPath(p))],forget:[...active,...deleted].map(p=>p.id)};
 }); }
 private async mutate<T>(modify:(draft:DataFile)=>Promise<{changed:boolean;result:T;remove?:string[];forget?:string[];rollback?:string[]}>):Promise<T> {
  const work=this.pending.then(async()=>{
   const draft=clone(this.data);const {changed,result,remove,forget,rollback}=await modify(draft);
   if(changed){try { await this.persist(draft); } catch(error) { for(const path of rollback??[]) await rm(path,{force:true}).catch(()=>{}); throw error; } this.data=draft;
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
