import assert from 'node:assert/strict';

// Inspect the PE resource table directly; this never launches the executable.
const path = process.argv[2] || 'src-tauri/target/release/rune.exe';
const exe = Buffer.from(await Bun.file(path).arrayBuffer());
const ico = Buffer.from(await Bun.file('src-tauri/icons/icon.ico').arrayBuffer());
const pe = exe.readUInt32LE(0x3c);
assert.equal(exe.toString('ascii', pe, pe + 4), 'PE\0\0');
const optional = pe + 24;
const directories = optional + (exe.readUInt16LE(optional) === 0x20b ? 112 : 96);
const resourceRva = exe.readUInt32LE(directories + 16);
const sections = optional + exe.readUInt16LE(pe + 20);
function offset(rva: number) {
 for (let i = 0; i < exe.readUInt16LE(pe + 6); i++) {
  const section = sections + i * 40;
  const start = exe.readUInt32LE(section + 12);
  const size = Math.max(exe.readUInt32LE(section + 8), exe.readUInt32LE(section + 16));
  if (rva >= start && rva < start + size) return exe.readUInt32LE(section + 20) + rva - start;
 }
 throw new Error('Resource RVA is outside PE sections');
}
const root = offset(resourceRva);
function entries(relative: number) {
 const at = root + relative;
 const count = exe.readUInt16LE(at + 12) + exe.readUInt16LE(at + 14);
 return Array.from({length:count}, (_, i) => ({
  id: exe.readUInt32LE(at + 16 + i * 8),
  target: exe.readUInt32LE(at + 20 + i * 8)
 }));
}
const icons = entries(0).find(e => e.id === 3);
assert.ok(icons, 'Executable has no native icon resources');
const images: Buffer[] = [];
function collect(relative: number) {
 for (const entry of entries(relative)) {
  if (entry.target & 0x80000000) collect(entry.target & 0x7fffffff);
  else {
   const data = root + entry.target;
   const start = offset(exe.readUInt32LE(data));
   images.push(exe.subarray(start, start + exe.readUInt32LE(data + 4)));
  }
 }
}
collect(icons.target & 0x7fffffff);
const count = ico.readUInt16LE(4);
for (let i = 0; i < count; i++) {
 const entry = 6 + i * 16;
 const start = ico.readUInt32LE(entry + 12);
 const image = ico.subarray(start, start + ico.readUInt32LE(entry + 8));
 assert.ok(images.some(resource => resource.equals(image)), `Valknut icon image ${i} is missing from ${path}`);
}
console.log(`${path}: all ${count} Valknut icon sizes match the native PE resources.`);
