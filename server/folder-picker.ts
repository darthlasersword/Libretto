import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Opens a folder chooser on the machine running the Rune server. */
export async function chooseFolder(): Promise<string | null> {
 let command: string;
 let args: string[];
 if (process.platform === 'darwin') {
  command = 'osascript';
  args = ['-e', 'POSIX path of (choose folder with prompt "Choose where Rune should save files")'];
 } else if (process.platform === 'win32') {
  command = 'powershell.exe';
  args = ['-NoProfile', '-STA', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose where Rune should save files'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }"];
 } else if (process.platform === 'linux') {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('No desktop session is available. Enter the folder path instead.');
  if (Bun.which('zenity')) {
   command = 'zenity'; args = ['--file-selection', '--directory', '--title=Choose where Rune should save files'];
  } else if (Bun.which('kdialog')) {
   command = 'kdialog'; args = ['--getexistingdirectory', '', '--title', 'Choose where Rune should save files'];
  } else throw new Error('Install Zenity or KDialog to browse for a folder, or enter its path instead.');
 } else throw new Error('Folder browsing is unavailable on this system. Enter the folder path instead.');
 try {
  const { stdout } = await run(command, args, { encoding: 'utf8', timeout: 300_000, maxBuffer: 1024 * 1024 });
  return stdout.replace(/[\r\n]+$/, '') || null;
 } catch (error) {
  const failure = error as Error & { code?: number | string; stderr?: string; killed?: boolean };
  if (!failure.killed && failure.code === 1 && (process.platform === 'linux' || /-128/.test(failure.stderr ?? ''))) return null;
  throw new Error('Could not open the folder chooser. Enter the folder path instead.');
 }
}
