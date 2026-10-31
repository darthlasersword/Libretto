import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';

export const previewHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.link,
    textDecoration: "underline",
    textUnderlineOffset: "4px",
  },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.monospace, backgroundColor: "var(--surface)" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
  { tag: tags.meta, color: "var(--muted)" },
]));

class ListBullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'cm-preview-bullet'; span.textContent = '•'; return span; }
  ignoreEvent() { return false; }
}
class Checkbox extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super(); }
  eq(other: Checkbox) { return this.checked === other.checked && this.from === other.from; }
  toDOM(view: EditorView) {
    const box = document.createElement('span');
    box.className = 'cm-preview-checkbox' + (this.checked ? ' checked' : '');
    box.textContent = this.checked ? '\u2713' : '';
    box.setAttribute('aria-hidden', 'true');
    box.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({changes: {from: this.from + 1, to: this.from + 2, insert: this.checked ? ' ' : 'x'}, userEvent: 'input'});
    });
    return box;
  }
}
class ImagePreview extends WidgetType {
  constructor(readonly source: string, readonly alt: string) { super(); }
  eq(other: ImagePreview) { return this.source === other.source && this.alt === other.alt; }
  toDOM() { const image = document.createElement('img'); image.className = 'cm-preview-image'; image.alt = this.alt; image.src = this.source; image.referrerPolicy = 'no-referrer'; return image; }
  ignoreEvent() { return false; }
}
class TableSeparator extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'cm-preview-table-separator'; span.textContent = '\u2502'; return span; }
  ignoreEvent() { return false; }
}
class RulePreview extends WidgetType {
  toDOM() { const rule = document.createElement('span'); rule.className = 'cm-preview-rule'; return rule; }
  ignoreEvent() { return false; }
}
const hidden = Decoration.replace({});
const bullet = Decoration.replace({widget: new ListBullet()});
const lineStyles: Record<string, string> = {
  ATXHeading1: 'cm-preview-heading-1', ATXHeading2: 'cm-preview-heading-2', ATXHeading3: 'cm-preview-heading-3',
  ATXHeading4: 'cm-preview-heading-4', ATXHeading5: 'cm-preview-heading-5', ATXHeading6: 'cm-preview-heading-6',
  SetextHeading1: 'cm-preview-heading-1', SetextHeading2: 'cm-preview-heading-2',
  Blockquote: 'cm-preview-quote', FencedCode: 'cm-preview-code', CodeBlock: 'cm-preview-code',
  TableHeader: 'cm-preview-table-header', TableRow: 'cm-preview-table-row',
};

/** Build decorations without changing the document or its selection. */
export function previewDecorations(state: EditorState, focused: boolean, viewport = {from: 0, to: state.doc.length}): DecorationSet {
  const activeLines = new Set<number>();
  if (focused) for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) activeLines.add(line);
  }
  const ranges: {from: number; to: number; value: Decoration}[] = [];
  const inactive = (from: number, to: number) => {
    const first = state.doc.lineAt(from).number, last = state.doc.lineAt(to).number;
    for (let line = first; line <= last; line++) if (activeLines.has(line)) return false;
    return true;
  };
  // Inline formatting is revealed only while a selection intersects it. A
  // A caret touching either boundary still belongs to the formatting.
  const inlineActive = (from: number, to: number) => focused && state.selection.ranges.some(range =>
    range.empty ? range.from >= from && range.from <= to : range.from < to && range.to > from
  );
  const replace = (from: number, to: number, value = hidden, inlineScope?: {from: number; to: number}) => {
    if (to <= from || (inlineScope ? inlineActive(inlineScope.from, inlineScope.to) : !inactive(from, to))) return;
    const first = state.doc.lineAt(from), last = state.doc.lineAt(to);
    if (first.number === last.number) { ranges.push({from, to, value}); return; }
    // View plugins cannot replace line breaks. Keep multiline widgets as source;
    // split plain hidden ranges into individual line segments.
    if (value !== hidden) return;
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n), start = Math.max(from, line.from), end = Math.min(to, line.to);
      if (end > start) ranges.push({from: start, to: end, value});
    }
  };
  syntaxTree(state).iterate({from: viewport.from, to: viewport.to, enter(node) {
    const name = node.name;
    const parent = node.node.parent?.name;
    const style = lineStyles[name];
    if (style) {
      const first = state.doc.lineAt(Math.max(node.from, viewport.from)).number, last = state.doc.lineAt(Math.min(node.to, viewport.to)).number;
      for (let i = first; i <= last; i++) {
        const line = state.doc.line(i);
        if (!activeLines.has(i)) ranges.push({from: line.from, to: line.from, value: Decoration.line({class: style})});
      }
    }
    if (name === 'Escape') {
      replace(node.from, node.from + 1, hidden, node);
    } else if (name === 'Autolink') {
      for (const mark of node.node.getChildren('LinkMark')) replace(mark.from, mark.to, hidden, node);
    } else if (name === 'TableDelimiter') {
      if (parent === 'Table') replace(node.from, node.to);
      else replace(node.from, node.to, Decoration.replace({widget: new TableSeparator()}));
    } else if (name === 'HeaderMark' || name === 'QuoteMark') {
      let end = node.to;
      if (state.doc.sliceString(end, end + 1) === ' ') end++;
      replace(node.from, end);
    } else if (name === 'EmphasisMark' || name === 'StrikethroughMark' || (name === 'CodeMark' && parent === 'InlineCode')) {
      replace(node.from, node.to, hidden, node.node.parent ?? node);
    } else if (name === 'ListMark' && /^[-+*]$/.test(state.sliceDoc(node.from, node.to))) {
      replace(node.from, node.to, bullet);
    } else if (name === 'TaskMarker') {
      replace(node.from, node.to, Decoration.replace({widget: new Checkbox(/x/i.test(state.sliceDoc(node.from, node.to)), node.from)}));
    } else if (name === 'Image') {
      const url = node.node.getChild('URL');
      const marks = node.node.getChildren('LinkMark');
      if (url && marks.length >= 2) {
        const source = state.sliceDoc(url.from, url.to);
        let safe = false;
        try { safe = ['http:', 'https:'].includes(new URL(source, 'https://rune.invalid/').protocol); } catch { /* Keep invalid URLs as source. */ }
        if (safe) {
          replace(node.from, node.to, Decoration.replace({widget: new ImagePreview(source, state.sliceDoc(marks[0].to, marks[1].from))}), node);
          return false;
        }
      }
    } else if (name === 'HorizontalRule') {
      replace(node.from, node.to, Decoration.replace({widget: new RulePreview()}));
    } else if (name === 'Link') {
      const children = node.node.getChildren('LinkMark');
      if (children.length >= 2) {
        replace(children[0].from, children[0].to, hidden, node);
        replace(children[1].from, node.to, hidden, node);
      }
    } else if (name === 'FencedCode') {
      for (const mark of node.node.getChildren('CodeMark')) {
        const line = state.doc.lineAt(mark.from);
        replace(line.from, line.to);
      }
      // Embedded language syntax is code, not Markdown to be decorated.
      return false;
    }
  }});
  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) builder.add(range.from, range.to, range.value);
  return builder.finish();
}

export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = previewDecorations(view.state, view.hasFocus, view.viewport); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state))
      this.decorations = previewDecorations(update.state, update.view.hasFocus, update.view.viewport);
  }
}, {decorations: value => value.decorations});
