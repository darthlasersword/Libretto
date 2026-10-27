import { expect, test } from 'bun:test';
import { filePath } from '../src/lib/paths';

test('Library paths include nested folders and handle missing or cyclic parents', () => {
 const folders = [{id:'a',name:'Project',parent_id:null},{id:'b',name:'Notes',parent_id:'a'}];
 expect(filePath({title:'Draft',folder_id:'b'},folders)).toBe('Files / Project / Notes / Draft');
 expect(filePath({title:'Draft',folder_id:null},folders)).toBe('Files / Draft');
 expect(filePath({title:'Draft',folder_id:'missing'},folders)).toBe('Files / Draft');
 expect(filePath({title:'Draft',folder_id:'a'},[{id:'a',name:'Loop',parent_id:'a'}])).toBe('Files / Loop / Draft');
});
