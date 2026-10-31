import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { livePreview, previewHighlight } from '../src/lib/live-preview';

test('editor updates preview as the caret moves while retaining editable Markdown',()=>{
 const dom = new JSDOM('<!doctype html><body><div id="editor"></div></body>', {pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect = () => new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='**first**\n*second*';
 const view=new EditorView({parent:win.document.getElementById('editor')!, state:EditorState.create({doc,extensions:[markdown({base:markdownLanguage}),livePreview]})});
 view.focus();
 view.dispatch({selection:{anchor:2}});
 const lines=()=>Array.from(view.dom.querySelectorAll('.cm-line')).map(line=>line.textContent);
 expect(lines()).toEqual(['**first**','second']);
 view.dispatch({selection:{anchor:doc.indexOf('second')+2}});
 expect(lines()).toEqual(['first','*second*']);
 view.dispatch({changes:{from:2,to:7,insert:'changed'}});
 expect(view.state.doc.toString()).toBe('**changed**\n*second*');
 expect(lines()).toEqual(['changed','*second*']);
 view.destroy(); dom.window.close();
});

test('task checkbox updates Markdown and undo restores it',()=>{
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect = () => new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='- [ ] task\n\nWriting';
 const view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc,selection:{anchor:doc.length},extensions:[history(),markdown({base:markdownLanguage}),livePreview]})});
 view.focus();
 const checkbox=view.dom.querySelector('.cm-preview-checkbox');
 expect(checkbox).not.toBeNull();
 checkbox!.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
 expect(view.state.doc.toString()).toBe('- [x] task\n\nWriting');
 expect(undo(view)).toBe(true);
 expect(view.state.doc.toString()).toBe(doc);
 view.destroy(); dom.window.close();
});

test('editing and undo on a revealed line keep the surrounding preview and source intact',async ()=>{
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div><button>Outside</button></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect = () => new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='# Heading\n\n**Bold** and [link](https://example.com)\n\n- [x] Done';
 const view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc,extensions:[history(),markdown({base:markdownLanguage}),livePreview]})});
 view.focus();
 await new Promise(resolve=>setTimeout(resolve,20));
 const lines=()=>Array.from(view.dom.querySelectorAll('.cm-line')).map(line=>line.textContent);
 expect(lines()[0]).toBe('# Heading');
 expect(lines()[2]).toBe('Bold and link');
 const pos=doc.indexOf('Bold')+4;
 view.dispatch({selection:{anchor:pos}});
 expect(lines()[0]).toBe('Heading');
 expect(lines()[2]).toBe('**Bold** and link');
 view.dispatch({changes:{from:pos,to:pos,insert:'!'},selection:{anchor:pos+1},userEvent:'input.type'});
 expect(view.state.doc.toString()).toContain('**Bold!**');
 expect(undo(view)).toBe(true);
 expect(view.state.doc.toString()).toBe(doc);
 (win.document.querySelector('button') as HTMLButtonElement).focus();
 await new Promise(resolve=>setTimeout(resolve,20));
 expect(lines()[2]).toBe('Bold and link');
 view.destroy();dom.window.close();
});
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonPadStore } from '../server/json-store';
import { createApi } from '../server/api';

test('live preview edits save as Markdown and survive reopening',async ()=>{
 const root=await mkdtemp(join(tmpdir(),'rune-preview-'));
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect=()=>new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 let view: EditorView | undefined;
 try {
  const file=join(root,'data','scripts.json');
  const store=await JsonPadStore.open(file);
  const original=await store.create({title:'Preview',content:'# Title\n\n**bold**\n\n- [ ] Task',folder_id:null});
  let changed='';
  view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc:original.content,selection:{anchor:original.content.indexOf('bold')},extensions:[markdown({base:markdownLanguage}),livePreview,EditorView.updateListener.of(update=>{if(update.docChanged) changed=update.state.doc.toString();})]})});
  view.focus();
  const pos=original.content.indexOf('bold')+4;
  view.dispatch({changes:{from:pos,to:pos,insert:' text'},selection:{anchor:pos+5},userEvent:'input.type'});
  const task=view.dom.querySelector('.cm-preview-checkbox');
  expect(task).not.toBeNull();
  task!.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
  expect(changed).toBe('# Title\n\n**bold text**\n\n- [x] Task');
  const api=createApi(store);
  const response=await api(new Request('http://localhost/api/pads/'+original.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...original,content:changed})}));
  expect(response.status).toBe(200);
  const reopened=await JsonPadStore.open(file);
  const saved=reopened.get(original.id)!;
  expect(saved.content).toBe(changed);
  expect(await readFile(join(root,'saves','Preview.md'),'utf8')).toBe(changed);
 } finally { view?.destroy();dom.window.close();await rm(root,{recursive:true,force:true}); }
});

