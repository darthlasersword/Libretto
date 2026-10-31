# Rune

Version 0.5.0 Alpha

A local Markdown editor built with Svelte, CodeMirror, and Bun.

See [CODEBASE.md](CODEBASE.md) for the app's structure, storage, and data flow.

## Run

Install [Bun](https://bun.sh/), then in this folder:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:4173.

For a built browser version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001. Use one server process for each data file. On first launch, choose the folder where new Markdown files will be saved using Browse or entering its full path on the computer running Rune. The folder chooser opens on the computer running the server; on Linux it requires Zenity or KDialog and a graphical desktop session. The suggested folder is `saves` in the Rune directory. Existing libraries keep their current location. Existing files in the chosen folder are not added to the library or overwritten. Deleted Files live in `trash`. Titles, dates, revisions, and Trash state live in `data/scripts.json`. File names must be unique across the library and Trash and must be safe on Windows. Automatically created files and restored backup copies receive a numbered name when needed. Older storage layouts migrate when the server starts.

The chosen folder is shown under **Storage and backup**. Rune stores the choice next to its library index in `scripts.json.location.json`. To use a separate library, set `RUNE_DATA_FILE=/absolute/path/to/scripts.json` before starting Rune; it will have its own setup and storage choice. The old `LIBRETTO_DATA_FILE` setting still works. See `.env.example`. To run checks: `bun run check`, `bun test`, `bun run build`.

Use **Backup** in the sidebar to download a JSON copy of the full library, including Trash. Keep that file somewhere outside this device. **Restore backup** imports copies of its scripts without replacing the current library; it also restores the backed-up Trash entries to Trash. Browser preferences are stored separately in this browser and are not included. Individual scripts can be downloaded as Markdown from the editor's file menu.

## Desktop development

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system, then run:

```sh
bun run dev:desktop
```

This starts the Bun API and Vite server before opening the Tauri window.

## Build a Windows executable

With Bun, Rust (MSVC toolchain), and Visual Studio C++ Build Tools installed:

```sh
bun install
bun run build:desktop
```

The portable application is `src-tauri/target/release/rune.exe`. The installer is under `src-tauri/target/release/bundle/nsis/`. The executable includes the frontend and a compiled storage server; end users do not need Bun, Node, or Rust. Windows WebView2 is required; the installer bootstraps it when missing.

Desktop libraries live in `%LOCALAPPDATA%/app.rune.editor/`, with metadata in `data/scripts.json` and Markdown in `saves/` and `trash/`. Use Backup in the browser version and Restore backup in the desktop version to transfer an existing library. Only one desktop instance runs at a time. The private server binds to `127.0.0.1:43187` and stops when Rune closes; keep that port free. Its stable address preserves editor preferences across launches.

The Windows shell uses the Valknut app icon and hides the sidebar logo/name to save space. Branding remains visible in the web GUI and on other platforms. The shell injects `__RUNE_WINDOWS_DESKTOP__` before the frontend loads; ordinary browser sessions do not receive this flag. Regenerate native icons with `bun run tauri icon src-tauri/icons/app-icon.svg`.

After a Windows build, `bun scripts/verify-windows-icon.ts` checks that every Valknut icon size is embedded in the executable's native resource table without launching the app.

After building, `bun scripts/smoke-desktop.ts` verifies the compiled server's embedded assets and save/restart behavior against temporary data.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
