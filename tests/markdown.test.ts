import { test,expect } from 'bun:test';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis,{window:dom.window,document:dom.window.document});
const { markdownFragment }=await import('../src/lib/markdown');
test('Markdown becomes a sanitized DocumentFragment',()=>{
 const fragment=markdownFragment('# Title\n\n**Bold** and *italic*\n\n- One\n- Two\n\n```js\nconst x=1\n```\n\n<script>alert(1)</script>\n<a href="javascript:alert(1)" onclick="alert(1)">bad</a>\n<img src=x onerror=alert(1)>');
 expect(fragment.nodeType).toBe(11);
 expect(fragment.querySelector('h1')?.textContent).toBe('Title');
 expect(fragment.querySelector('strong')?.textContent).toBe('Bold');
 expect(fragment.querySelectorAll('li').length).toBe(2);
 expect(fragment.querySelector('pre code')?.textContent).toContain('const x=1');
 expect(fragment.querySelector('script,img')).toBeNull();
 expect(fragment.querySelector('[onclick],[href^="javascript:"]')).toBeNull();
});
