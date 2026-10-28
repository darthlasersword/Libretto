import { expect, test } from 'bun:test';
import { defaultPreferences, parsePreferences } from '../src/lib/preferences';

test('Preferences preserve choices and reject malformed or out-of-range values', () => {
 expect(parsePreferences(null)).toEqual(defaultPreferences);
 expect(parsePreferences({confirmTrash:false,interfaceSize:19,editorSize:24,interfaceFont:'serif',editorFont:'sans',padding:75})).toEqual({confirmTrash:false,interfaceSize:19,editorSize:24,interfaceFont:'serif',editorFont:'sans',padding:75});
 expect(parsePreferences({confirmTrash:'no',interfaceSize:200,editorSize:-5,interfaceFont:'bad',editorFont:'bad',padding:200})).toEqual({confirmTrash:true,interfaceSize:22,editorSize:12,interfaceFont:'sans',editorFont:'mono',padding:100});
 expect(parsePreferences({padding:-1}).padding).toBe(20);
 expect(parsePreferences({padding:'bad'}).padding).toBe(40);
});
