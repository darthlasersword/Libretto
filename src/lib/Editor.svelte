<script lang="ts">
  import { onMount } from "svelte";
  import { EditorState, Prec } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    drawSelection,
  } from "@codemirror/view";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
  } from "@codemirror/commands";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
  import { tags } from "@lezer/highlight";
  export let content = "";
  export let onchange: (value: string) => void;
  export let onselection: (line: number, column: number) => void = () => {};
  export let onshowshortcuts: () => void = () => {};
  let host: HTMLDivElement;
  let view: EditorView;
  export function focusEditor() { view?.focus(); }
  export function focusAt(x: number, y: number) {
    if (!view) return;
    const lines = Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"));
    const nearest = lines.reduce<HTMLElement | null>((best, line) => {
      if (!best) return line;
      const distance = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return Math.max(rect.top - y, 0, y - rect.bottom);
      };
      return distance(line) < distance(best) ? line : best;
    }, null);
    if (!nearest) {
      view.focus();
      return;
    }
    const bounds = nearest.getBoundingClientRect();
    const point = {
      x: Math.max(bounds.left + 1, Math.min(x, bounds.right - 1)),
      y: Math.max(bounds.top + 1, Math.min(y, bounds.bottom - 1)),
    };
    const position = view.posAtCoords(point) ?? view.posAtDOM(nearest, 0);
    view.dispatch({ selection: { anchor: position } });
    view.focus();
  }
  export function wrap(before: string, after = before) {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: {
        from,
        to,
        insert: before + view.state.sliceDoc(from, to) + after,
      },
      selection: { anchor: from + before.length, head: to + before.length },
      userEvent: "input",
    });
    view.focus();
  }
  onMount(() => {
    const highlight = HighlightStyle.define([
      { tag: tags.heading1, fontSize: "1.65em", fontWeight: "700" },
      { tag: tags.heading2, fontSize: "1.3em", fontWeight: "700" },
      { tag: tags.heading3, fontWeight: "700" },
      { tag: tags.strong, fontWeight: "700" },
      { tag: tags.emphasis, fontStyle: "italic" },
      {
        tag: tags.link,
        textDecoration: "underline",
        textUnderlineOffset: "4px",
      },
      { tag: tags.url, color: "var(--muted)" },
      { tag: tags.monospace, backgroundColor: "var(--surface)" },
      { tag: tags.processingInstruction, color: "var(--muted)" },
      { tag: tags.meta, color: "var(--muted)" },
    ]);
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        extensions: [
          Prec.highest(keymap.of([{
            key: "Mod-/",
            run: () => { onshowshortcuts(); return true; },
          }])),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          keymap.of([
            {
              key: "Mod-b",
              run: () => {
                wrap("**");
                return true;
              },
            },
            {
              key: "Mod-i",
              run: () => {
                wrap("*");
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Markdown editor",
            spellcheck: "true",
            autocapitalize: "sentences",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onchange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head;
              const line = update.state.doc.lineAt(pos);
              onselection(line.number, pos - line.from + 1);
            }
          }),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
  });
</script>

<div class="codemirror-host" bind:this={host}></div>
