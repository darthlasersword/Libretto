import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

async function files(dir: string): Promise<string[]> {
 const entries = await readdir(dir, { withFileTypes: true });
 return (await Promise.all(entries.map(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]))).flat();
}
const frontend = Bun.spawnSync(['bun', 'run', 'build'], { stdout: 'inherit', stderr: 'inherit' });
if (frontend.exitCode) process.exit(frontend.exitCode);
await mkdir('src-tauri/binaries', { recursive: true });
const assets = await files(resolve('dist'));
const imports = assets.map((p, i) => `import asset${i} from ${JSON.stringify(p.replaceAll('\\', '/'))} with { type: 'file' };`).join('\n');
const entries = assets.map((p, i) => `${JSON.stringify('/' + relative(resolve('dist'), p).replaceAll('\\', '/'))}: asset${i}`).join(',\n');
await writeFile('server/desktop-assets.generated.ts', `// @ts-nocheck -- Bun file imports embed assets as paths.\n${imports}\nexport default {${entries}} as Record<string,string>;\n`);
const buildStarted = Date.now();
const result = Bun.spawnSync(['bun', 'build', '--compile', '--windows-hide-console', 'server/desktop.ts', '--outfile', 'src-tauri/binaries/rune-server.exe'], { stdout: 'inherit', stderr: 'inherit' });
if (result.exitCode) process.exit(result.exitCode);
// A compiler can report success even when the OS blocks the final executable.
// Never let Tauri silently embed a stale server from a previous build.
const output = await stat('src-tauri/binaries/rune-server.exe').catch(() => null);
if (!output || output.size === 0 || output.mtimeMs + 2000 < buildStarted)
 throw new Error('Desktop server executable was not created. Check whether Windows blocked the output file.');

