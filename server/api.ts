import type { JsonPadStore } from './json-store';
const json = (data:unknown, status=200) => Response.json(data,{status});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createApi(store: JsonPadStore, allowedOrigins:ReadonlySet<string>=new Set()) {
 return async function api(req:Request):Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return json({error:'Not found'},404);
  if (!['GET','HEAD'].includes(req.method)) {
   const origin = req.headers.get('origin');
   if (origin && origin !== url.origin && !allowedOrigins.has(origin)) return json({error:'Origin rejected'},403);
  }
  try {
   if (url.pathname==='/api/health' && req.method==='GET') return json({database:'json',ok:true});
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
   console.error('API request failed',error);
   return json({error:'Unable to access the saved file. Your draft is still in this window.'},503);
  }
 };
}
