import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false });
markdown.use(taskLists);
markdown.core.ruler.push('table_alignment', state => {
 for (const token of state.tokens) {
  if (token.type !== 'th_open' && token.type !== 'td_open') continue;
  const style = token.attrGet('style');
  const alignment = typeof style === 'string' ? style.match(/^text-align:(left|right|center)$/)?.[1] : undefined;
  if (alignment) { token.attrSet('align', alignment); token.attrSet('style', ''); }
 }
});
// Markdown parsing and DOM insertion are separate from the editing engine.
// Raw HTML is sanitized before it ever enters the live document.
export function markdownFragment(source:string):DocumentFragment {
 const fragment = DOMPurify.sanitize(markdown.render(source),{RETURN_DOM_FRAGMENT:true,FORBID_TAGS:['style','form'],FORBID_ATTR:['style']});
 fragment.querySelectorAll('input').forEach(input => { if (input.type !== 'checkbox') input.remove(); else input.disabled = true; });
 return fragment;
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
