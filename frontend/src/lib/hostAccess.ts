import { showDialog } from '../stores/system';
import { useFs, importHostFiles } from '../stores/fs';
import type { FsNode } from '../types';

/** Browsers only expose files the user picks; nothing is read until they choose it in the system dialog. */
const MAX_FILES = 1000;
const MAX_BYTES = 500 * 1024 * 1024;

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type Picker = { showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>; showOpenFilePicker?: (o?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]> };

/** Ask before touching anything on the real computer. Resolves with what the user wants to bring in, or null. */
export async function askHostAccess(): Promise<'files' | 'folder' | null> {
  const r = await showDialog({
    title: 'Allow Golden Gate to access files on your computer?',
    message: 'Your browser will show its own file picker. Only the files or folder you choose are copied into Golden Gate; nothing else on your computer is read, and nothing is changed or uploaded.',
    icon: 'info',
    buttons: [
      { label: 'Don’t Allow', value: 'no' },
      { label: 'Choose Files…', value: 'files' },
      { label: 'Choose Folder…', value: 'folder', primary: true },
    ],
  });
  return r.value === 'files' || r.value === 'folder' ? r.value : null;
}

async function walk(dir: DirHandle, parentId: string, budget: { files: number; bytes: number; skipped: number }, out: FsNode[]) {
  const fs = useFs.getState();
  for await (const h of dir.values()) {
    if (h.name.startsWith('.')) continue;
    if (h.kind === 'directory') {
      const folder = await fs.createFolder(parentId, h.name);
      out.push(folder);
      await walk(h as DirHandle, folder.id, budget, out);
    } else {
      const file = await (h as FileSystemFileHandle).getFile();
      if (budget.files >= MAX_FILES || budget.bytes + file.size > MAX_BYTES) {
        budget.skipped++;
        continue;
      }
      budget.files++;
      budget.bytes += file.size;
      await importHostFiles([file], parentId);
    }
  }
}

/** Ask permission, let the user pick files or a folder from their computer, and copy them into `parentId`. */
export async function importFromComputer(parentId: string): Promise<FsNode[]> {
  const choice = await askHostAccess();
  if (!choice) return [];
  const w = window as unknown as Picker;
  try {
    if (choice === 'folder') {
      if (w.showDirectoryPicker) {
        const dir = await w.showDirectoryPicker({ mode: 'read' });
        const root = await useFs.getState().createFolder(parentId, dir.name);
        const out: FsNode[] = [root];
        const budget = { files: 0, bytes: 0, skipped: 0 };
        await walk(dir as DirHandle, root.id, budget, out);
        if (budget.skipped) await showDialog({ title: 'Some files were skipped', message: `${budget.skipped} file(s) were left out because the folder is larger than ${MAX_FILES} files or ${MAX_BYTES / 1024 / 1024} MB.`, icon: 'warning', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
        return [root];
      }
      return await pickWithInput(parentId, true);
    }
    if (w.showOpenFilePicker) {
      const handles = await w.showOpenFilePicker({ multiple: true });
      return await importHostFiles(await Promise.all(handles.map((h) => h.getFile())), parentId);
    }
    return await pickWithInput(parentId, false);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return []; // user closed the picker
    await showDialog({ title: 'Couldn’t read those files', message: `${(e as Error).message}. The browser or the page host may be blocking file access.`, icon: 'warning', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
    return [];
  }
}

/** Fallback for browsers without the File System Access API (Safari, Firefox). */
function pickWithInput(parentId: string, folder: boolean): Promise<FsNode[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.setAttribute('webkitdirectory', '');
    input.oncancel = () => resolve([]);
    input.onchange = async () => {
      const files = Array.from(input.files ?? []).filter((f) => !f.name.startsWith('.'));
      if (!folder) return resolve(await importHostFiles(files, parentId));
      // rebuild the folder tree from each file's relative path
      const fs = useFs.getState();
      const rootName = (files[0] as File & { webkitRelativePath: string })?.webkitRelativePath.split('/')[0];
      if (!rootName) return resolve([]);
      const root = await fs.createFolder(parentId, rootName);
      const dirs = new Map<string, string>([['', root.id]]);
      for (const f of files.slice(0, MAX_FILES)) {
        const parts = (f as File & { webkitRelativePath: string }).webkitRelativePath.split('/').slice(1, -1);
        let path = '';
        let pid = root.id;
        for (const p of parts) {
          path += `/${p}`;
          if (!dirs.has(path)) dirs.set(path, (await fs.createFolder(pid, p)).id);
          pid = dirs.get(path)!;
        }
        await importHostFiles([f], pid);
      }
      resolve([root]);
    };
    input.click();
  });
}
