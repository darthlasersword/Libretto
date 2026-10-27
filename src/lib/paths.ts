import type { Folder, Pad } from './types';

/** A library-relative path; folders are Rune's logical folders. */
export function filePath(pad: Pick<Pad, 'title' | 'folder_id'>, folders: readonly Folder[]): string {
 const names: string[] = [];
 const seen = new Set<string>();
 let id = pad.folder_id;
 while (id && !seen.has(id)) {
  seen.add(id);
  const folder = folders.find(f => f.id === id);
  if (!folder) break;
  names.unshift(folder.name);
  id = folder.parent_id;
 }
 return ['Files', ...names, pad.title || 'Untitled'].join(' / ');
}
