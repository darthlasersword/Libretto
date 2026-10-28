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
    Eye,
    RotateCcw,
    Database,
    Upload,
    Settings,
    Folder as FolderIcon,
    FolderPlus,
    FilePlus,
    FileUp,
    ChevronRight,
    ChevronDown,
    MoreVertical,
  } from "lucide-svelte";
  import Editor from "./lib/Editor.svelte";
  import { renderMarkdown } from "./lib/markdown";
  import { importFiles } from "./lib/upload";
  import { filePath } from "./lib/paths";
  import {
    defaultPreferences,
    fontFamilies,
    parsePreferences,
    preferencesKey,
    type Preferences,
  } from "./lib/preferences";
  import {
    wordCount,
    type Folder,
    type Pad,
    type TrashedPad,
  } from "./lib/types";
  let pads: Pad[] = [];
  let folders: Folder[] = [];
  let expandedFolders: string[] = [];
  let cardMenu: string | null = null;
  let uploadBusy = false;
  let folderDialogOpen = false;
  let folderName = "";
  let folderCreating = false;
  let folderError = "";
  let fileUpload: HTMLInputElement;
  let folderUpload: HTMLInputElement;
  let trash: TrashedPad[] = [];
  let trashAvailable = true;
  let trashSelection: string[] = [];
  let permanentDelete: string[] | "all" | null = null;
  let trashPreview: TrashedPad | null = null;
  let active: Pad | null = null;
  let openIds: string[] = [];
  let loading = true,
    error = "",
    saving = false,
    dirty = false,
    saveError = "";
  let query = "",
    filter: "all" | "pinned" | "trash" = "all",
    layout: "grid" | "list" = "grid";
  let dark = true,
    reading = false,
    focus = false,
    focusWriting = false,
    focusReveal = false,
    sidebar = true,
    menu = false,
    creating = false;
  type SortOrder =
    | "updated"
    | "updated-oldest"
    | "title"
    | "title-desc"
    | "created"
    | "created-oldest"
    | "opened";
  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: "updated", label: "Last edited" },
    { value: "updated-oldest", label: "Oldest edit" },
    { value: "opened", label: "Recently opened" },
    { value: "created", label: "Newest created" },
    { value: "created-oldest", label: "Oldest created" },
    { value: "title", label: "Title A–Z" },
    { value: "title-desc", label: "Title Z–A" },
  ];
  let sort: SortOrder = "updated";
  let sortMenu = false;
  let sortAnchor: HTMLDivElement;
  let recentIds: string[] = [];
  let editor: Editor;
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
  let readModes: Record<string, boolean> = {};
  let setupRequired = false;
  let storagePath = "";
  let setupError = "";
  let setupBusy = false;
  let browsingFolder = false;
  let settingsOpen = false;
  let settingsSection: "appearance" | "editor" | "files" | "data" =
    "appearance";
  let preferences: Preferences = { ...defaultPreferences };
  let preferencesReady = false;
  $: if (preferencesReady && typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(preferences.interfaceSize / 16),
    );
    document.documentElement.style.setProperty(
      "--ui-font",
      fontFamilies[preferences.interfaceFont],
    );
    document.documentElement.style.setProperty(
      "--editor-font",
      fontFamilies[preferences.editorFont],
    );
    document.documentElement.style.setProperty(
      "--editor-size",
      preferences.editorSize + "px",
    );
    document.documentElement.style.setProperty("--padding-scale", String(preferences.padding / 100));
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    } catch {}
  }
  let backupBusy = false;
  let resetBusy = false;
  let resetVerified = false;
  $: if (pads.length || trash.length || folders.length || dirty)
    resetVerified = false;
  let notice = "";
  let noticeTimer: ReturnType<typeof setTimeout>;
  let stateReady = false;
  const stateKey = "rune-state-v1";
  const draftKey = "rune-draft-v1";
  type SavedState = {
    activeId: string | null;
    theme: "dark" | "light";
    layout: "grid" | "list";
    filter: "all" | "pinned" | "trash";
    sort: SortOrder;
    recentIds: string[];
    query: string;
    sidebar: boolean;
    reading: boolean;
    readModes: Record<string, boolean>;
    focus: boolean;
    selectedId: string | null;
    openIds: string[];
  };
  function readState(): Partial<SavedState> {
    try {
      return JSON.parse(localStorage.getItem(stateKey) || "{}") || {};
    } catch {
      return {};
    }
  }
  $: if (stateReady) {
    const state: SavedState = {
      activeId: active?.id ?? null,
      theme: dark ? "dark" : "light",
      layout,
      filter,
      sort,
      recentIds,
      query,
      sidebar,
      reading,
      readModes,
      focus,
      selectedId,
      openIds,
    };
    try {
      localStorage.setItem(stateKey, JSON.stringify(state));
    } catch {}
  }
  const shortcutGroups = [
    {
      name: "General",
      items: [
        ["Show shortcuts", "Ctrl/⌘ + /"],
        ["New file", "Ctrl/⌘ + N"],
        ["Search files", "Ctrl/⌘ + K"],
        ["Clear search", "Ctrl/⌘ + Shift + K"],
        ["Save file", "Ctrl/⌘ + S"],
        ["Toggle sidebar", "Ctrl/⌘ + Shift + B"],
        ["Toggle theme", "Ctrl/⌘ + Shift + T"],
        ["Close menu or dialog", "Esc"],
      ],
    },
    {
      name: "Library",
      items: [
        ["All files", "Ctrl/⌘ + 1"],
        ["Pinned files", "Ctrl/⌘ + 2"],
        ["Select previous / next", "Alt + ↑ / ↓"],
        ["Open selected", "Enter"],
        ["Grid / list view", "Ctrl/⌘ + Shift + L"],
        ["Open sort menu", "Ctrl/⌘ + Shift + S"],
      ],
    },
    {
      name: "File",
      items: [
        ["Rename", "Ctrl/⌘ + Shift + R"],
        ["Pin / unpin", "Ctrl/⌘ + Shift + P"],
        ["Delete", "Ctrl/⌘ + Shift + Backspace"],
        ["Export Markdown", "Ctrl/⌘ + Shift + E"],
        ["File actions", "Ctrl/⌘ + Shift + M"],
        ["Write / read", "Ctrl/⌘ + Shift + V"],
        ["Focus mode", "Ctrl/⌘ + Enter"],
        ["Back to files", "Esc"],
      ],
    },
    {
      name: "Editor",
      items: [
        ["Bold", "Ctrl/⌘ + B"],
        ["Italic", "Ctrl/⌘ + I"],
        ["Insert link", "Ctrl/⌘ + Shift + U"],
      ],
    },
  ];
  function comparePads(
    a: Pad,
    b: Pad,
    order: SortOrder,
    recent: string[],
  ): number {
    const edited = +new Date(b.updated_at) - +new Date(a.updated_at);
    switch (order) {
      case "updated-oldest":
        return -edited || a.title.localeCompare(b.title);
      case "opened": {
        const aIndex = recent.indexOf(a.id),
          bIndex = recent.indexOf(b.id);
        if (aIndex !== bIndex)
          return aIndex < 0 ? 1 : bIndex < 0 ? -1 : aIndex - bIndex;
        return edited || a.title.localeCompare(b.title);
      }
      case "created":
        return +new Date(b.created_at) - +new Date(a.created_at) || edited;
      case "created-oldest":
        return +new Date(a.created_at) - +new Date(b.created_at) || edited;
      case "title":
        return a.title.localeCompare(b.title) || edited;
      case "title-desc":
        return b.title.localeCompare(a.title) || edited;
      default:
        return edited || a.title.localeCompare(b.title);
    }
  }
  $: sidebarPads = [...pads].sort((a, b) =>
    comparePads(a, b, "opened", recentIds),
  );
  $: folderRows = flattenFolders(folders, expandedFolders);
  function flattenFolders(items: Folder[], expanded: string[]) {
    const rows: { folder: Folder; depth: number }[] = [];
    const visit = (parent: string | null, depth: number, seen: Set<string>) => {
      for (const folder of items.filter(
        (f) => f.parent_id === parent && !seen.has(f.id),
      )) {
        rows.push({ folder, depth });
        if (expanded.includes(folder.id))
          visit(folder.id, depth + 1, new Set([...seen, folder.id]));
      }
    };
    visit(null, 0, new Set());
    return rows;
  }
  $: visible = pads
    .filter(
      (p) =>
        (filter !== "pinned" || p.pinned) &&
        (filePath(p, folders) + " " + p.content)
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => comparePads(a, b, sort, recentIds));
  $: pinned = visible.filter((p) => p.pinned);
  $: others = visible.filter((p) => !p.pinned);
  $: if (typeof document !== "undefined")
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  onMount(() => {
    try {
      preferences = parsePreferences(
        JSON.parse(localStorage.getItem(preferencesKey) || "null"),
      );
    } catch {
      preferences = { ...defaultPreferences };
    }
    preferencesReady = true;
    const saved = readState();
    dark =
      saved.theme === "dark" ||
      (saved.theme !== "light" &&
        ((localStorage.getItem("rune-theme") ??
          localStorage.getItem("libretto-theme") ??
          localStorage.getItem("careti-theme")) === "dark" ||
          !(
            localStorage.getItem("rune-theme") ??
            localStorage.getItem("libretto-theme") ??
            localStorage.getItem("careti-theme")
          )));
    layout =
      (saved.layout ??
        localStorage.getItem("rune-layout") ??
        localStorage.getItem("libretto-layout") ??
        localStorage.getItem("careti-layout")) === "list"
        ? "list"
        : "grid";
    filter =
      saved.filter === "pinned" || saved.filter === "trash"
        ? saved.filter
        : "all";
    sort = sortOptions.some((option) => option.value === saved.sort)
      ? saved.sort!
      : "updated";
    recentIds = Array.isArray(saved.recentIds)
      ? saved.recentIds
          .filter((id): id is string => typeof id === "string")
          .slice(0, 1000)
      : [];
    query = "";
    sidebar =
      typeof saved.sidebar === "boolean" ? saved.sidebar : innerWidth > 760;
    selectedId = typeof saved.selectedId === "string" ? saved.selectedId : null;
    readModes =
      saved.readModes &&
      typeof saved.readModes === "object" &&
      !Array.isArray(saved.readModes)
        ? Object.fromEntries(
            Object.entries(saved.readModes).filter(
              ([, value]) => typeof value === "boolean",
            ),
          )
        : {};
    initialize().then(() => {
      if (error && !pads.length) return;
      openIds = Array.isArray(saved.openIds)
        ? [
            ...new Set(
              saved.openIds.filter(
                (id): id is string =>
                  typeof id === "string" && pads.some((p) => p.id === id),
              ),
            ),
          ]
        : [];
      const pad = pads.find((p) => p.id === saved.activeId);
      if (pad) {
        active = { ...pad };
        if (!openIds.includes(pad.id)) openIds = [...openIds, pad.id];
        if (!recentIds.includes(pad.id))
          recentIds = [pad.id, ...recentIds].slice(0, 1000);
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (
            draft?.id === pad.id &&
            draft.revision === pad.revision &&
            typeof draft.title === "string" &&
            typeof draft.content === "string"
          ) {
            active.title = draft.title;
            active.content = draft.content;
            dirty =
              active.title !== pad.title || active.content !== pad.content;
            if (dirty) {
              updateLocal();
              timer = setTimeout(() => save(), 650);
            }
          }
        } catch {}
        reading =
          typeof readModes[pad.id] === "boolean"
            ? readModes[pad.id]
            : saved.reading === true;
        readModes = { ...readModes, [pad.id]: reading };
        focus = saved.focus === true;
      }
      if (selectedId && !pads.some((p) => p.id === selectedId))
        selectedId = null;
      stateReady = true;
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(noticeTimer);
    };
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
  async function initialize() {
    try {
      const setup = await request("/setup");
      storagePath = setup.path;
      setupRequired = setup.required;
      if (setupRequired) {
        loading = false;
        return;
      }
      await load();
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  }
  async function browseFolder() {
    browsingFolder = true;
    setupError = "";
    try {
      const result = await request("/setup/browse", { method: "POST" });
      if (result.path) storagePath = result.path;
    } catch (e) {
      setupError = (e as Error).message;
    } finally {
      browsingFolder = false;
    }
  }
  async function finishSetup() {
    setupBusy = true;
    setupError = "";
    try {
      const result = await request("/setup", {
        method: "POST",
        body: JSON.stringify({ path: storagePath }),
      });
      storagePath = result.path;
      setupRequired = false;
      await load();
    } catch (e) {
      setupError = (e as Error).message;
    } finally {
      setupBusy = false;
    }
  }
  async function load() {
    loading = true;
    error = "";
    try {
      pads = await request("/pads");
      folders = await request("/folders");
    } catch (e) {
      error = (e as Error).message;
    }
    try {
      trash = await request("/trash");
      trashAvailable = true;
    } catch {
      trash = [];
      trashAvailable = false;
      error =
        error || "Trash is unavailable. Restart the API server to enable it.";
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
      if (focus) {
        focusWriting = true;
        focusReveal = false;
      }
    }
    generation++;
    dirty = true;
    saveError = "";
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          id: active.id,
          revision: active.revision,
          title: active.title,
          content: active.content,
        }),
      );
    } catch {}
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
        if (!dirty) localStorage.removeItem(draftKey);
        else
          try {
            localStorage.setItem(
              draftKey,
              JSON.stringify({
                id: active.id,
                revision: active.revision,
                title: active.title,
                content: active.content,
              }),
            );
          } catch {}
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
    settingsOpen = false;
    active = { ...(pads.find((p) => p.id === pad.id) || pad) };
    if (!openIds.includes(pad.id)) openIds = [...openIds, pad.id];
    recentIds = [pad.id, ...recentIds.filter((id) => id !== pad.id)].slice(
      0,
      1000,
    );
    sortMenu = false;
    dirty = false;
    saveError = "";
    reading = readModes[pad.id] === true;
    focus = false;
    menu = false;
    titleEditing = false;
    if (innerWidth <= 760) sidebar = false;
  }
  async function closeTab(id: string) {
    if (active?.id === id && !(await flush())) return;
    const index = openIds.indexOf(id);
    const remaining = openIds.filter((item) => item !== id);
    openIds = remaining;
    if (active?.id === id) {
      const next = pads.find(
        (p) => p.id === (remaining[index] ?? remaining[index - 1]),
      );
      if (next) await open(next);
      else {
        active = null;
        focus = false;
        menu = false;
        titleEditing = false;
      }
    }
  }
  async function back() {
    if (!(await flush())) return;
    settingsOpen = false;
    active = null;
    focus = false;
    menu = false;
    titleEditing = false;
  }
  function setReading(value: boolean) {
    reading = value;
    if (active) readModes = { ...readModes, [active.id]: value };
  }
  async function showFilter(
    next: "all" | "pinned" | "trash",
    clearSearch = false,
  ) {
    if (active && !(await flush())) return;
    settingsOpen = false;
    active = null;
    focus = false;
    filter = next;
    if (clearSearch) query = "";
    sortMenu = false;
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
  async function createFolder() {
    const name = folderName.trim();
    if (!name || folderCreating) return;
    folderCreating = true;
    folderError = "";
    try {
      const folder: Folder = await request("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parent_id: null }),
      });
      folders = [...folders, folder];
      expandedFolders = [...expandedFolders, folder.id];
      folderDialogOpen = false;
    } catch (e) {
      folderError = "Unable to create folder: " + (e as Error).message;
    } finally {
      folderCreating = false;
    }
  }
  async function renameFolder(folder: Folder) {
    const name = prompt("Folder name:", folder.name);
    if (name === null || !name.trim() || name.trim() === folder.name) return;
    try {
      const updated: Folder = await request("/folders/" + folder.id, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim() }),
      });
      folders = folders.map((f) => (f.id === updated.id ? updated : f));
    } catch (e) {
      showNotice("Unable to rename folder: " + (e as Error).message);
    }
  }
  async function deleteFolder(folder: Folder) {
    if (
      !confirm(
        `Delete folder “${folder.name}” and its subfolders? Files will be moved to the library.`,
      )
    )
      return;
    try {
      await request("/folders/" + folder.id, { method: "DELETE" });
      await load();
    } catch (e) {
      showNotice("Unable to delete folder: " + (e as Error).message);
    }
  }
  async function uploadFiles(event: Event, withFolders: boolean) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length || uploadBusy) return;
    uploadBusy = true;
    let imported = 0;
    try {
      const result = await importFiles(files, withFolders, {
        createFolder: (name, parent_id) =>
          request("/folders", {
            method: "POST",
            body: JSON.stringify({ name, parent_id }),
          }),
        createFile: (title, content, folder_id) =>
          request("/pads", {
            method: "POST",
            body: JSON.stringify({ title, content, folder_id }),
          }),
        onFolder: (folder) => {
          folders = [...folders, folder];
          expandedFolders = [...expandedFolders, folder.id];
        },
        onFile: (pad) => {
          pads = [pad, ...pads];
          imported++;
        },
      });
      const skipped = result.skipped
        ? ` Skipped ${result.skipped} unsupported file${result.skipped === 1 ? "" : "s"}; Rune imports Markdown and text files.`
        : "";
      showNotice(
        (imported
          ? `Imported ${imported} file${imported === 1 ? "" : "s"}.`
          : "No Markdown or text files found.") + skipped,
      );
    } catch (e) {
      showNotice(`Imported ${imported} files. ` + (e as Error).message);
    } finally {
      uploadBusy = false;
      input.value = "";
    }
  }
  async function movePad(pad: Pad, folder_id: string | null) {
    try {
      const moved: Pad = await request("/pads/" + pad.id + "/move", {
        method: "POST",
        body: JSON.stringify({ folder_id }),
      });
      pads = pads.map((p) => (p.id === moved.id ? moved : p));
      if (folder_id)
        expandedFolders = [...new Set([...expandedFolders, folder_id])];
      cardMenu = null;
    } catch (e) {
      showNotice("Unable to move file: " + (e as Error).message);
    }
  }
  async function showSettings() {
    if (active && !(await flush())) return;
    settingsOpen = true;
    focus = false;
    menu = false;
    if (innerWidth <= 760) sidebar = false;
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
      error =
        "Trash is unavailable. Restart the API server before deleting files.";
      deleteTarget = null;
      return;
    }
    const id = deleteTarget.id;
    if (active?.id === id) {
      if (!(await flush())) {
        error =
          saveError || "Unable to save the file before moving it to Trash.";
        deleteTarget = null;
        return;
      }
    }
    try {
      await request("/pads/" + id, { method: "DELETE" });
      trash = await request("/trash");
      pads = pads.filter((p) => p.id !== id);
      openIds = openIds.filter((item) => item !== id);
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
  function requestTrash(pad: Pad) {
    deleteTarget = pad;
    if (!preferences.confirmTrash) void remove();
  }
  async function restore(pad: TrashedPad) {
    try {
      const restored: Pad = await request("/trash/" + pad.id + "/restore", {
        method: "POST",
      });
      trash = trash.filter((p) => p.id !== pad.id);
      trashSelection = trashSelection.filter((id) => id !== pad.id);
      pads = [restored, ...pads];
      if (trashPreview?.id === pad.id) trashPreview = null;
      error = "";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  function toggleTrashSelection(id: string) {
    trashSelection = trashSelection.includes(id)
      ? trashSelection.filter((item) => item !== id)
      : [...trashSelection, id];
  }
  async function deletePermanently() {
    if (!permanentDelete) return;
    const selection = permanentDelete;
    try {
      if (selection === "all") await request("/trash", { method: "DELETE" });
      else
        await request("/trash/delete", {
          method: "POST",
          body: JSON.stringify({ ids: selection }),
        });
      trash =
        selection === "all"
          ? []
          : trash.filter((p) => !selection.includes(p.id));
      if (
        trashPreview &&
        (selection === "all" || selection.includes(trashPreview.id))
      )
        trashPreview = null;
      trashSelection = [];
      permanentDelete = null;
      error = "";
    } catch (e) {
      error = (e as Error).message;
      permanentDelete = null;
    }
  }
  function downloadDraft() {
    if (!active) return;
    startDownload(
      new Blob([active.content], { type: "text/markdown;charset=utf-8" }),
      (active.title.replace(/[\\/:*?"<>|]/g, "-") || "Untitled") + ".md",
    );
    menu = false;
  }
  function showNotice(message: string) {
    notice = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = ""), 5000);
  }
  function startDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showNotice("Download started: " + filename);
  }
  async function downloadBackup() {
    if (backupBusy) return;
    backupBusy = true;
    try {
      if (active && !(await flush()))
        throw new Error(
          saveError || "Save the current file before backing up.",
        );
      const backup = await request("/backup");
      const filename =
        "rune-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      startDownload(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
        filename,
      );
    } catch (e) {
      showNotice("Backup failed: " + (e as Error).message);
    } finally {
      backupBusy = false;
    }
  }
  async function resetRune() {
    if (
      resetBusy ||
      resetVerified ||
      !confirm(
        "Permanently delete all Rune files and trash? This cannot be undone.",
      )
    )
      return;
    resetBusy = true;
    try {
      clearTimeout(timer);
      while (saving) await new Promise((resolve) => setTimeout(resolve, 40));
      const result = await request("/reset", { method: "POST" });
      const setup = await request("/setup", { cache: "no-store" });
      if (!result.reset || !result.setupRequired || !setup.required)
        throw new Error("Server reset or storage setup could not be verified.");
      active = null;
      pads = [];
      trash = [];
      folders = [];
      expandedFolders = [];
      dirty = false;
      saveError = "";
      selectedId = null;
      recentIds = [];
      openIds = [];
      readModes = {};
      trashSelection = [];
      trashPreview = null;
      filter = "all";
      query = "";
      focus = false;
      reading = false;
      localStorage.removeItem(draftKey);
      resetVerified = true;
      showNotice("Reset verified. Refresh to choose your storage folder.");
    } catch (e) {
      showNotice("Reset failed: " + (e as Error).message);
    } finally {
      resetBusy = false;
    }
  }
  async function importBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || backupBusy) return;
    backupBusy = true;
    try {
      if (file.size > 52_000_000)
        throw new Error("Backup is too large (50 MB limit).");
      if (active && !(await flush()))
        throw new Error(saveError || "Save the current file before restoring.");
      const result = await request("/backup", {
        method: "POST",
        body: await file.text(),
      });
      await load();
      showNotice(
        `Restored ${result.scripts} files and ${result.trash} trashed files.`,
      );
    } catch (e) {
      showNotice("Restore failed: " + (e as Error).message);
    } finally {
      backupBusy = false;
      input.value = "";
    }
  }
  async function download() {
    if (!active) return;
    if (!(await flush())) return;
    try {
      const response = await fetch("/api/pads/" + active.id + "/export");
      if (!response.ok) throw new Error("Unable to export the saved file.");
      const filename =
        (active.title.replace(/[\\/:*?"<>|]/g, "-") || "Untitled") + ".md";
      startDownload(await response.blob(), filename);
      menu = false;
    } catch (e) {
      showNotice("Export failed: " + (e as Error).message);
    }
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
    const target = event.target as Element;
    if (cardMenu && !target.closest(".card-menu, .card-more")) cardMenu = null;
    if (menu && menuAnchor && !menuAnchor.contains(event.target as Node))
      menu = false;
    if (sortMenu && sortAnchor && !sortAnchor.contains(event.target as Node))
      sortMenu = false;
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
    const next =
      index < 0
        ? direction > 0
          ? 0
          : visible.length - 1
        : (index + direction + visible.length) % visible.length;
    selectedId = visible[next].id;
    await tick();
    document
      .querySelectorAll<HTMLElement>(".pad-card[data-pad-id]")
      .forEach((card) => {
        if (card.dataset.padId === selectedId)
          card.scrollIntoView({ block: "nearest" });
      });
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
    if (
      mod &&
      !event.altKey &&
      !shift &&
      (key === "/" || event.code === "Slash")
    ) {
      event.preventDefault();
      shortcutsOpen = !shortcutsOpen;
      return;
    }
    if (event.key === "Escape") {
      if (shortcutsOpen) {
        shortcutsOpen = false;
        return;
      }
      if (cardMenu) {
        cardMenu = null;
        return;
      }
      if (settingsOpen) {
        settingsOpen = false;
        return;
      }
      if (deleteTarget) {
        deleteTarget = null;
        return;
      }
      if (renameId) {
        event.preventDefault();
        cancelRename();
        return;
      }
      if (titleEditing) {
        titleInput.blur();
        return;
      }
      if (menu) {
        menu = false;
        return;
      }
      if (sortMenu) {
        sortMenu = false;
        return;
      }
      if (focus) {
        toggleFocus();
        return;
      }
      if (active) {
        event.preventDefault();
        back();
        return;
      }
      if (query) {
        query = "";
        searchInput?.blur();
      }
      return;
    }
    if (shortcutsOpen || settingsOpen || deleteTarget || renameId) return;
    if (
      !mod &&
      event.altKey &&
      !shift &&
      !typing &&
      !active &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      selectAdjacent(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (
      !mod &&
      !event.altKey &&
      !typing &&
      !active &&
      event.key === "Enter" &&
      selectedId
    ) {
      const pad = visible.find((item) => item.id === selectedId);
      if (pad) {
        event.preventDefault();
        open(pad);
      }
      return;
    }
    if (!mod || event.altKey) return;
    const pad = shortcutPad();
    if (!shift) {
      if (key === "n") {
        event.preventDefault();
        create();
      } else if (key === "s") {
        event.preventDefault();
        if (active) save();
      } else if (key === "k") {
        event.preventDefault();
        if (active) back().then(() => tick().then(() => searchInput?.focus()));
        else searchInput?.focus();
      } else if (key === "1" || key === "2") {
        event.preventDefault();
        showFilter(key === "1" ? "all" : "pinned");
      } else if (key === "enter" && active) {
        event.preventDefault();
        toggleFocus();
      }
      return;
    }
    if (key === "b") {
      event.preventDefault();
      sidebar = !sidebar;
    } else if (key === "t") {
      event.preventDefault();
      setTheme();
    } else if (key === "k" && !active) {
      event.preventDefault();
      query = "";
      searchInput?.focus();
    } else if (key === "l" && !active) {
      event.preventDefault();
      setLayout(layout === "grid" ? "list" : "grid");
    } else if (key === "s" && !active && filter !== "trash") {
      event.preventDefault();
      sortMenu = !sortMenu;
    } else if (key === "v" && active) {
      event.preventDefault();
      setReading(!reading);
    } else if (key === "m" && active) {
      event.preventDefault();
      menu = !menu;
    } else if (key === "e" && active) {
      event.preventDefault();
      download();
    } else if (key === "u" && active && !reading) {
      event.preventDefault();
      editor?.wrap("[", "](https://)");
    } else if (key === "r" && pad) {
      event.preventDefault();
      if (active) editTitle();
      else beginRename(pad);
    } else if (key === "p" && pad) {
      event.preventDefault();
      pin(pad);
    } else if (key === "backspace" && pad) {
      event.preventDefault();
      requestTrash(pad);
    }
  }
  function openDialog(node: HTMLDialogElement, dismiss: () => void) {
    node.showModal();
    const outside = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dismiss();
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
<div
  class:focused={focus}
  class:focus-writing={focus && focusWriting && !focusReveal}
  class:sidebar-hidden={!sidebar}
  class="app-shell"
>
  {#if !focus && sidebar}<button
      class="sidebar-scrim"
      aria-label="Close sidebar"
      onclick={() => (sidebar = false)}
    ></button>{/if}
  <aside
    class="sidebar"
    inert={!sidebar || focus}
    aria-hidden={!sidebar || focus}
  >
    {#if !(typeof window !== "undefined" && "__RUNE_WINDOWS_DESKTOP__" in window)}
      <a
        href="/"
        class="brand"
        onclick={(e) => {
          e.preventDefault();
          back();
        }}
        aria-label="Rune home"
        ><img class="brand-icon" src="/valknut.svg" alt="" />Rune</a
      >
    {/if}
    <div class="create-grid">
      <button onclick={create} disabled={creating}
        ><FilePlus size={17} /> New file</button
      >
      <button
        onclick={() => {
          folderName = "";
          folderError = "";
          folderDialogOpen = true;
        }}><FolderPlus size={17} /> New folder</button
      >
      <button onclick={() => fileUpload.click()} disabled={uploadBusy}
        ><FileUp size={17} /> Upload file</button
      >
      <button onclick={() => folderUpload.click()} disabled={uploadBusy}
        ><FolderPlus size={17} /> Upload folder</button
      >
      <input
        bind:this={fileUpload}
        type="file"
        accept=".md,.markdown,.txt,text/plain,text/markdown"
        multiple
        hidden
        onchange={(e) => uploadFiles(e, false)}
      />
      <input
        bind:this={folderUpload}
        type="file"
        webkitdirectory
        hidden
        onchange={(e) => uploadFiles(e, true)}
      />
    </div>
    <nav aria-label="Library">
      <button
        class:chosen={filter === "all" && !active && !settingsOpen}
        onclick={() => showFilter("all", true)}
        ><FileText size={16} /> Files <span>{pads.length}</span></button
      >
      <button
        class:chosen={filter === "trash" && !active && !settingsOpen}
        onclick={() => showFilter("trash")}
        ><Trash2 size={16} /> Trash <span>{trash.length}</span></button
      >
    </nav>
    <div class="script-list">
      {#each folderRows as row (row.folder.id)}
        <div class="folder-row" style:padding-left={row.depth * 16 + 5 + "px"}>
          <button
            class="folder-toggle"
            aria-expanded={expandedFolders.includes(row.folder.id)}
            onclick={() =>
              (expandedFolders = expandedFolders.includes(row.folder.id)
                ? expandedFolders.filter((id) => id !== row.folder.id)
                : [...expandedFolders, row.folder.id])}
          >
            {#if expandedFolders.includes(row.folder.id)}<ChevronDown
                size={15}
              />{:else}<ChevronRight size={15} />{/if}<FolderIcon
              size={17}
              fill="currentColor"
            /> <span>{row.folder.name}</span>
          </button>
          <button
            class="folder-action icon"
            aria-label={"Rename folder " + row.folder.name}
            title="Rename folder"
            onclick={() => renameFolder(row.folder)}
            ><Pencil size={15} /></button
          >
          <button
            class="folder-action icon"
            aria-label={"Delete folder " + row.folder.name}
            title="Delete folder"
            onclick={() => deleteFolder(row.folder)}
            ><Trash2 size={15} /></button
          >
        </div>
        {#if expandedFolders.includes(row.folder.id)}
          {#each sidebarPads.filter((p) => p.folder_id === row.folder.id) as pad (pad.id)}
            <div
              class:current={active?.id === pad.id && !settingsOpen}
              class="folder-file"
              style:padding-left={row.depth * 16 + 28 + "px"}
            >
              <FileText size={16} /><button
                class="script-open"
                onclick={() => open(pad)}
                ><span>{pad.title || "Untitled"}</span></button
              >{#if pad.pinned}<Pin size={14} fill="currentColor" />{/if}
            </div>
          {/each}
        {/if}
      {/each}
      {#each sidebarPads.filter((p) => !p.folder_id || !folders.some((f) => f.id === p.folder_id)) as pad (pad.id)}
        <div
          class:current={active?.id === pad.id && !settingsOpen}
          class="script-row"
        >
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
            <FileText size={16} />
            <button
              class="script-open"
              onclick={() => open(pad)}
              ><span>{pad.title || "Untitled"}</span></button
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
              onclick={() => requestTrash(pad)}><Trash2 size={13} /></button
            >
          {/if}
        </div>
      {/each}
    </div>
    {#if error}<div class="sidebar-error" role="alert">{error}</div>{/if}
    <div class="sidebar-bottom">
      <button
        class="shortcuts-button"
        class:settings-selected={settingsOpen}
        onclick={showSettings}
        title="Settings"
        aria-current={settingsOpen ? "page" : undefined}
        ><Settings size={16} /> Settings</button
      >
      <button
        class="icon"
        onclick={() => (shortcutsOpen = true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts · Ctrl/⌘ + /"><Keyboard size={16} /></button
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
    {#if !focus && (!active || settingsOpen)}
      <header class="topbar">
        <button
          class="icon sidebar-toggle"
          onclick={() => (sidebar = !sidebar)}
          aria-label="Toggle sidebar"
          >{#if sidebar}<PanelLeftClose size={17} />{:else}<PanelLeftOpen
              size={17}
            />{/if}</button
        ><button
          class="icon mobile-theme"
          aria-label={dark ? "Use light theme" : "Use dark theme"}
          onclick={setTheme}
          >{#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}</button
        >
      </header>
    {/if}
    {#if settingsOpen}
      <div class="dashboard settings-page">
        <div class="settings-heading">
          <div><h1>Settings</h1></div>
          <button class="text-button" onclick={() => (settingsOpen = false)}
            ><ArrowLeft size={16} /> Back</button
          >
        </div>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings sections">
            <button
              class:active={settingsSection === "appearance"}
              aria-current={settingsSection === "appearance"
                ? "page"
                : undefined}
              onclick={() => (settingsSection = "appearance")}
              >Appearance</button
            >
            <button
              class:active={settingsSection === "editor"}
              aria-current={settingsSection === "editor" ? "page" : undefined}
              onclick={() => (settingsSection = "editor")}>Editor</button
            >
            <button
              class:active={settingsSection === "files"}
              aria-current={settingsSection === "files" ? "page" : undefined}
              onclick={() => (settingsSection = "files")}
              >Files &amp; Trash</button
            >
            <button
              class:active={settingsSection === "data"}
              aria-current={settingsSection === "data" ? "page" : undefined}
              onclick={() => (settingsSection = "data")}
              >Storage &amp; backup</button
            >
          </nav>
          <div class="settings-content">
            {#if settingsSection === "appearance"}
              <div class="settings-content-heading">
                <h2>Appearance</h2>
                <p>Choose how Rune looks across the app.</p>
              </div>
              <section class="settings-section">
                <h3>Theme</h3>
                <p>Choose a light or dark appearance.</p>
                <div class="settings-control">
                  <button class="setting-choice" onclick={setTheme}
                    >{dark ? "Dark" : "Light"} · Switch to {dark
                      ? "light"
                      : "dark"}</button
                  >
                </div>
              </section>
              <section class="settings-section">
                <h3>Padding</h3>
                <p>Adjust the spacing around interface elements.</p>
                <div class="settings-control-grid">
                  <label>Padding <span>{preferences.padding}%</span><input type="range" min="20" max="100" step="5" bind:value={preferences.padding} /></label>
                </div>
              </section>
              <section class="settings-section">
                <h3>Interface text</h3>
                <p>
                  Adjust the size and style of labels, menus, and other app
                  text.
                </p>
                <div class="settings-control-grid">
                  <label
                    >Text size <span>{preferences.interfaceSize} px</span><input
                      type="range"
                      min="12"
                      max="22"
                      step="1"
                      bind:value={preferences.interfaceSize}
                    /></label
                  >
                  <label
                    >Font style <select bind:value={preferences.interfaceFont}
                      ><option value="sans">Sans serif</option><option
                        value="serif">Serif</option
                      ><option value="mono">Monospace</option></select
                    ></label
                  >
                </div>
              </section>
            {:else if settingsSection === "editor"}
              <div class="settings-content-heading">
                <h2>Editor</h2>
                <p>Set a comfortable reading and writing style.</p>
              </div>
              <section class="settings-section">
                <h3>Text</h3>
                <p>These settings apply to the editor and reading view.</p>
                <div class="settings-control-grid">
                  <label
                    >Text size <span>{preferences.editorSize} px</span><input
                      type="range"
                      min="12"
                      max="32"
                      step="1"
                      bind:value={preferences.editorSize}
                    /></label
                  >
                  <label
                    >Font style <select bind:value={preferences.editorFont}
                      ><option value="mono">Monospace</option><option
                        value="sans">Sans serif</option
                      ><option value="serif">Serif</option></select
                    ></label
                  >
                </div>
                <div
                  class="settings-preview"
                  style:font-family={fontFamilies[preferences.editorFont]}
                  style:font-size={preferences.editorSize + "px"}
                >
                  The quick brown fox jumps over the lazy dog.
                </div>
              </section>
            {:else if settingsSection === "files"}
              <div class="settings-content-heading">
                <h2>Files &amp; Trash</h2>
                <p>Choose how Rune handles your files.</p>
              </div>
              <section class="settings-section">
                <h3>Moving files to Trash</h3>
                <label class="settings-checkbox"
                  ><input
                    type="checkbox"
                    bind:checked={preferences.confirmTrash}
                  /><span
                    ><strong>Ask before moving files to Trash</strong><small
                      >Turn this off to move files to Trash immediately. You can
                      still restore them from Trash.</small
                    ></span
                  ></label
                >
                <p>Permanent deletion and reset always require confirmation.</p>
              </section>
            {:else}
              <div class="settings-content-heading">
                <h2>Storage &amp; backup</h2>
                <p>Manage your library and keep a copy of your files.</p>
              </div>
              <section
                class="settings-section"
                aria-labelledby="storage-heading"
              >
                <h3 id="storage-heading"><Database size={18} /> Storage</h3>
                <p>
                  Scripts are saved in this folder. Deleted scripts and file
                  details are stored separately by Rune.
                </p>
                <code class="settings-path">{storagePath}</code>
              </section>
              <section
                class="settings-section"
                aria-labelledby="backup-heading"
              >
                <h3 id="backup-heading">Backup</h3>
                <p>
                  Download your active files and Trash, or restore a backup.
                  Restoring adds copies and keeps your current files.
                </p>
                <div class="backup-actions">
                  <button
                    class="primary"
                    onclick={downloadBackup}
                    disabled={backupBusy || resetBusy || resetVerified}
                    ><Download size={16} /> Download backup</button
                  >
                  <label
                    class:disabled={backupBusy || resetBusy || resetVerified}
                    class="backup-upload"
                    ><Upload size={16} /> Restore backup<input
                      type="file"
                      accept=".json,application/json"
                      onchange={importBackup}
                      disabled={backupBusy || resetBusy || resetVerified}
                    /></label
                  >
                </div>
              </section>
              <section class="settings-section" aria-labelledby="reset-heading">
                <h3 id="reset-heading">Reset Rune</h3>
                <p>
                  Permanently delete all files and Trash. After resetting,
                  refresh Rune to choose a storage folder again.
                </p>
                <button
                  class="reset-button"
                  onclick={resetRune}
                  disabled={resetBusy || resetVerified || backupBusy}
                  ><Trash2 size={16} />
                  {resetBusy
                    ? "Resetting…"
                    : resetVerified
                      ? "Reset verified"
                      : "Reset Rune"}</button
                >
              </section>
            {/if}
          </div>
        </div>
      </div>
    {:else if active}
      <section class="writer">
        <nav
          class="writer-tabs"
          aria-label="Open files"
          inert={focus && focusWriting && !focusReveal}
        >
          {#each openIds as id (id)}
            {@const pad = pads.find((p) => p.id === id)}
            {#if pad}
              <div class="writer-tab" class:active={active.id === id}>
                <button
                  class="writer-tab-open"
                  aria-current={active.id === id ? "page" : undefined}
                  title={filePath(pad, folders)}
                  onclick={() => open(pad)}
                  ><FileText size={14} /><span>{pad.title || "Untitled"}</span
                  ></button
                >
                <button
                  class="writer-tab-close"
                  aria-label={"Close " + (pad.title || "Untitled")}
                  title="Close file"
                  onclick={() => closeTab(id)}><X size={14} /></button
                >
              </div>
            {/if}
          {/each}
        </nav>
        <div
          class="writer-toolbar"
          inert={focus && focusWriting && !focusReveal}
        >
          <div class="writer-back">
            {#if !focus}<button
                class="icon sidebar-toggle writer-sidebar-toggle"
                onclick={() => (sidebar = !sidebar)}
                aria-label="Toggle sidebar"
                title="Toggle sidebar"
                >{#if sidebar}<PanelLeftClose size={18} />{:else}<PanelLeftOpen
                    size={18}
                  />{/if}</button
              ><button onclick={back} class="text-button writer-files"
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
              >{/if}<span class="writer-path" title={filePath(active, folders)}
              >{filePath(active, folders)}</span
            >
          </div>
          <div class="writer-actions">
            <div class="segmented">
              <button
                class:active={!reading}
                onclick={() => setReading(false)}
                aria-label="Write"
                title="Write"><Pencil size={15} /><span>Write</span></button
              ><button
                class:active={reading}
                onclick={() => setReading(true)}
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
                      requestTrash(active!);
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
                  onshowshortcuts={() => (shortcutsOpen = true)}
                />{/key}
            </div>
            {#if reading}<article
                class="markdown reading"
                use:renderMarkdown={active.content}
              ></article>{/if}
          </div>
        </div>
      </section>
    {:else}
      <div class="dashboard">
        <div class="dashboard-heading">
          <h1>
            {filter === "trash"
              ? "Trash"
              : filter === "pinned"
                ? "Pinned"
                : "Files"}
          </h1>
          {#if filter === "trash" && trash.length}<button
              class="trash-bulk icon"
              onclick={() => (permanentDelete = "all")}
              aria-label="Permanently delete all files"
              title="Permanently delete all files"><Trash2 size={18} /></button
            >{/if}
        </div>
        {#if filter === "trash"}
          {#if error}<div class="error-banner" role="alert">
              {error} <button onclick={load}>Retry</button>
            </div>{/if}
          {#if loading}<div class="empty">Loading…</div>
          {:else if !trashAvailable}<div class="empty">
              <p>Trash is unavailable. Restart the API server to enable it.</p>
            </div>
          {:else if !trash.length}<div class="empty"><p>Trash is empty</p></div>
          {:else}
            <div class="trash-toolbar">
              <span
                >{trashSelection.length
                  ? trashSelection.length + " selected"
                  : trash.length +
                    (trash.length === 1 ? " file" : " files")}</span
              >
              {#if trashSelection.length}<button
                  class="trash-bulk icon"
                  onclick={() => (permanentDelete = [...trashSelection])}
                  aria-label="Permanently delete selected files"
                  title="Permanently delete selected files"
                  ><Trash2 size={18} /></button
                >{/if}
            </div>
            <div class="trash-list">
              {#each trash as pad (pad.id)}
                <div class="trash-row">
                  <button
                    class="trash-select"
                    class:selected={trashSelection.includes(pad.id)}
                    aria-pressed={trashSelection.includes(pad.id)}
                    aria-label={"Select " + pad.title}
                    onclick={() => toggleTrashSelection(pad.id)}
                    >{#if trashSelection.includes(pad.id)}<Check
                        size={15}
                      />{/if}</button
                  >
                  <button
                    class="trash-details"
                    onclick={() => (trashPreview = pad)}
                    title={"Preview " + pad.title}
                  >
                    <strong>{pad.title || "Untitled"}</strong><span
                      class="file-path">{filePath(pad, folders)}</span
                    ><span
                      >Deleted {date(pad.deleted_at)} · {wordCount(pad.content)}
                      words</span
                    >
                  </button>
                  <div class="trash-actions">
                    <button
                      class="icon"
                      onclick={() => (trashPreview = pad)}
                      aria-label={"Preview " + pad.title}
                      title="Preview"><Eye size={17} /></button
                    >
                    <button
                      class="icon"
                      onclick={() => restore(pad)}
                      aria-label={"Restore " + pad.title}
                      title="Restore"><RotateCcw size={17} /></button
                    >
                    <button
                      class="icon"
                      onclick={() => (permanentDelete = [pad.id])}
                      aria-label={"Permanently delete " + pad.title}
                      title="Permanently delete"><Trash2 size={17} /></button
                    >
                  </div>
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
              <label class="pinned-filter"
                ><input
                  type="checkbox"
                  checked={filter === "pinned"}
                  onchange={(event) =>
                    showFilter(event.currentTarget.checked ? "pinned" : "all")}
                /> Show pinned only</label
              >
              <div class="sort-anchor" bind:this={sortAnchor}>
                <button
                  class="sort-button"
                  onclick={() => (sortMenu = !sortMenu)}
                  aria-label={"Sort: " +
                    (sortOptions.find((option) => option.value === sort)
                      ?.label || "Last edited")}
                  aria-expanded={sortMenu}
                  aria-haspopup="menu"
                  title="Sort files"
                  ><ArrowDownWideNarrow size={15} /><span
                    >{sortOptions.find((option) => option.value === sort)
                      ?.label}</span
                  ></button
                >
                {#if sortMenu}<div
                    class="sort-menu"
                    role="menu"
                    aria-label="Sort files"
                  >
                    {#each sortOptions as option}
                      <button
                        role="menuitemradio"
                        aria-checked={sort === option.value}
                        onclick={() => {
                          sort = option.value;
                          sortMenu = false;
                        }}
                      >
                        <span>{option.label}</span
                        >{#if sort === option.value}<Check size={14} />{/if}
                      </button>
                    {/each}
                  </div>{/if}
              </div>
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
            </div>
          {:else}
            {#each [{ name: "", items: visible }] as group}
              {#if group.items.length}<section class="pad-section">
                  {#if group.name}<h2 class="section-heading">
                      {group.name}
                    </h2>{/if}
                  <div class:pad-list={layout === "list"} class="pad-grid">
                    {#each group.items as pad}
                      <div
                        class="pad-card"
                        class:selected={selectedId === pad.id}
                        data-pad-id={pad.id}
                      >
                        <button class="pad-open" onclick={() => open(pad)}
                          ><FileText class="card-file-icon" size={25} />
                          <h3>{pad.title}</h3>
                          <span
                            class="file-path card-path"
                            title={filePath(pad, folders)}
                            >{filePath(pad, folders)}</span
                          >
                          {#if layout === "grid"}<p class="card-preview">
                              {preview(pad.content) || ""}
                            </p>{/if}
                          <div class="card-bottom">
                            <span>{date(pad.updated_at)}</span><span
                              >{wordCount(pad.content)} words</span
                            >
                          </div></button
                        >
                        {#if renameId === pad.id && renameSource === "card"}<input
                            bind:this={renameInput}
                            class="card-rename"
                            bind:value={renameValue}
                            maxlength="200"
                            aria-label={"Rename " + pad.title}
                            onblur={() => commitRename(pad.id)}
                            onkeydown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
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
                          onclick={() => requestTrash(pad)}
                          aria-label={"Delete " + pad.title}
                          title="Delete File"><Trash2 size={14} /></button
                        ><button
                          class="card-more icon"
                          onclick={() =>
                            (cardMenu = cardMenu === pad.id ? null : pad.id)}
                          aria-label={"More actions for " + pad.title}
                          aria-expanded={cardMenu === pad.id}
                          ><MoreVertical size={18} /></button
                        >
                        {#if cardMenu === pad.id}<div
                            class="card-menu"
                            role="group"
                            aria-label={"Move " + pad.title}
                          >
                            <span>Move to</span><button
                              onclick={() => movePad(pad, null)}>Files</button
                            >
                            {#each folders as folder}<button
                                onclick={() => movePad(pad, folder.id)}
                                >{folder.name}</button
                              >{/each}
                          </div>{/if}
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
{#if notice}<div class="notice" role="status">
    {notice}<button
      class="icon"
      onclick={() => (notice = "")}
      aria-label="Dismiss message"><X size={14} /></button
    >
  </div>{/if}
{#if folderDialogOpen}
  <dialog
    use:openDialog={() => {
      if (!folderCreating) folderDialogOpen = false;
    }}
    class="modal setup-modal"
    oncancel={(event) => {
      if (folderCreating) event.preventDefault();
      else folderDialogOpen = false;
    }}
    aria-modal="true"
    aria-label="New folder"
  >
    <h2>New folder</h2>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        createFolder();
      }}
    >
      <label for="folder-name">Folder name</label>
      <input
        id="folder-name"
        bind:value={folderName}
        maxlength="200"
        required
        autocomplete="off"
      />
      {#if folderError}<p role="alert" class="setup-error">
          {folderError}
        </p>{/if}
      <div class="modal-actions">
        <button
          class="text-button"
          type="button"
          disabled={folderCreating}
          onclick={() => (folderDialogOpen = false)}>Cancel</button
        ><button
          class="primary"
          type="submit"
          disabled={folderCreating || !folderName.trim()}>Create folder</button
        >
      </div>
    </form>
  </dialog>
{/if}
{#if setupRequired}
  <dialog
    use:openDialog={() => {}}
    class="modal setup-modal"
    oncancel={(event) => event.preventDefault()}
    aria-modal="true"
    aria-label="Choose where to save files"
  >
    <h2>Where would you like to save your files?</h2>
    <p>
      Choose a folder on the computer running Rune. New scripts will be saved
      there as Markdown files.
    </p>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        finishSetup();
      }}
    >
      <label for="storage-path">Folder path</label>
      <div class="setup-path">
        <input
          id="storage-path"
          bind:value={storagePath}
          required
          autocomplete="off"
        /><button
          type="button"
          onclick={browseFolder}
          disabled={browsingFolder || setupBusy}
          >{browsingFolder ? "Opening…" : "Browse…"}</button
        >
      </div>
      <p>
        Use the suggested folder, browse, or enter the full path of an existing
        folder. Existing files are left untouched.
      </p>
      {#if setupError}<p role="alert" class="setup-error">{setupError}</p>{/if}
      <div class="modal-actions">
        <button
          class="primary"
          type="submit"
          disabled={setupBusy || browsingFolder}>Use this folder</button
        >
      </div>
    </form>
  </dialog>
{/if}
{#if deleteTarget && preferences.confirmTrash}
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
{#if trashPreview}
  <dialog
    use:openDialog={() => (trashPreview = null)}
    class="modal trash-preview-modal"
    oncancel={() => (trashPreview = null)}
    aria-modal="true"
    aria-label={"Preview " + trashPreview.title}
  >
    <button
      class="modal-close icon"
      onclick={() => (trashPreview = null)}
      aria-label="Close preview"><X size={18} /></button
    >
    <h2>{trashPreview.title || "Untitled"}</h2>
    <p>
      Deleted {date(trashPreview.deleted_at)} · {wordCount(
        trashPreview.content,
      )} words
    </p>
    <div class="trash-preview-content">
      <article
        class="markdown"
        use:renderMarkdown={trashPreview.content}
      ></article>
    </div>
    <div class="modal-actions">
      <button class="text-button" onclick={() => (trashPreview = null)}
        >Close</button
      ><button class="primary" onclick={() => restore(trashPreview!)}
        ><RotateCcw size={15} /> Restore</button
      >
    </div>
  </dialog>
{/if}
{#if permanentDelete}
  <dialog
    use:openDialog={() => (permanentDelete = null)}
    class="modal"
    oncancel={() => (permanentDelete = null)}
    aria-modal="true"
    aria-label="Permanently Delete Files"
  >
    <button
      class="modal-close icon"
      onclick={() => (permanentDelete = null)}
      aria-label="Close dialog"><X size={18} /></button
    >
    <h2>Permanently Delete?</h2>
    <p>
      {permanentDelete === "all"
        ? "All files in Trash"
        : permanentDelete.length === 1
          ? "This file"
          : `${permanentDelete.length} files`} will be permanently deleted. This
      cannot be undone.
    </p>
    <div class="modal-actions">
      <button class="text-button" onclick={() => (permanentDelete = null)}
        >Cancel</button
      ><button class="primary" onclick={deletePermanently}
        >Permanently Delete</button
      >
    </div>
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
    <button
      class="modal-close icon"
      onclick={() => (shortcutsOpen = false)}
      aria-label="Close shortcuts"><X size={18} /></button
    >
    <h2>Keyboard shortcuts</h2>
    <div class="shortcut-groups">
      {#each shortcutGroups as group}
        <section>
          <h3>{group.name}</h3>
          {#each group.items as item}
            <div class="shortcut-row">
              <span>{item[0]}</span><kbd>{item[1]}</kbd>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  </dialog>
{/if}
