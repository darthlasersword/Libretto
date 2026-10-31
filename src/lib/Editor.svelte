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
  import { livePreview, previewHighlight } from "./live-preview";
  export let content = "";
  export let onchange: (value: string) => void;
  export let onshowshortcuts: () => void = () => {};
  let host: HTMLDivElement;
  let view: EditorView;
  export function focusEditor() { view?.requestMeasure(); view?.focus(); }
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
          previewHighlight,
          livePreview,
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
          }),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
  });
</script>

<div class="codemirror-host" bind:this={host}></div>
