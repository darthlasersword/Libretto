export type FontStyle = 'sans' | 'serif' | 'mono';
export type Preferences = { confirmTrash: boolean; interfaceSize: number; editorSize: number; interfaceFont: FontStyle; editorFont: FontStyle };
export const defaultPreferences: Preferences = {confirmTrash:true, interfaceSize:16, editorSize:20, interfaceFont:'sans', editorFont:'mono'};
export const preferencesKey = 'rune-preferences-v1';
export function parsePreferences(value: unknown): Preferences {
 const p = value && typeof value === 'object' ? value as Partial<Preferences> : {};
 const size = (v:unknown, fallback:number, min:number, max:number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
 const font = (v:unknown, fallback:FontStyle): FontStyle => v === 'sans' || v === 'serif' || v === 'mono' ? v : fallback;
 return {confirmTrash:typeof p.confirmTrash === 'boolean' ? p.confirmTrash : true, interfaceSize:size(p.interfaceSize,16,12,22),editorSize:size(p.editorSize,20,12,32),interfaceFont:font(p.interfaceFont,'sans'),editorFont:font(p.editorFont,'mono')};
}
export const fontFamilies: Record<FontStyle,string> = {sans:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',serif:'Georgia, "Times New Roman", serif',mono:'Writer, monospace'};
