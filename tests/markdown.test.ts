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
 expect(fragment.querySelector('script')).toBeNull();
 expect(fragment.querySelector('img')?.getAttribute('onerror')).toBeNull();
 expect(fragment.querySelector('[onclick],[href^="javascript:"]')).toBeNull();
});
test('Read mode renders tables, nested lists, links, images, and fenced code',()=>{
 const fragment=markdownFragment('## Heading\n\n| Name | Value |\n| :--- | ---: |\n| alpha | **42** |\n\n- Parent\n  - Child\n\n![Diagram](https://example.com/image.png)\n\n[Link](https://example.com)\n\n```js\nconst x = 1;\n```');
 expect(fragment.querySelector('table thead th')?.textContent).toBe('Name');
 expect(fragment.querySelectorAll('thead th')[1]?.getAttribute('align')).toBe('right');
 expect(fragment.querySelector('tbody strong')?.textContent).toBe('42');
 expect(fragment.querySelector('li ul li')?.textContent).toBe('Child');
 expect(fragment.querySelector('img')?.getAttribute('alt')).toBe('Diagram');
 expect(fragment.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
 expect(fragment.querySelector('pre code.language-js')?.textContent).toBe('const x = 1;\n');
});
test('Task lists render as disabled checkboxes',()=>{
 const fragment=markdownFragment('- [x] Done\n- [ ] Next');
 const boxes=fragment.querySelectorAll('input[type=checkbox]');
 expect(boxes).toHaveLength(2);
 expect(boxes[0].hasAttribute('checked')).toBe(true);
 expect(boxes[0].hasAttribute('disabled')).toBe(true);
});
