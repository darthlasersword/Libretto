export class FileNameError extends Error {}
/** Rules shared by the UI and server; names must work as Markdown filenames on all platforms. */
export function titleError(title: string, existing: readonly string[] = []): string | null {
 const name = title.trim().normalize('NFC');
 if (!name) return 'Enter a file name.';
 if (/[\\/:*?"<>|\x00-\x1f\x7f]/.test(name) || /\.$/.test(name) || name === '.' || name === '..') return 'File names cannot contain \\ / : * ? " < > |, control characters, or end in a period.';
 if (/^(con|prn|aux|nul|com[1-9\u00B9\u00B2\u00B3]|lpt[1-9\u00B9\u00B2\u00B3])(?:\.|$)/i.test(name)) return 'That name is reserved by Windows. Choose another name.';
 if (new TextEncoder().encode(name).length > 180) return 'File names must be at most 180 UTF-8 bytes.';
 if (existing.some(value => value.trim().normalize('NFC').toLowerCase() === name.toLowerCase())) return 'A file with this name already exists, including in Trash.';
 return null;
}
