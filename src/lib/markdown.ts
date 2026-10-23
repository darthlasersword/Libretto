import { marked } from 'marked';
import DOMPurify from 'dompurify';
// Markdown parsing and DOM insertion are separate from the editing engine.
// Raw HTML is sanitized before it ever enters the live document.
export function markdownFragment(source:string):DocumentFragment {
 return DOMPurify.sanitize(marked.parse(source,{async:false,gfm:true}),{RETURN_DOM_FRAGMENT:true,FORBID_TAGS:['img','style','input','form'],FORBID_ATTR:['style']});
}
export function renderMarkdown(node:HTMLElement, source:string) {
 const render=(text:string)=>{
  const fragment=document.createDocumentFragment();
  fragment.append(markdownFragment(text));
  fragment.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer';});
  node.replaceChildren(fragment);
 };
 render(source);
 return { update:render };
}
