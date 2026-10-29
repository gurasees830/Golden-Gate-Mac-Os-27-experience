import type { MenuItem } from '../types';
import { useFs, readFile, HOME } from '../stores/fs';
import { useSystem, promptDialog } from '../stores/system';
import { useSettings } from '../stores/settings';
import { appsForMime, appForMime, getApp } from '../lib/appRegistry';
import { isInstalled } from '../stores/apps';
import { moveToTrash, openApp, openFile } from './actions';
import { compress, extract } from '../lib/archive';
import { saveToHost } from '../lib/download';

export const TAG_COLORS: { name: string; color: string }[] = [
  { name: 'Red', color: '#ff3b30' },
  { name: 'Orange', color: '#ff9500' },
  { name: 'Yellow', color: '#ffcc00' },
  { name: 'Green', color: '#34c759' },
  { name: 'Blue', color: '#007aff' },
  { name: 'Purple', color: '#af52de' },
  { name: 'Gray', color: '#8e8e93' },
];

export function getInfo(id: string) {
  openApp('getinfo', { id }, { forceNew: true });
}

export async function downloadNode(id: string) {
  const n = useFs.getState().nodes[id];
  if (!n || n.kind !== 'file') return;
  const d = await readFile(id);
  if (d == null) return;
  await saveToHost(d instanceof Blob ? d : new Blob([d], { type: n.mime }), n.name);
}

export function fileContextItems(ids: string[], opts: { onRename?: (id: string) => void; folderId: string; inTrash?: boolean }): MenuItem[] {
  const fs = useFs.getState();
  const nodes = ids.map((id) => fs.nodes[id]).filter(Boolean);
  if (!nodes.length) return [];
  const single = nodes.length === 1 ? nodes[0] : null;
  const sys = useSystem.getState();
  if (opts.inTrash) {
    return [
      { label: 'Put Back', action: () => void fs.restore(ids) },
      { label: 'Delete Immediately…', danger: true, action: () => void deleteImmediately(ids) },
    ];
  }
  const openWith: MenuItem[] =
    single && single.kind === 'file'
      ? appsForMime(single.mime)
          .filter((a) => isInstalled(a.id))
          .map((a) => ({ label: a.name + (a.id === appForMime(single.mime, single.name) ? ' (default)' : ''), action: () => openFile(single.id, a.id) }))
      : [];
  const items: MenuItem[] = [
    { label: 'Open', action: () => ids.forEach((id) => openFile(id)) },
    ...(openWith.length ? [{ label: 'Open With', submenu: openWith } as MenuItem] : []),
    { separator: true },
    { label: 'Move to Trash', action: () => void moveToTrash(ids), disabled: nodes.some((n) => n.system) },
    { separator: true },
    { label: 'Get Info', action: () => ids.forEach(getInfo) },
    ...(single && !single.system ? [{ label: 'Rename', action: () => opts.onRename?.(single.id) } as MenuItem] : []),
    {
      label: single ? `Compress “${single.name}”` : `Compress ${nodes.length} Items`,
      action: () =>
        void compress(ids, opts.folderId).then((z) => sys.showToast(`Created ${z.name}`)),
    },
    ...(single?.mime === 'application/zip' ? [{ label: 'Expand Archive', action: () => void extract(single.id).then((f) => sys.showToast(`Expanded into “${f.name}”`)) } as MenuItem] : []),
    { label: 'Duplicate', action: () => void fs.copy(ids, opts.folderId) },
    { label: 'Quick Look', shortcut: 'space', action: () => sys.set({ quickLook: ids[0] }) },
    { separator: true },
    { label: `Copy${single ? ` “${single.name}”` : ''}`, action: () => sys.set({ fsClipboard: { ids, mode: 'copy' } }) },
    ...(single?.kind === 'file' ? [{ label: 'Export to Your Computer…', action: () => void downloadNode(single.id) } as MenuItem] : []),
    { separator: true },
    {
      label: 'Tags',
      submenu: TAG_COLORS.map((t) => ({
        label: t.name,
        checked: !!single?.tags?.includes(t.name),
        icon: <span style={{ width: 10, height: 10, borderRadius: 5, background: t.color, display: 'inline-block' }} />,
        action: () =>
          ids.forEach((id) => {
            const n = useFs.getState().nodes[id];
            const tags = n.tags ?? [];
            fs.setTags(id, tags.includes(t.name) ? tags.filter((x) => x !== t.name) : [...tags, t.name]);
          }),
      })),
    },
    ...(single?.mime.startsWith('image/')
      ? [{ separator: true } as MenuItem, { label: 'Set Desktop Picture', action: () => useSettings.getState().patch('wallpaper', { id: `custom:${single.id}`, customName: single.name }) } as MenuItem]
      : []),
  ];
  return items;
}

export async function deleteImmediately(ids: string[]) {
  const { confirmDialog } = await import('../stores/system');
  const ok = await confirmDialog(`Are you sure you want to delete ${ids.length === 1 ? 'this item' : 'these items'} immediately?`, "You can't undo this action.", 'Delete', { icon: 'warning' });
  if (ok) await useFs.getState().deleteForever(ids);
}

export async function pasteInto(folderId: string) {
  const sys = useSystem.getState();
  const clip = sys.fsClipboard;
  if (!clip) return;
  const fs = useFs.getState();
  if (clip.mode === 'cut') {
    await fs.move(clip.ids, folderId);
    sys.set({ fsClipboard: null });
  } else {
    await fs.copy(clip.ids, folderId);
  }
}

export async function newTextDocument(folderId: string) {
  const name = await promptDialog('New Text Document', 'Name of the new document:', 'Untitled.txt');
  if (name == null) return null;
  return useFs.getState().createFile(folderId || HOME, name.trim() || 'Untitled.txt', '', 'text/plain');
}

export function appIsAvailable(id: string) {
  return !!getApp(id) && isInstalled(id);
}
