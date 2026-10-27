import type { JsonPadStore } from './json-store';
const json = (data:unknown, status=200) => Response.json(data,{status});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createApi(store: JsonPadStore, allowedOrigins:ReadonlySet<string>=new Set(), setup?: { status: () => { required: boolean; path: string }; configure: (path: string) => Promise<JsonPadStore>; chooseFolder?: () => Promise<string | null>; reset?: () => Promise<void> }) {
 return async function api(req:Request):Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return json({error:'Not found'},404);
  if (!['GET','HEAD'].includes(req.method)) {
   const origin = req.headers.get('origin');
   if (origin && origin !== url.origin && !allowedOrigins.has(origin)) return json({error:'Origin rejected'},403);
  }
  try {
   if (url.pathname==='/api/setup/browse' && req.method==='POST' && setup?.chooseFolder) {
    if (!setup.status().required) return json({error:'Storage is already set up.'},409);
    try { return json({path: await setup.chooseFolder()}); }
    catch (error) { return json({error: error instanceof Error ? error.message : 'Unable to open the folder chooser.'},503); }
   }
   if (url.pathname==='/api/setup' && setup) {
    if (req.method==='GET') return json(setup.status());
    if (req.method==='POST') {
     const body=await req.json();
     if (!body || typeof body.path !== 'string' || !body.path.trim()) return json({error:'Enter an absolute folder path.'},400);
     if (!setup.status().required) return json({error:'Storage is already set up.'},409);
     try { store=await setup.configure(body.path.trim()); return json(setup.status()); }
     catch (error) { return json({error: error instanceof Error ? error.message : 'Unable to use this folder.'},400); }
    }
   }
   if (setup?.status().required && url.pathname !== '/api/health') return json({error:'Choose a storage folder to get started.'},409);
   if (url.pathname==='/api/health' && req.method==='GET') return json({database:'json',ok:true});
   if (url.pathname==='/api/reset' && req.method==='POST') {
    await store.reset();
    const backup=await store.backup();
    if (backup.scripts.length || backup.trash.length) throw new Error('Reset verification failed.');
    if (setup?.reset) await setup.reset();
    return json({reset:true,setupRequired:setup?.status().required ?? false});
   }
   if (url.pathname==='/api/backup') {
    if (req.method==='GET') return new Response(JSON.stringify(await store.backup()),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    if (req.method==='POST') {
     if (Number(req.headers.get('content-length'))>52_000_000) return json({error:'Backup is too large (50 MB limit).'},413);
     const body=await req.text();
     if (new TextEncoder().encode(body).length>52_000_000) return json({error:'Backup is too large (50 MB limit).'},413);
     return json(await store.importBackup(JSON.parse(body)));
    }
   }
   if (url.pathname==='/api/pads') {
    if (req.method==='GET') return json(store.list());
    if (req.method==='POST') return json(await store.create(),201);
   }
   if (url.pathname==='/api/trash') {
    if (req.method==='GET') return json(store.listTrash());
    if (req.method==='DELETE') { await store.emptyTrash(); return new Response(null,{status:204}); }
   }
   if (url.pathname==='/api/trash/delete' && req.method==='POST') {
    const body=await req.json();
    if (!body || !Array.isArray(body.ids) || !body.ids.length || body.ids.length>10000 || !body.ids.every((id:unknown)=>typeof id==='string' && uuid.test(id))) return json({error:'Invalid selection'},400);
    await store.permanentlyDelete(body.ids);
    return new Response(null,{status:204});
   }
   const restoreId=url.pathname.match(/^\/api\/trash\/([^/]+)\/restore$/)?.[1];
   if (restoreId && uuid.test(restoreId) && req.method==='POST') {
    const pad=await store.restore(restoreId);
    return pad?json(pad):json({error:'File not found in Trash'},404);
   }
   const id=url.pathname.match(/^\/api\/pads\/([^/]+)$/)?.[1];
   const exportId=url.pathname.match(/^\/api\/pads\/([^/]+)\/export$/)?.[1];
   if (exportId && uuid.test(exportId) && req.method==='GET') {
    const content=await store.export(exportId);
    return content===undefined?json({error:'File not found'},404):new Response(content,{headers:{'content-type':'text/markdown; charset=utf-8','cache-control':'no-store'}});
   }
   if (!id || !uuid.test(id)) return json({error:'Not found'},404);
   if (req.method==='GET') { const pad=store.get(id); return pad?json(pad):json({error:'Pad not found'},404); }
   if (req.method==='DELETE') return await store.delete(id)?new Response(null,{status:204}):json({error:'Pad not found'},404);
   if (req.method==='PUT') {
    if (Number(req.headers.get('content-length'))>2100000) return json({error:'Pad too large'},413);
    const body=await req.json();
    if (!body || typeof body!=='object'||typeof body.title!=='string'||body.title.length>200||typeof body.content!=='string'||new TextEncoder().encode(body.content).length>2000000||typeof body.pinned!=='boolean'||!Number.isInteger(body.revision)) return json({error:'Invalid pad. Title limit: 200 characters; content limit: 2 MB.'},400);
    const result=await store.update(id,body);
    if (result.status==='saved') return json(result.pad);
    return json({error:result.status==='conflict'?'This pad changed in another window. Export your draft before reloading.':'Pad not found'},result.status==='conflict'?409:404);
   }
   return json({error:'Method not allowed'},405);
  } catch(error) {
   if(error instanceof SyntaxError) return json({error:'Invalid JSON'},400);
   if(error instanceof TypeError && error.message==='Invalid Rune backup file.') return json({error:error.message},400);
   console.error('API request failed',error);
   return json({error:'Unable to access the saved file. Your draft is still in this window.'},503);
  }
 };
}