test('copy and paste operate on Markdown source across previewed lines',()=>{
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect=()=>new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='**Bold**\n[Link](https://example.com)\n\nEnd';
 const view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc,extensions:[history(),markdown({base:markdownLanguage}),livePreview]})});
 try {
  view.focus();
  const end=doc.indexOf('\n\n');
  view.dispatch({selection:{anchor:0,head:end}});
  let copied='';
  const copy=new win.Event('copy',{bubbles:true,cancelable:true});
  Object.defineProperty(copy,'clipboardData',{value:{clearData(){},setData(type:string,text:string){if(type==='text/plain')copied=text;}}});
  view.contentDOM.dispatchEvent(copy);
  expect(copied).toBe(doc.slice(0,end));
  view.dispatch({selection:{anchor:doc.length}});
  const paste=new win.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{getData(type:string){return type==='text/plain'?'\n'+copied:'';},files:[]}});
  view.contentDOM.dispatchEvent(paste);
  expect(view.state.doc.toString()).toBe(doc+'\n'+copied);
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(doc);
 } finally {view.destroy();dom.window.close();}
});

test('inactive Markdown content retains its visual formatting',()=>{
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect=()=>new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='# Heading\n\n**bold** and *italic* and ~~removed~~ and [link](https://example.com)\n\nEditing';
 const view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc,selection:{anchor:doc.length},extensions:[markdown({base:markdownLanguage}),previewHighlight,livePreview]})});
 try {
  view.focus();
  const lines=view.dom.querySelectorAll('.cm-line');
  expect(lines[0].classList.contains('cm-preview-heading-1')).toBe(true);
  const spans=Array.from(lines[2].querySelectorAll('span'));
  const style=(text:string)=>win.getComputedStyle(spans.find(span=>span.textContent===text)!);
  expect(style('bold').fontWeight).toBe('700');
  expect(style('italic').fontStyle).toBe('italic');
  expect(style('removed').textDecoration).toContain('line-through');
  expect(style('link').textDecoration).toContain('underline');
 } finally {view.destroy();dom.window.close();}
});

test('moving the caret between formatted spans on one line switches source and preview',()=>{
 const dom=new JSDOM('<!doctype html><body><div id="editor"></div></body>',{pretendToBeVisual:true});
 const win=dom.window;
 win.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
 win.Range.prototype.getBoundingClientRect=()=>new win.DOMRect();
 Object.assign(globalThis,{window:win,document:win.document,Window:win.Window,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)});
 const doc='*Hello*  **world** '; 
 const view=new EditorView({parent:win.document.getElementById('editor')!,state:EditorState.create({doc,extensions:[history(),markdown({base:markdownLanguage}),previewHighlight,livePreview]})});
 try {
  view.focus();
  const line=()=>view.dom.querySelector('.cm-line')!.textContent;
  view.dispatch({selection:{anchor:6}});
  expect(line()).toBe('*Hello*  world ');
  view.dispatch({selection:{anchor:7}});
  expect(line()).toBe('*Hello*  world ');
  view.dispatch({selection:{anchor:8}});
  expect(line()).toBe('Hello  world ');
  view.dispatch({selection:{anchor:13}});
  expect(line()).toBe('Hello  **world** ');
  view.dispatch({selection:{anchor:doc.length-1}});
  expect(line()).toBe('Hello  **world** ');
  view.dispatch({selection:{anchor:doc.length}});
  expect(line()).toBe('Hello  world ');
  view.dispatch({changes:{from:doc.length,to:doc.length,insert:'again'},selection:{anchor:doc.length+5},userEvent:'input.type'});
  expect(line()).toBe('Hello  world again');
  expect(view.state.doc.toString()).toBe(doc+'again');
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(doc);
 } finally {view.destroy();dom.window.close();}
});
