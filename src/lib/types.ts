export interface Folder { id:string; name:string; parent_id:string | null; }
export interface Pad { id:string; title:string; content:string; pinned:boolean; revision:number; created_at:string; updated_at:string; folder_id?:string | null; }
export interface TrashedPad extends Pad { deleted_at:string; }
export const wordCount = (text:string) => text.trim().split(/\s+/u).filter(Boolean).length;
