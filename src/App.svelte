<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fly } from "svelte/transition";
  import {
    ArrowLeft,
    Plus,
    Search,
    LayoutGrid,
    List,
    Pin,
    FileText,
    Sun,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    MoreHorizontal,
    Download,
    Trash2,
    X,
    Check,
    BookOpen,
    Pencil,
    Maximize2,
    Minimize2,
    ArrowDownWideNarrow,
    LoaderCircle,
    Keyboard,
  } from "lucide-svelte";
  import Editor from "./lib/Editor.svelte";
  import { renderMarkdown } from "./lib/markdown";
  import { wordCount, type Pad, type TrashedPad } from "./lib/types";
  let pads: Pad[] = [];
  let trash: TrashedPad[] = [];
  let trashAvailable = true;
  let trashSelection: string[] = [];
  let permanentDelete: string[] | "all" | null = null;
  let active: Pad | null = null;
  let loading = true,
    error = "",
    saving = false,
    dirty = false,
    saveError = "";
  let query = "",
    filter: "all" | "pinned" | "trash" = "all",
    layout: "grid" | "list" = "grid";
  let dark = false,
    reading = false,
    focus = false,
    focusWriting = false,
    focusReveal = false,
    sidebar = true,
    menu = false,
    creating = false;
  let sort: "updated" | "title" = "updated";
  let editor: Editor;
  let line = 1,
    column = 1;
  let timer: ReturnType<typeof setTimeout>;
  let generation = 0;
  let titleInput: HTMLInputElement;
  let titleEditing = false;
  let menuAnchor: HTMLDivElement;
  let searchInput: HTMLInputElement;
  let renameInput: HTMLInputElement;
  let renameId: string | null = null,
    renameSource: "sidebar" | "card" = "sidebar",
    renameValue = "",
    renaming = false;
  let deleteTarget: Pad | null = null;
  let shortcutsOpen = false;
  let selectedId: string | null = null;
  const shortcutGroups = [
    { name: "General", items: [
      ["Show shortcuts", "Ctrl/⌘ + /"], ["New file", "Ctrl/⌘ + N"],
      ["Search files", "Ctrl/⌘ + K"], ["Clear search", "Ctrl/⌘ + Shift + K"], ["Save file", "Ctrl/⌘ + S"],
      ["Toggle sidebar", "Ctrl/⌘ + Shift + B"], ["Toggle theme", "Ctrl/⌘ + Shift + T"],
      ["Close menu or dialog", "Esc"],
    ] },
    { name: "Library", items: [
      ["All files", "Ctrl/⌘ + 1"], ["Pinned files", "Ctrl/⌘ + 2"],
      ["Select previous / next", "Alt + ↑ / ↓"], ["Open selected", "Enter"],
      ["Grid / list view", "Ctrl/⌘ + Shift + L"], ["Change sort", "Ctrl/⌘ + Shift + S"],
    ] },
    { name: "File", items: [
      ["Rename", "Ctrl/⌘ + Shift + R"], ["Pin / unpin", "Ctrl/⌘ + Shift + P"],
      ["Delete", "Ctrl/⌘ + Shift + Backspace"], ["Export Markdown", "Ctrl/⌘ + Shift + E"],
      ["File actions", "Ctrl/⌘ + Shift + M"], ["Write / read", "Ctrl/⌘ + Shift + V"],
      ["Focus mode", "Ctrl/⌘ + Enter"], ["Back to files", "Esc"],
    ] },
    { name: "Editor", items: [
      ["Bold", "Ctrl/⌘ + B"], ["Italic", "Ctrl/⌘ + I"],
      ["Insert link", "Ctrl/⌘ + Shift + U"],
    ] },
  ];
  $: visible = pads
    .filter(
      (p) =>
        (filter !== "pinned" || p.pinned) &&
        (p.title + " " + p.content).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  $: pinned = visible.filter((p) => p.pinned);
  $: others = visible.filter((p) => !p.pinned);
  $: if (typeof document !== "undefined")
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  onMount(() => {
    dark =
      (localStorage.getItem("rune-theme") ?? localStorage.getItem("libretto-theme") ??
        localStorage.getItem("careti-theme")) === "dark" ||
      (!(
        localStorage.getItem("rune-theme") ?? localStorage.getItem("libretto-theme") ??
        localStorage.getItem("careti-theme")
      ) &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    layout =
      (localStorage.getItem("rune-layout") ?? localStorage.getItem("libretto-layout") ??
        localStorage.getItem("careti-layout")) === "list"
        ? "list"
        : "grid";
    sidebar = innerWidth > 760;
    load();
    return () => clearTimeout(timer);
  });
  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch("/api" + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!response.ok) {
      let message = "Request failed.";
      try {
        message = (await response.json()).error || message;
      } catch {}
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }
  async function load() {
    loading = true;
    error = "";
    try {
      pads = await request("/pads");
    } catch (e) {
      error = (e as Error).message;
    }
    try {
      trash = await request("/trash");
      trashAvailable = true;
    } catch {
      trash = [];
      trashAvailable = false;
      error = error || "Trash is unavailable. Restart the API server to enable it.";
    } finally {
      loading = false;
    }
  }
  function setTheme() {
    dark = !dark;
    localStorage.setItem("rune-theme", dark ? "dark" : "light");
  }
  function setLayout(value: "grid" | "list") {
    layout = value;
    localStorage.setItem("rune-layout", value);
  }
  function updateLocal() {
    if (active)
      pads = pads.map((p) => (p.id === active!.id ? { ...active! } : p));
  }
  function changed(content?: string) {
    if (!active) return;
    if (content !== undefined) {
      active.content = content;
      if (focus) { focusWriting = true; focusReveal = false; }
    }
    generation++;
    dirty = true;
    saveError = "";
    updateLocal();
    clearTimeout(timer);
    timer = setTimeout(() => save(), 650);
  }
  async function save(): Promise<boolean> {
    clearTimeout(timer);
    if (!active || !dirty) return !saveError;
    if (saving) return false;
    const snapshot = { ...active };
    const gen = generation;
    saving = true;
    saveError = "";
    try {
      const saved: Pad = await request("/pads/" + snapshot.id, {
        method: "PUT",
        body: JSON.stringify(snapshot),
      });
      if (active?.id === snapshot.id) {
        active = {
          ...active,
          revision: saved.revision,
          updated_at: saved.updated_at,
        };
        dirty = generation !== gen;
        updateLocal();
      }
      return !dirty;
    } catch (e) {
      saveError = (e as Error).message;
      return false;
    } finally {
      saving = false;
      if (dirty && !saveError) timer = setTimeout(() => save(), 100);
    }
  }
  async function flush() {
    clearTimeout(timer);
    while (saving) await new Promise((resolve) => setTimeout(resolve, 40));
    return dirty ? await save() : !saveError;
  }
  async function open(pad: Pad) {
    if (active && !(await flush())) return;
    active = { ...(pads.find((p) => p.id === pad.id) || pad) };
    dirty = false;
    saveError = "";
    reading = false;
    focus = false;
    menu = false;
    titleEditing = false;
    line = 1;
    column = 1;
    if (innerWidth <= 760) sidebar = false;
  }
  async function back() {
    if (!(await flush())) return;
    active = null;
    focus = false;
    menu = false;
    titleEditing = false;
  }
  async function showFilter(next: "all" | "pinned" | "trash") {
    if (active && !(await flush())) return;
    active = null;
    focus = false;
    filter = next;
    trashSelection = [];
    if (innerWidth <= 760) sidebar = false;
  }
  async function create() {
    if (creating) return;
    if (active && !(await flush())) return;
    creating = true;
    try {
      const pad = await request("/pads", { method: "POST" });
      pads = [pad, ...pads];
      await open(pad);
      await editTitle();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      creating = false;
    }
  }
  async function pin(pad: Pad) {
    if (active?.id === pad.id) {
      active.pinned = !active.pinned;
      changed();
      return;
    }
    try {
      const saved = await request("/pads/" + pad.id, {
        method: "PUT",
        body: JSON.stringify({ ...pad, pinned: !pad.pinned }),
      });
      pads = pads.map((p) => (p.id === saved.id ? saved : p));
    } catch (e) {
      error = (e as Error).message;
    }
  }
  async function beginRename(pad: Pad, source: "sidebar" | "card" = "sidebar") {
    if (active && !(await flush())) return;
    renameId = pad.id;
    renameSource = source;
    renameValue = (pads.find((p) => p.id === pad.id) || pad).title;
    await tick();
    renameInput?.select();
  }
  function cancelRename() {
    renameId = null;
    renameValue = "";
  }
  async function commitRename(id: string) {
    if (renameId !== id || renaming) return;
    const pad = pads.find((p) => p.id === id);
    if (!pad) return cancelRename();
    const title = renameValue.trim() || "Untitled";
    if (title === pad.title) return cancelRename();
    renaming = true;
    try {
      const saved: Pad = await request("/pads/" + id, {
        method: "PUT",
        body: JSON.stringify({ ...pad, title }),
      });
      pads = pads.map((p) => (p.id === id ? saved : p));
      if (active?.id === id)
        active = {
          ...active,
          title: saved.title,
          revision: saved.revision,
          updated_at: saved.updated_at,
        };
      cancelRename();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      renaming = false;
    }
  }
  async function remove() {
    if (!deleteTarget) return;
    if (!trashAvailable) {
      error = "Trash is unavailable. Restart the API server before deleting files.";
      deleteTarget = null;
      return;
    }
    const id = deleteTarget.id;
    if (active?.id === id) {
      if (!(await flush())) {
        error = saveError || "Unable to save the file before moving it to Trash.";
        deleteTarget = null;
        return;
      }
    }
    try {
      await request("/pads/" + id, { method: "DELETE" });
      trash = await request("/trash");
      pads = pads.filter((p) => p.id !== id);
      if (active?.id === id) {
        active = null;
        dirty = false;
        focus = false;
      }
      deleteTarget = null;
      menu = false;
    } catch (e) {
      error = (e as Error).message;
      deleteTarget = null;
    }
  }
  async function restore(pad: TrashedPad) {
    try {
      const restored: Pad = await request("/trash/" + pad.id + "/restore", {method:"POST"});
      trash = trash.filter((p) => p.id !== pad.id);
      trashSelection = trashSelection.filter((id) => id !== pad.id);
      pads = [restored, ...pads];
      error = "";
    } catch (e) { error = (e as Error).message; }
  }
  function toggleTrashSelection(id: string) {
    trashSelection = trashSelection.includes(id) ? trashSelection.filter((item) => item !== id) : [...trashSelection, id];
  }
  async function deletePermanently() {
    if (!permanentDelete) return;
    const selection = permanentDelete;
    try {
      if (selection === "all") await request("/trash", {method:"DELETE"});
      else await request("/trash/delete", {method:"POST", body:JSON.stringify({ids:selection})});
      trash = selection === "all" ? [] : trash.filter((p) => !selection.includes(p.id));
      trashSelection = [];
      permanentDelete = null;
      error = "";
    } catch (e) { error = (e as Error).message; permanentDelete = null; }
  }
  function downloadDraft() {
    if (!active) return;
    const url = URL.createObjectURL(
      new Blob([active.content], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (active.title.replace(/[\\/:*?"<>|]/g, "-") || "Untitled") + ".md";
    a.click();
    URL.revokeObjectURL(url);
    menu = false;
  }
  async function download() {
    if (!active) return;
    if (!(await flush())) return;
    try {
      const response = await fetch('/api/pads/' + active.id + '/export');
      if (!response.ok) throw new Error('Unable to export the saved file.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = (active.title.replace(/[\\/:*?"<>|]/g, '-') || 'Untitled') + '.md';
      a.click();
      URL.revokeObjectURL(url);
      menu = false;
    } catch (e) { error = (e as Error).message; }
  }
  function preview(text: string) {
    return text
      .replace(/^#{1,6}\s+.*\n?/m, "")
      .replace(/[`*_>#\[\]]/g, "")
      .trim()
      .slice(0, 150);
  }
  function date(value: string) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  }
  async function editTitle() {
    titleEditing = true;
    await tick();
    titleInput?.focus();
    titleInput?.select();
  }
  async function toggleFocus() {
    focus = !focus;
    focusWriting = false;
    focusReveal = false;
    if (focus && !reading) {
      await tick();
      editor?.focusEditor();
    }
  }
  function revealFocusControls(event: PointerEvent) {
    if (!focus || !focusWriting) return;
    const reveal = !(event.target as Element).closest(".cm-editor");
    if (focusReveal !== reveal) focusReveal = reveal;
  }
  function clickOutsideMenu(event: PointerEvent) {
    if (menu && menuAnchor && !menuAnchor.contains(event.target as Node))
      menu = false;
  }
  function focusFromPaper(event: PointerEvent) {
    if (
      reading ||
      event.button !== 0 ||
      (event.target as Element).closest(".cm-line")
    )
      return;
    event.preventDefault();
    editor?.focusAt(event.clientX, event.clientY);
  }
  function paperFocus(node: HTMLElement) {
    node.addEventListener("pointerdown", focusFromPaper);
    return {
      destroy() {
        node.removeEventListener("pointerdown", focusFromPaper);
      },
    };
  }
  async function selectAdjacent(direction: number) {
    if (active || !visible.length) return;
    const index = visible.findIndex((pad) => pad.id === selectedId);
    const next = index < 0 ? (direction > 0 ? 0 : visible.length - 1) : (index + direction + visible.length) % visible.length;
    selectedId = visible[next].id;
    await tick();
    document.querySelectorAll<HTMLElement>(".pad-card[data-pad-id]")
      .forEach((card) => { if (card.dataset.padId === selectedId) card.scrollIntoView({ block: "nearest" }); });
  }
  function shortcutPad() {
    return active ?? visible.find((pad) => pad.id === selectedId) ?? null;
  }
  function keyboard(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const shift = event.shiftKey;
    const target = event.target as HTMLElement;
    const typing = !!target.closest('input,textarea,[contenteditable="true"]');
    if (mod && !event.altKey && !shift && (key === "/" || event.code === "Slash")) {
      event.preventDefault();
      shortcutsOpen = !shortcutsOpen;
      return;
    }
    if (event.key === "Escape") {
      if (shortcutsOpen) { shortcutsOpen = false; return; }
      if (deleteTarget) { deleteTarget = null; return; }
      if (renameId) { event.preventDefault(); cancelRename(); return; }
      if (titleEditing) { titleInput.blur(); return; }
      if (menu) { menu = false; return; }
      if (focus) { toggleFocus(); return; }
      if (active) { event.preventDefault(); back(); return; }
      if (query) { query = ""; searchInput?.blur(); }
      return;
    }
    if (shortcutsOpen || deleteTarget || renameId) return;
    if (!mod && event.altKey && !shift && !typing && !active && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      selectAdjacent(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!mod && !event.altKey && !typing && !active && event.key === "Enter" && selectedId) {
      const pad = visible.find((item) => item.id === selectedId);
      if (pad) { event.preventDefault(); open(pad); }
      return;
    }
    if (!mod || event.altKey) return;
    const pad = shortcutPad();
    if (!shift) {
      if (key === "n") { event.preventDefault(); create(); }
      else if (key === "s") { event.preventDefault(); if (active) save(); }
      else if (key === "k") {
        event.preventDefault();
        if (active) back().then(() => tick().then(() => searchInput?.focus()));
        else searchInput?.focus();
      }
      else if (key === "1" || key === "2") { event.preventDefault(); showFilter(key === "1" ? "all" : "pinned"); }
      else if (key === "enter" && active) { event.preventDefault(); toggleFocus(); }
      return;
    }
    if (key === "b") { event.preventDefault(); sidebar = !sidebar; }
    else if (key === "t") { event.preventDefault(); setTheme(); }
    else if (key === "k" && !active) { event.preventDefault(); query = ""; searchInput?.focus(); }
    else if (key === "l" && !active) { event.preventDefault(); setLayout(layout === "grid" ? "list" : "grid"); }
    else if (key === "s" && !active) { event.preventDefault(); sort = sort === "updated" ? "title" : "updated"; }
    else if (key === "v" && active) { event.preventDefault(); reading = !reading; }
    else if (key === "m" && active) { event.preventDefault(); menu = !menu; }
    else if (key === "e" && active) { event.preventDefault(); download(); }
    else if (key === "u" && active && !reading) { event.preventDefault(); editor?.wrap("[", "](https://)"); }
    else if (key === "r" && pad) { event.preventDefault(); if (active) editTitle(); else beginRename(pad); }
    else if (key === "p" && pad) { event.preventDefault(); pin(pad); }
    else if (key === "backspace" && pad) { event.preventDefault(); deleteTarget = pad; }
  }
  function openDialog(node: HTMLDialogElement, dismiss: () => void) {
    node.showModal();
    const outside = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
    };
    node.addEventListener("pointerdown", outside);
    return {
      destroy() {
        node.removeEventListener("pointerdown", outside);
        node.close();
      },
    };
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || saving) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
</script>

<svelte:window
  onkeydown={keyboard}
  onbeforeunload={beforeUnload}
  onpointerdown={clickOutsideMenu}
  onpointermove={revealFocusControls}
/>
<div class:focused={focus} class:focus-writing={focus && focusWriting && !focusReveal} class:sidebar-hidden={!sidebar} class="app-shell">
  {#if !focus && sidebar}<button
      class="sidebar-scrim"
      aria-label="Close sidebar"
      onclick={() => (sidebar = false)}
    ></button>{/if}
    <aside class="sidebar" inert={!sidebar || focus} aria-hidden={!sidebar || focus}>
      <a
        href="/"
        class="brand"
        onclick={(e) => {
          e.preventDefault();
          back();
        }}
        aria-label="Rune home">Rune</a
      >
      <button class="sidebar-create" onclick={create} disabled={creating}
        ><Plus size={15} /> New File</button
      >
      <nav aria-label="Library">
        <button
          class:chosen={filter === "all" && !active}
          onclick={() => showFilter("all")}
          ><FileText size={16} /> Files <span>{pads.length}</span></button
        >
        <button
          class:chosen={filter === "pinned" && !active}
          onclick={() => showFilter("pinned")}
          ><Pin size={16} /> Pinned
          <span>{pads.filter((p) => p.pinned).length}</span></button
        >
        <button class:chosen={filter === "trash" && !active} onclick={() => showFilter("trash")}
          ><Trash2 size={16} /> Trash <span>{trash.length}</span></button>
      </nav>
      <div class="script-list">
        {#each [...pads].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)) as pad (pad.id)}
          <div class:current={active?.id === pad.id} class="script-row">
            {#if renameId === pad.id && renameSource === "sidebar"}
              <input
                bind:this={renameInput}
                class="sidebar-rename"
                bind:value={renameValue}
                maxlength="200"
                aria-label={"Rename " + pad.title}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRename(pad.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                onblur={() => commitRename(pad.id)}
              />
            {:else}
              <button
                class="script-open"
                onclick={() => open(pad)}
                title={pad.title}><span>{pad.title || "Untitled"}</span></button
              >
              <button
                class="row-action"
                aria-label={"Rename " + pad.title}
                title="Rename"
                onclick={() => beginRename(pad)}><Pencil size={13} /></button
              >
              <button
                class="row-action"
                aria-label={"Delete " + pad.title}
                title="Delete"
                onclick={() => (deleteTarget = pad)}
                ><Trash2 size={13} /></button
              >
            {/if}
          </div>
        {/each}
      </div>
      {#if error}<div class="sidebar-error" role="alert">{error}</div>{/if}
      <div class="sidebar-bottom">
        <button
          class="shortcuts-button"
          onclick={() => (shortcutsOpen = true)}
          title="Keyboard shortcuts · Ctrl/⌘ + /"
          ><Keyboard size={16} /> Shortcuts</button
        >
        <button
          class="icon"
          aria-label={dark ? "Use light theme" : "Use dark theme"}
          title="Theme"
          onclick={setTheme}
          >{#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}</button
        >
      </div>
    </aside>
  <main>
    {#if !focus}
      <header class="topbar">
        <button
          class="icon sidebar-toggle"
          onclick={() => (sidebar = !sidebar)}
          aria-label="Toggle sidebar"
          >{#if sidebar}<PanelLeftClose size={17} />{:else}<PanelLeftOpen size={17} />{/if}</button
        ><button
          class="icon mobile-theme"
          aria-label={dark ? "Use light theme" : "Use dark theme"}
          onclick={setTheme}
          >{#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}</button
        >
      </header>
    {/if}
    {#if active}
      <section class="writer">
        <div class="writer-toolbar" inert={focus && focusWriting && !focusReveal}>
          <div class="writer-back">
            {#if !focus}<button onclick={back} class="text-button"
                ><ArrowLeft size={16} /> Files</button
              >{/if}<span class="save-status" class:failed={!!saveError}
              >{#if saving}<LoaderCircle size={13} class="spin" /> Saving{:else if saveError}<button
                  onclick={() => save()}>Retry save</button
                >{:else if dirty}Unsaved{:else}<Check size={13} /> Saved{/if}</span
            >
          </div>
          <div class="writer-title">
            {#if titleEditing}<input
                class="toolbar-title-input"
                bind:this={titleInput}
                aria-label="File title"
                maxlength="200"
                bind:value={active.title}
                oninput={() => changed()}
                onblur={() => (titleEditing = false)}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    titleInput.blur();
                  }
                }}
                placeholder="Untitled"
              />{:else}<button
                class="toolbar-title"
                title="Rename"
                aria-label={"Rename " + (active.title || "Untitled")}
                onclick={editTitle}>{active.title || "Untitled"}</button
              >{/if}
          </div>
          <div class="writer-actions">
            <div class="segmented">
              <button
                class:active={!reading}
                onclick={() => (reading = false)}
                aria-label="Write"
                title="Write"><Pencil size={15} /><span>Write</span></button
              ><button
                class:active={reading}
                onclick={() => (reading = true)}
                aria-label="Read"
                title="Read"><BookOpen size={15} /><span>Read</span></button
              >
            </div>
            <button
              class="icon"
              onclick={toggleFocus}
              aria-label={focus ? "Exit focus mode" : "Focus mode"}
              title="Focus"
              >{#if focus}<Minimize2 size={16} />{:else}<Maximize2
                  size={16}
                />{/if}</button
            >
            <div class="menu-anchor" bind:this={menuAnchor}>
              <button
                class="icon"
                onclick={() => (menu = !menu)}
                aria-label="File actions"
                aria-expanded={menu}><MoreHorizontal size={19} /></button
              >{#if menu}<div
                  class="dropdown"
                  transition:fly={{ y: -6, duration: 180 }}
                >
                  <button
                    onclick={() => {
                      pin(active!);
                      menu = false;
                    }}
                    ><Pin size={15} />{active.pinned ? "Unpin" : "Pin"}</button
                  ><button onclick={download}
                    ><Download size={15} />Export Markdown</button
                  ><button
                    onclick={() => {
                      deleteTarget = active;
                      menu = false;
                    }}><Trash2 size={15} />Delete File</button
                  >
                </div>{/if}
            </div>
          </div>
        </div>
        {#if saveError}<div class="error-banner">
            {saveError} <button onclick={downloadDraft}>Export draft</button>
          </div>{/if}
        <div class="writing-scroll">
          <div class="paper" use:paperFocus>
            <div class:hidden={reading}>
              {#key active.id}<Editor
                  bind:this={editor}
                  content={active.content}
                  onchange={changed}
                  onselection={(l, c) => {
                    line = l;
                    column = c;
                  }}
                  onshowshortcuts={() => (shortcutsOpen = true)}
                />{/key}
            </div>
            {#if reading}<article
                class="markdown reading"
                use:renderMarkdown={active.content}
              ></article>{/if}
          </div>
        </div>
        <footer class="editor-footer" inert={focus && focusWriting && !focusReveal}>
          <div>
            {#if !reading}<button
                onclick={() => editor?.wrap("**")}
                title="Bold · Ctrl/⌘ B"><strong>B</strong></button
              ><button
                onclick={() => editor?.wrap("*")}
                title="Italic · Ctrl/⌘ I"><em>I</em></button
              ><button
                onclick={() => editor?.wrap("[", "](https://)")}
                title="Insert link">↗</button
              ><span>Ln {line}, Col {column}</span>{/if}
          </div>
        </footer>
      </section>
    {:else}
      <div class="dashboard">
        <div class="dashboard-heading">
          <h1>{filter === "trash" ? "Trash" : filter === "pinned" ? "Pinned" : "Files"}</h1>
          {#if filter !== "trash"}<button class="primary" onclick={create} disabled={creating}
            ><Plus size={16} /> New File</button
          >{:else if trash.length}<button class="text-button" onclick={() => (permanentDelete = "all")}>Permanently Delete All</button>{/if}
        </div>
        {#if filter === "trash"}
          {#if error}<div class="error-banner" role="alert">{error} <button onclick={load}>Retry</button></div>{/if}
          {#if loading}<div class="empty">Loading…</div>
          {:else if !trashAvailable}<div class="empty"><p>Trash is unavailable. Restart the API server to enable it.</p></div>
          {:else if !trash.length}<div class="empty"><p>Trash is empty</p></div>
          {:else}
            <div class="trash-toolbar">
              <span>{trashSelection.length ? trashSelection.length + " selected" : "Select files to permanently delete"}</span>
              {#if trashSelection.length}<button class="primary" onclick={() => (permanentDelete = [...trashSelection])}>Permanently Delete Selected</button>{/if}
            </div>
            <div class="trash-list">
              {#each trash as pad (pad.id)}
                <div class="trash-row">
                  <button class="trash-select" class:selected={trashSelection.includes(pad.id)} aria-pressed={trashSelection.includes(pad.id)} aria-label={"Select " + pad.title} onclick={() => toggleTrashSelection(pad.id)}>{#if trashSelection.includes(pad.id)}<Check size={15} />{/if}</button>
                  <div class="trash-details"><strong>{pad.title}</strong><span>Deleted {date(pad.deleted_at)}</span></div>
                  <button class="text-button" onclick={() => restore(pad)}>Restore</button>
                  <button class="text-button" onclick={() => (permanentDelete = [pad.id])}>Permanently Delete</button>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
        <div class="library-toolbar">
          <label class="search-box"
            ><Search size={16} /><input
              bind:this={searchInput}
              bind:value={query}
              placeholder="Search files"
              aria-label="Search files"
            />{#if query}<button
                class="icon"
                onclick={() => (query = "")}
                aria-label="Clear search"><X size={14} /></button
              >{/if}</label
          >
          <div class="view-controls">
            <button
              class="sort-button"
              onclick={() => (sort = sort === "updated" ? "title" : "updated")}
              title="Change sort"
              ><ArrowDownWideNarrow size={15} /><span
                >{sort === "updated" ? "Last edited" : "Title A–Z"}</span
              ></button
            >
            <div class="segmented">
              <button
                class:active={layout === "grid"}
                onclick={() => setLayout("grid")}
                aria-label="Preview view"
                title="Preview view"><LayoutGrid size={16} /></button
              ><button
                class:active={layout === "list"}
                onclick={() => setLayout("list")}
                aria-label="List view"
                title="List view"><List size={17} /></button
              >
            </div>
          </div>
        </div>
        {#if error}<div class="error-banner" role="alert">
            {error} <button onclick={load}>Retry</button>
          </div>{/if}
        {#if loading}<div class="empty">Loading…</div>
        {:else if !visible.length}<div class="empty">
            <p>
              {query
                ? "No results"
                : filter === "pinned"
                  ? "No pinned files"
                  : "No files yet"}
            </p>
            {#if !query && filter === "all"}<button
                class="primary"
                onclick={create}><Plus size={16} /> New File</button
              >{/if}
          </div>
        {:else}
          {#each filter === "pinned" ? [{ name: "", items: visible }] : query ? [{ name: "", items: visible }] : [{ name: "Pinned", items: pinned }, { name: "", items: others }] as group}
            {#if group.items.length}<section class="pad-section">
                {#if group.name}<h2 class="section-heading">
                    {group.name}
                  </h2>{:else if filter === "all" && !query && pinned.length}<hr class="section-divider" />{/if}
                <div class:pad-list={layout === "list"} class="pad-grid">
                  {#each group.items as pad}
                    <div class="pad-card" class:selected={selectedId === pad.id} data-pad-id={pad.id}>
                      <button class="pad-open" onclick={() => open(pad)}
                        ><h3>{pad.title}</h3>
                        {#if layout === "grid"}<p class="card-preview">
                            {preview(pad.content) || ""}
                          </p>{/if}
                        <div class="card-bottom">
                          <span>{date(pad.updated_at)}</span><span
                            >{wordCount(pad.content)} words</span
                          >
                        </div></button>
                      {#if renameId === pad.id && renameSource === "card"}<input
                          bind:this={renameInput}
                          class="card-rename"
                          bind:value={renameValue}
                          maxlength="200"
                          aria-label={"Rename " + pad.title}
                          onblur={() => commitRename(pad.id)}
                          onkeydown={(event) => {
                            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                            if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
                          }}
                        />{/if}
                      <button
                        class="card-rename-button icon"
                        onclick={() => beginRename(pad, "card")}
                        aria-label={"Rename " + pad.title}
                        title="Rename File"><Pencil size={14} /></button
                      ><button
                        class="card-pin icon"
                        class:filled={pad.pinned}
                        onclick={() => pin(pad)}
                        aria-label={pad.pinned
                          ? "Unpin " + pad.title
                        : "Pin " + pad.title}><Pin size={14} /></button
                      ><button
                        class="card-delete icon"
                        onclick={() => (deleteTarget = pad)}
                        aria-label={"Delete " + pad.title}
                        title="Delete File"><Trash2 size={14} /></button
                      >
                    </div>
                  {/each}
                </div>
              </section>{/if}
          {/each}
        {/if}
        {/if}
      </div>
    {/if}
  </main>
</div>
{#if deleteTarget}
  <dialog
    use:openDialog={() => (deleteTarget = null)}
    class="modal"
    oncancel={() => (deleteTarget = null)}
    aria-modal="true"
    aria-label="Delete File"
  >
    <button
      class="modal-close icon"
      onclick={() => (deleteTarget = null)}
      aria-label="Close dialog"><X size={18} /></button
    >
    <h2>Move to Trash?</h2>
    <p>“{deleteTarget.title}” will be moved to Trash.</p>
    <div class="modal-actions">
      <button class="text-button" onclick={() => (deleteTarget = null)}
        >Cancel</button
      ><button class="primary" onclick={remove}>Move to Trash</button>
    </div>
  </dialog>
{/if}
{#if permanentDelete}
  <dialog use:openDialog={() => (permanentDelete = null)} class="modal" oncancel={() => (permanentDelete = null)} aria-modal="true" aria-label="Permanently Delete Files">
    <button class="modal-close icon" onclick={() => (permanentDelete = null)} aria-label="Close dialog"><X size={18} /></button>
    <h2>Permanently Delete?</h2>
    <p>{permanentDelete === "all" ? "All files in Trash" : permanentDelete.length === 1 ? "This file" : `${permanentDelete.length} files`} will be permanently deleted. This cannot be undone.</p>
    <div class="modal-actions"><button class="text-button" onclick={() => (permanentDelete = null)}>Cancel</button><button class="primary" onclick={deletePermanently}>Permanently Delete</button></div>
  </dialog>
{/if}
{#if shortcutsOpen}
  <dialog
    use:openDialog={() => (shortcutsOpen = false)}
    class="modal shortcuts-modal"
    oncancel={() => (shortcutsOpen = false)}
    aria-modal="true"
    aria-label="Keyboard shortcuts"
  >
    <button class="modal-close icon" onclick={() => (shortcutsOpen = false)} aria-label="Close shortcuts"><X size={18} /></button>
    <h2>Keyboard shortcuts</h2>
    <div class="shortcut-groups">
      {#each shortcutGroups as group}
        <section><h3>{group.name}</h3>
          {#each group.items as item}
            <div class="shortcut-row"><span>{item[0]}</span><kbd>{item[1]}</kbd></div>
          {/each}
        </section>
      {/each}
    </div>
  </dialog>
{/if}
