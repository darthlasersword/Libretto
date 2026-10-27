import type { Folder, Pad } from './types';

type UploadApi = {
 createFolder: (name: string, parentId: string | null) => Promise<Folder>;
 createFile: (title: string, content: string, folderId: string | null) => Promise<Pad>;
 onFolder: (folder: Folder) => void;
 onFile: (pad: Pad) => void;
};

/** Import supported text files, recreating their relative folder hierarchy when supplied. */
export async function importFiles(files: readonly File[], withFolders: boolean, api: UploadApi): Promise<{ skipped: number }> {
 const createdFolders = new Map<string, string>();
 let skipped = 0;
 for (const file of files) {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) { skipped++; continue; }
  if (file.size > 2_000_000) throw new Error(file.name + ' exceeds the 2 MB limit.');
  let parent: string | null = null; let path = '';
  const parts = withFolders ? (file.webkitRelativePath || file.name).split('/').slice(0, -1) : [];
  for (const part of parts) {
   path += '/' + part;
   if (!createdFolders.has(path)) {
    const folder = await api.createFolder(part, parent);
    createdFolders.set(path, folder.id); api.onFolder(folder);
   }
   parent = createdFolders.get(path)!;
  }
  const pad = await api.createFile(file.name.replace(/\.(md|markdown|txt)$/i, ''), await file.text(), parent);
  api.onFile(pad);
 }
 return {skipped};
}
