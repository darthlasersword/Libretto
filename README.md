# Rune

A local Markdown editor built with Svelte, CodeMirror, and Bun.

See [CODEBASE.md](CODEBASE.md) for the app's structure, storage, and data flow.

## Run

Install [Bun](https://bun.sh/), then in this folder:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:4173.

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

For a built version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001 instead.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
