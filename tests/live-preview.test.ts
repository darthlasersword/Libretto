import { test, expect } from 'bun:test';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { previewDecorations } from '../src/lib/live-preview';

function ranges(doc:string, cursor:number, focused=true) {
 const state=EditorState.create({doc, selection:{anchor:cursor}, extensions:[markdown({base:markdownLanguage})]});
 const found: {from:number;to:number;text:string}[]=[];
 previewDecorations(state,focused).between(0,doc.length,(from,to) => { if(from!==to) found.push({from,to,text:doc.slice(from,to)}); });
 return found;
}
test('live preview hides syntax only on inactive lines without changing source',()=>{
 const doc='# Title\n**bold** and *italic* and [link](https://example.com)\n- [x] done';
 const other=ranges(doc,2);
 expect(other.map(r=>r.text)).toEqual(['**','**','*','*','[','](https://example.com)','-','[x]']);
 const focused=ranges(doc,doc.indexOf('bold'));
 expect(focused.map(r=>r.text)).toEqual(['# ','-','[x]']);
 expect(ranges(doc,0,false).map(r=>r.text)).toEqual(['# ','**','**','*','*','[','](https://example.com)','-','[x]']);
});
test('fenced code and quotes preview without hiding code contents',()=>{
 const doc='> quote\n\n```js\nconst a = 1\n```\n\nend';
 expect(ranges(doc,doc.length).map(r=>r.text)).toEqual(['> ','```js','```']);
 expect(ranges(doc,doc.indexOf('const')).map(r=>r.text)).toEqual(['> ','```js','```']);
});
test('preview handles nested formatting, images, links, tables and escaped punctuation',()=>{
 const doc='**bold *inner*** and [ref][id] and <https://example.com> and \\*\n![image](https://example.com/a.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n[id]: https://example.com\n\nediting';
 const result=ranges(doc,doc.length).map(r=>r.text);
 expect(result).toContain('![image](https://example.com/a.png)');
 expect(result).toContain('][id]');
 expect(result).toContain('|---|---|');
 expect(result).toContain('---');
 expect(result).toContain('\\');
 expect(result).toContain('<');
});
test('multiple selections reveal all touched lines',()=>{
 const doc='**one**\n**two**\n**three**';
 const state=EditorState.create({doc,selection:EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(10)]),extensions:[EditorState.allowMultipleSelections.of(true),markdown({base:markdownLanguage})]});
 const found:string[]=[];
 previewDecorations(state,true).between(0,doc.length,(from,to)=>{if(from!==to) found.push(doc.slice(from,to));});
 expect(found).toEqual(['**','**']);
});
test('code contents are never treated as Markdown preview syntax',()=>{
 const doc='```markdown\n**literal** and \\*\n```\n\nOutside';
 expect(ranges(doc,doc.length).map(r=>r.text)).toEqual(['```markdown','```']);
});
test('preview limits work to the viewport while keeping multiline block styling',()=>{
 const doc=Array.from({length:2000},(_,i)=>'> **line '+i+'**').join('\n');
 const state=EditorState.create({doc,extensions:[markdown({base:markdownLanguage})]});
 const line=state.doc.line(1000);
 const decorations=previewDecorations(state,false,{from:line.from,to:line.to});
 let count=0, lineClasses:string[]=[];
 decorations.between(0,doc.length,(from,to,value)=>{count++; if(from===to) lineClasses.push(value.spec.class);});
 expect(count).toBeLessThan(10);
 expect(lineClasses).toContain('cm-preview-quote');
});
