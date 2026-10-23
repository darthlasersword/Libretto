# Libretto

A local Markdown editor built with Svelte, CodeMirror, and Bun. Scripts are saved to a JSON file; no database setup is needed.

## Run

Install [Bun](https://bun.sh/), then in this folder:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:4173. The first run creates an empty `data/scripts.json`. Back up that file to keep a copy of your work. If you already have `data/pads.json` from the previous version, Libretto loads it automatically.

For a built version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001. Use one server process for each data file.

The sidebar lists every Script. Hover a title for rename and delete controls; on a touch screen, the controls stay visible. Deletion asks for confirmation. The dashboard has preview and list views, search, sorting, and pinned Scripts. The editor supports Markdown, reading view, autosave, focus mode, and `.md` export.

You can change the file location with `LIBRETTO_DATA_FILE=/absolute/path/to/scripts.json`. See `.env.example`. To run checks: `bun run check`, `bun test`, `bun run build`.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
