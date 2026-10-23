# Libretto

A local Markdown editor built with Svelte, CodeMirror, and Bun.

## Run

Install [Bun](https://bun.sh/), then in this folder:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:4173.

For a built version, use `bun run build` and `bun start`, then open http://127.0.0.1:3001. Use one server process for each data file.

You can change the file location with `LIBRETTO_DATA_FILE=/absolute/path/to/scripts.json`. See `.env.example`. To run checks: `bun run check`, `bun test`, `bun run build`.

[iA Writer Mono](https://github.com/iaolo/iA-Fonts) is bundled with its license in `public/fonts/LICENSE.md`.
