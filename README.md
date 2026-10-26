# Rune

A local Markdown editor built with Svelte, CodeMirror, and Bun.

## Run

Install [Bun](https://bun.sh/), then in this folder:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:4173.

For a built version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001. Use one server process for each data file. Active Files live in `saves/<title>.md`, and deleted Files live in `trash`. Titles, dates, revisions, and Trash state live in `data/scripts.json`. Files with the same title get numbered filenames. Older storage layouts migrate when the server starts.

Use **Backup** in the sidebar to download a JSON copy of the full library, including Trash. Keep that file somewhere outside this device. **Restore backup** imports copies of its scripts without replacing the current library; it also restores the backed-up Trash entries to Trash. Browser preferences are stored separately in this browser and are not included. Individual scripts can be downloaded as Markdown from the editor's file menu.

You can change the file location with `RUNE_DATA_FILE=/absolute/path/to/scripts.json`. The old `LIBRETTO_DATA_FILE` setting still works. See `.env.example`. To run checks: `bun run check`, `bun test`, `bun run build`.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
