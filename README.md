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

This starts the existing Bun API and Vite server before opening the Tauri window. The desktop shell is initialized, but production desktop bundles do not yet include the Bun API; the editor's data features require that API to be available separately.

For a built version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001 instead.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
