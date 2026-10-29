import JSZip from 'jszip';
import { readFile, useFs } from '../stores/fs';
import type { FsNode } from '../types';
import { mimeFromName } from './format';

/** Create a real .zip archive from virtual files/folders. */
export async function compress(ids: string[], parentId: string): Promise<FsNode> {
  const fs = useFs.getState();
  const zip = new JSZip();
  const add = async (id: string, folder: JSZip) => {
    const n = useFs.getState().nodes[id];
    if (!n) return;
    if (n.kind === 'folder') {
      const sub = folder.folder(n.name)!;
      for (const c of useFs.getState().children(id)) await add(c.id, sub);
    } else {
      const d = await readFile(id);
      if (d != null) folder.file(n.name, d instanceof Blob ? await d.arrayBuffer() : d);
    }
  };
  for (const id of ids) await add(id, zip);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const first = fs.nodes[ids[0]];
  const name = ids.length === 1 && first ? `${first.name}.zip` : 'Archive.zip';
  return fs.createFile(parentId, name, new Blob([blob], { type: 'application/zip' }), 'application/zip');
}

/** Extract a .zip into a new folder next to it. Returns the folder. */
export async function extract(zipId: string): Promise<FsNode> {
  const fs = useFs.getState();
  const node = fs.nodes[zipId];
  const data = await readFile(zipId);
  if (!node || data == null) throw new Error('Archive not found');
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const root = await fs.createFolder(node.parentId ?? 'home', node.name.replace(/\.zip$/i, ''));
  const folders = new Map<string, string>([['', root.id]]);
  const ensure = async (path: string): Promise<string> => {
    if (folders.has(path)) return folders.get(path)!;
    const parts = path.split('/');
    const name = parts.pop()!;
    const parent = await ensure(parts.join('/'));
    const f = await useFs.getState().createFolder(parent, name);
    folders.set(path, f.id);
    return f.id;
  };
  const entries = Object.values(zip.files).filter((f) => !f.name.startsWith('__MACOSX'));
  for (const entry of entries) {
    const clean = entry.name.replace(/\/$/, '');
    if (entry.dir) {
      await ensure(clean);
      continue;
    }
    const parts = clean.split('/');
    const name = parts.pop()!;
    const parent = await ensure(parts.join('/'));
    const mime = mimeFromName(name);
    const isText = mime.startsWith('text/') || mime === 'application/json';
    const content = isText ? await entry.async('string') : new Blob([await entry.async('arraybuffer')], { type: mime });
    await useFs.getState().createFile(parent, name, content, mime);
  }
  return root;
}
