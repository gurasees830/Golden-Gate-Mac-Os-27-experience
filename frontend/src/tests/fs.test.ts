import { describe, it, expect, beforeAll } from 'vitest';
import { useFs, DESKTOP, DOCUMENTS, readText, uniqueName, isDescendant, pathString, folderSize } from '../stores/fs';

const fs = () => useFs.getState();

beforeAll(async () => {
  await fs().init();
});

describe('virtual file system', () => {
  it('seeds the standard home folders', () => {
    const names = fs().children('home').map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Movies']));
  });
  it('creates files with unique names and persists content', async () => {
    const a = await fs().createFile(DOCUMENTS, 'Report.txt', 'one');
    const b = await fs().createFile(DOCUMENTS, 'Report.txt', 'two');
    expect(a.name).toBe('Report.txt');
    expect(b.name).toBe('Report 2.txt');
    expect(await readText(b.id)).toBe('two');
    await fs().writeFile(a.id, 'updated');
    expect(await readText(a.id)).toBe('updated');
    expect(fs().nodes[a.id].size).toBe(7);
  });
  it('renames, moves and computes paths', async () => {
    const folder = await fs().createFolder(DOCUMENTS, 'Projects X');
    const f = await fs().createFile(DESKTOP, 'note.md', '# hi');
    await fs().move([f.id], folder.id);
    await fs().rename(f.id, 'readme.md');
    expect(pathString(fs().nodes, f.id)).toMatch(/Documents\/Projects X\/readme\.md$/);
    expect(isDescendant(fs().nodes, f.id, DOCUMENTS)).toBe(true);
    expect(folderSize(fs().nodes, folder.id)).toBe(4);
    expect(uniqueName(fs().nodes, folder.id, 'readme.md')).toBe('readme 2.md');
  });
  it('trashes, restores and permanently deletes', async () => {
    const f = await fs().createFile(DESKTOP, 'temp.txt', 'x');
    await fs().trash([f.id]);
    expect(fs().nodes[f.id].trashed).toBe(true);
    expect(fs().children(DESKTOP).some((n) => n.id === f.id)).toBe(false);
    await fs().restore([f.id]);
    expect(fs().nodes[f.id].parentId).toBe(DESKTOP);
    expect(fs().nodes[f.id].trashed).toBe(false);
    await fs().trash([f.id]);
    await fs().emptyTrash();
    expect(fs().nodes[f.id]).toBeUndefined();
  });
  it('copies folders recursively', async () => {
    const src = await fs().createFolder(DOCUMENTS, 'Src');
    await fs().createFile(src.id, 'a.txt', 'aaa');
    await fs().copy([src.id], DESKTOP);
    const copy = fs().children(DESKTOP).find((n) => n.name === 'Src');
    expect(copy).toBeTruthy();
    const kids = fs().children(copy!.id);
    expect(kids.map((k) => k.name)).toEqual(['a.txt']);
    expect(await readText(kids[0].id)).toBe('aaa');
  });
});
