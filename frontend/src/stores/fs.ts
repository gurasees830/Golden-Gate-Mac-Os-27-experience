import { create } from 'zustand';
import { db, isDbAvailable, reportQuotaError } from '../lib/db';
import { uid } from '../lib/persist';
import { mimeFromName } from '../lib/format';
import type { FsNode } from '../types';
import { useSettings } from './settings';

/**
 * Virtual filesystem. Metadata lives in memory (and IndexedDB `nodes`);
 * file contents are stored separately in IndexedDB `contents` and loaded on demand.
 * Nothing here touches the host computer's real filesystem.
 */
export const ROOT = 'root';
export const HOME = 'home';
export const DESKTOP = 'desktop';
export const DOCUMENTS = 'documents';
export const DOWNLOADS = 'downloads';
export const PICTURES = 'pictures';
export const MUSIC = 'music';
export const MOVIES = 'movies';
export const APPLICATIONS = 'applications';
export const TRASH = 'trash';

const memContents = new Map<string, string | Blob>();

interface FsState {
  nodes: Record<string, FsNode>;
  ready: boolean;
  init: () => Promise<void>;
  children: (parentId: string) => FsNode[];
  createFolder: (parentId: string, name?: string) => Promise<FsNode>;
  createFile: (parentId: string, name: string, data: string | Blob, mime?: string, extra?: Partial<FsNode>) => Promise<FsNode>;
  writeFile: (id: string, data: string | Blob) => Promise<void>;
  rename: (id: string, name: string) => Promise<string | null>;
  move: (ids: string[], targetId: string) => Promise<void>;
  copy: (ids: string[], targetId: string) => Promise<string[]>;
  trash: (ids: string[]) => Promise<void>;
  restore: (ids: string[]) => Promise<void>;
  deleteForever: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  setDeskPos: (id: string, pos: { x: number; y: number } | undefined) => void;
  setTags: (id: string, tags: string[]) => void;
}

async function persistNode(n: FsNode) {
  if (!(await isDbAvailable())) return;
  try {
    await db.nodes.put(n);
  } catch (e) {
    reportQuotaError(e);
  }
}
async function persistContent(id: string, data: string | Blob) {
  memContents.set(id, data);
  if (!(await isDbAvailable())) return;
  try {
    await db.contents.put({ id, data });
  } catch (e) {
    reportQuotaError(e);
    throw e;
  }
}

export async function readFile(id: string): Promise<string | Blob | null> {
  const node = useFs.getState().nodes[id];
  if (node?.assetUrl) {
    try {
      const r = await fetch(node.assetUrl);
      return node.mime.startsWith('text/') ? await r.text() : await r.blob();
    } catch {
      return null;
    }
  }
  if (memContents.has(id)) return memContents.get(id)!;
  if (!(await isDbAvailable())) return null;
  const c = await db.contents.get(id);
  if (c) memContents.set(id, c.data);
  return c?.data ?? null;
}

export async function readText(id: string): Promise<string> {
  const d = await readFile(id);
  if (d == null) return '';
  return typeof d === 'string' ? d : await d.text();
}

const urlCache = new Map<string, { url: string; modified: number }>();
export async function fileUrl(id: string): Promise<string | null> {
  const node = useFs.getState().nodes[id];
  if (!node) return null;
  if (node.assetUrl) return node.assetUrl;
  const cached = urlCache.get(id);
  if (cached && cached.modified === node.modifiedAt) return cached.url;
  const d = await readFile(id);
  if (d == null) return null;
  const blob = typeof d === 'string' ? new Blob([d], { type: node.mime }) : d;
  const url = URL.createObjectURL(blob);
  if (cached) URL.revokeObjectURL(cached.url);
  urlCache.set(id, { url, modified: node.modifiedAt });
  return url;
}

function sizeOf(data: string | Blob) {
  return typeof data === 'string' ? new Blob([data]).size : data.size;
}

export function uniqueName(nodes: Record<string, FsNode>, parentId: string, desired: string, excludeId?: string): string {
  const siblings = new Set(
    Object.values(nodes)
      .filter((n) => n.parentId === parentId && !n.trashed && n.id !== excludeId)
      .map((n) => n.name.toLowerCase()),
  );
  if (!siblings.has(desired.toLowerCase())) return desired;
  const dot = desired.lastIndexOf('.');
  const hasExt = dot > 0;
  const base = hasExt ? desired.slice(0, dot) : desired;
  const ext = hasExt ? desired.slice(dot) : '';
  for (let i = 2; i < 10000; i++) {
    const cand = `${base} ${i}${ext}`;
    if (!siblings.has(cand.toLowerCase())) return cand;
  }
  return `${base} ${Date.now()}${ext}`;
}

export function isDescendant(nodes: Record<string, FsNode>, id: string, ancestorId: string): boolean {
  let cur: FsNode | undefined = nodes[id];
  let guard = 0;
  while (cur && guard++ < 200) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return false;
}

export function pathOf(nodes: Record<string, FsNode>, id: string): FsNode[] {
  const out: FsNode[] = [];
  let cur: FsNode | undefined = nodes[id];
  let guard = 0;
  while (cur && guard++ < 200) {
    out.unshift(cur);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return out;
}

export function pathString(nodes: Record<string, FsNode>, id: string): string {
  const parts = pathOf(nodes, id);
  if (!parts.length) return '/';
  return '/' + parts.slice(1).map((p) => p.name).join('/');
}

/** Resolve a POSIX-like path ("~/Documents/a.txt", "/Users/x", "../b") to a node id. */
export function resolvePath(nodes: Record<string, FsNode>, path: string, cwd: string): string | null {
  let cur = cwd;
  let p = path.trim();
  if (p === '') return cwd;
  if (p.startsWith('~')) {
    cur = HOME;
    p = p.slice(1);
  } else if (p.startsWith('/')) {
    cur = ROOT;
  }
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      cur = nodes[cur]?.parentId ?? ROOT;
      continue;
    }
    const child = Object.values(nodes).find((n) => n.parentId === cur && !n.trashed && n.name === part);
    if (!child) return null;
    cur = child.id;
  }
  return cur;
}

function folder(id: string, parentId: string | null, name: string, system = true): FsNode {
  const t = Date.now();
  return { id, parentId, name, kind: 'folder', mime: 'folder', size: 0, createdAt: t, modifiedAt: t, trashed: false, system };
}

const WELCOME = `Welcome to Golden Gate

This is a browser-based desktop simulator inspired by macOS 27 Golden Gate.
It is an independent project and is not affiliated with or endorsed by Apple.

Things to try
• Press Ctrl+Space (⌘Space on a Mac) to open Spotlight.
• Drag windows by their title bar, resize them from any edge, double-click a title bar to zoom.
• Drag a window to the left or right edge of the screen to tile it.
• Open System Settings → Wallpaper to change the desktop picture, or add your own photo.
• Install more apps from the App Store — they appear in Launchpad and the Applications folder.
• Drop files from your computer onto the desktop or a Finder window to import them.

Everything you create is stored in this browser (IndexedDB). Use
System Settings → General → Time Machine to export a backup.
`;

const README_MD = `# Golden Gate Notes

- **Finder** keeps files in a virtual filesystem stored in your browser.
- **Terminal** understands \`ls\`, \`cd\`, \`mkdir\`, \`touch\`, \`cat\`, \`echo\`, \`open\` and more.
- **TextEdit** saves to this filesystem; File → Export saves a copy to your real computer.

> Tip: Press Space on a selected file in Finder to Quick Look it.
`;

async function seed(): Promise<Record<string, FsNode>> {
  const acct = useSettings.getState().user.accountName || 'guest';
  const nodes: FsNode[] = [
    folder(ROOT, null, 'Golden Gate HD'),
    folder(APPLICATIONS, ROOT, 'Applications'),
    folder('library', ROOT, 'Library'),
    folder('system', ROOT, 'System'),
    folder('users', ROOT, 'Users'),
    folder(HOME, 'users', acct),
    folder(DESKTOP, HOME, 'Desktop'),
    folder(DOCUMENTS, HOME, 'Documents'),
    folder(DOWNLOADS, HOME, 'Downloads'),
    folder(PICTURES, HOME, 'Pictures'),
    folder(MUSIC, HOME, 'Music'),
    folder(MOVIES, HOME, 'Movies'),
    folder('public', HOME, 'Public'),
    folder('wallpapers', PICTURES, 'Wallpapers', false),
    folder('projects', DOCUMENTS, 'Projects', false),
  ];
  const t = Date.now();
  const files: { id: string; parent: string; name: string; data?: string; asset?: string; mime?: string; size?: number; deskPos?: { x: number; y: number } }[] = [
    { id: 'welcome', parent: DESKTOP, name: 'Welcome to Golden Gate.txt', data: WELCOME },
    { id: 'readme', parent: DOCUMENTS, name: 'Read Me.md', data: README_MD },
    { id: 'todo', parent: 'projects', name: 'TeamFlow ideas.txt', data: 'TeamFlow — project & task manager\n\n- Kanban board with drag and drop\n- Spring Boot REST API + MySQL\n- JWT auth\n- React frontend\n' },
    { id: 'hello-java', parent: 'projects', name: 'Hello.java', data: 'public class Hello {\n    public static void main(String[] args) {\n        System.out.println("Hello from Golden Gate!");\n    }\n}\n' },
    { id: 'demo-js', parent: 'projects', name: 'fizzbuzz.js', data: 'for (let i = 1; i <= 15; i++) {\n  console.log(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : i);\n}\n' },
    { id: 'wp-golden', parent: 'wallpapers', name: 'Golden Gate (Golden Hour).jpg', asset: 'wallpapers/gg-golden.jpg', mime: 'image/jpeg', size: 820000 },
    { id: 'wp-day', parent: 'wallpapers', name: 'Golden Gate (Day).jpg', asset: 'wallpapers/gg-day.jpg', mime: 'image/jpeg', size: 790000 },
    { id: 'wp-night', parent: 'wallpapers', name: 'Golden Gate (Night).jpg', asset: 'wallpapers/gg-night.jpg', mime: 'image/jpeg', size: 610000 },
    { id: 'wp-folds', parent: 'wallpapers', name: 'Silk Folds.jpg', asset: 'wallpapers/folds-light.jpg', mime: 'image/jpeg', size: 420000 },
    { id: 'wp-folds-d', parent: 'wallpapers', name: 'Silk Folds (Dark).jpg', asset: 'wallpapers/folds-dark.jpg', mime: 'image/jpeg', size: 380000 },
    { id: 'wp-glass', parent: PICTURES, name: 'Bay Glass.jpg', asset: 'wallpapers/glass-light.jpg', mime: 'image/jpeg', size: 300000 },
  ];
  for (const f of files) {
    const mime = f.mime ?? mimeFromName(f.name);
    nodes.push({
      id: f.id,
      parentId: f.parent,
      name: f.name,
      kind: 'file',
      mime,
      size: f.size ?? (f.data ? new Blob([f.data]).size : 0),
      createdAt: t,
      modifiedAt: t,
      trashed: false,
      assetUrl: f.asset ? `./${f.asset}` : undefined,
      deskPos: f.deskPos,
    });
    if (f.data) await persistContent(f.id, f.data);
  }
  if (await isDbAvailable()) {
    try {
      await db.nodes.bulkPut(nodes);
    } catch (e) {
      reportQuotaError(e);
    }
  }
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

export const useFs = create<FsState>()((set, get) => ({
  nodes: {},
  ready: false,

  init: async () => {
    let nodes: Record<string, FsNode> = {};
    if (await isDbAvailable()) {
      try {
        const all = await db.nodes.toArray();
        nodes = Object.fromEntries(all.map((n) => [n.id, n]));
      } catch {
        nodes = {};
      }
    }
    if (!nodes[ROOT]) nodes = await seed();
    // keep home folder name in sync with account name
    const acct = useSettings.getState().user.accountName;
    if (nodes[HOME] && acct && nodes[HOME].name !== acct) {
      nodes[HOME] = { ...nodes[HOME], name: acct };
      void persistNode(nodes[HOME]);
    }
    // auto-empty items in trash for more than 30 days
    if (useSettings.getState().finder.autoEmptyTrash) {
      const cutoff = Date.now() - 30 * 86400000;
      for (const n of Object.values(nodes)) if (n.trashed && (n.trashedAt ?? 0) < cutoff) delete nodes[n.id];
    }
    set({ nodes, ready: true });
  },

  children: (parentId) => Object.values(get().nodes).filter((n) => n.parentId === parentId && !n.trashed),

  createFolder: async (parentId, name = 'untitled folder') => {
    const t = Date.now();
    const n: FsNode = { id: uid('f'), parentId, name: uniqueName(get().nodes, parentId, name), kind: 'folder', mime: 'folder', size: 0, createdAt: t, modifiedAt: t, trashed: false };
    set((s) => ({ nodes: { ...s.nodes, [n.id]: n } }));
    await persistNode(n);
    return n;
  },

  createFile: async (parentId, name, data, mime, extra) => {
    const t = Date.now();
    const n: FsNode = {
      id: uid('f'),
      parentId,
      name: uniqueName(get().nodes, parentId, name),
      kind: 'file',
      mime: mime || (data instanceof Blob && data.type) || mimeFromName(name),
      size: sizeOf(data),
      createdAt: t,
      modifiedAt: t,
      trashed: false,
      ...extra,
    };
    await persistContent(n.id, data);
    set((s) => ({ nodes: { ...s.nodes, [n.id]: n } }));
    await persistNode(n);
    return n;
  },

  writeFile: async (id, data) => {
    const node = get().nodes[id];
    if (!node) return;
    await persistContent(id, data);
    const n = { ...node, size: sizeOf(data), modifiedAt: Date.now(), assetUrl: undefined };
    set((s) => ({ nodes: { ...s.nodes, [id]: n } }));
    await persistNode(n);
  },

  rename: async (id, name) => {
    const node = get().nodes[id];
    const clean = name.trim().replace(/[/:]/g, '-');
    if (!node || !clean || node.system) return null;
    if (clean === node.name) return clean;
    const final = uniqueName(get().nodes, node.parentId ?? ROOT, clean, id);
    const n = { ...node, name: final, modifiedAt: Date.now(), mime: node.kind === 'file' && !node.assetUrl && mimeFromName(final) !== 'application/octet-stream' ? mimeFromName(final) : node.mime };
    set((s) => ({ nodes: { ...s.nodes, [id]: n } }));
    await persistNode(n);
    return final;
  },

  move: async (ids, targetId) => {
    const state = get();
    const updated: FsNode[] = [];
    const nodes = { ...state.nodes };
    for (const id of ids) {
      const node = nodes[id];
      if (!node || node.system || node.parentId === targetId || id === targetId) continue;
      if (node.kind === 'folder' && isDescendant(nodes, targetId, id)) continue;
      const n = { ...node, parentId: targetId, name: uniqueName(nodes, targetId, node.name, id), deskPos: targetId === DESKTOP ? node.deskPos : undefined, trashed: false };
      nodes[id] = n;
      updated.push(n);
    }
    set({ nodes });
    for (const n of updated) await persistNode(n);
  },

  copy: async (ids, targetId) => {
    const created: string[] = [];
    const copyRec = async (id: string, parent: string, top: boolean) => {
      const src = get().nodes[id];
      if (!src) return;
      if (src.kind === 'folder') {
        const base = top && parent === src.parentId ? `${src.name} copy` : src.name;
        const f = await get().createFolder(parent, base);
        if (top) created.push(f.id);
        for (const c of get().children(id)) await copyRec(c.id, f.id, false);
      } else {
        const data = await readFile(id);
        const dot = src.name.lastIndexOf('.');
        const base = top && parent === src.parentId ? (dot > 0 ? `${src.name.slice(0, dot)} copy${src.name.slice(dot)}` : `${src.name} copy`) : src.name;
        const f = await get().createFile(parent, base, data ?? '', src.mime);
        if (top) created.push(f.id);
      }
    };
    for (const id of ids) await copyRec(id, targetId, true);
    return created;
  },

  trash: async (ids) => {
    const updated: FsNode[] = [];
    set((s) => {
      const nodes = { ...s.nodes };
      for (const id of ids) {
        const node = nodes[id];
        if (!node || node.system) continue;
        const n = { ...node, trashed: true, trashedAt: Date.now(), originalParentId: node.parentId ?? HOME, parentId: TRASH };
        nodes[id] = n;
        updated.push(n);
      }
      return { nodes };
    });
    for (const n of updated) await persistNode(n);
  },

  restore: async (ids) => {
    const updated: FsNode[] = [];
    set((s) => {
      const nodes = { ...s.nodes };
      for (const id of ids) {
        const node = nodes[id];
        if (!node || !node.trashed) continue;
        const target = node.originalParentId && nodes[node.originalParentId] && !nodes[node.originalParentId].trashed ? node.originalParentId : HOME;
        const n = { ...node, trashed: false, trashedAt: undefined, parentId: target, name: uniqueName(nodes, target, node.name, id) };
        nodes[id] = n;
        updated.push(n);
      }
      return { nodes };
    });
    for (const n of updated) await persistNode(n);
  },

  deleteForever: async (ids) => {
    const all = get().nodes;
    const toDelete = new Set<string>();
    const collect = (id: string) => {
      toDelete.add(id);
      for (const n of Object.values(all)) if (n.parentId === id) collect(n.id);
    };
    ids.forEach((id) => {
      if (!all[id]?.system) collect(id);
    });
    set((s) => {
      const nodes = { ...s.nodes };
      toDelete.forEach((id) => delete nodes[id]);
      return { nodes };
    });
    toDelete.forEach((id) => memContents.delete(id));
    if (await isDbAvailable()) {
      await db.nodes.bulkDelete([...toDelete]);
      await db.contents.bulkDelete([...toDelete]);
    }
  },

  emptyTrash: async () => {
    const ids = Object.values(get().nodes)
      .filter((n) => n.trashed && n.parentId === TRASH)
      .map((n) => n.id);
    await get().deleteForever(ids);
  },

  setDeskPos: (id, pos) => {
    const node = get().nodes[id];
    if (!node) return;
    const n = { ...node, deskPos: pos };
    set((s) => ({ nodes: { ...s.nodes, [id]: n } }));
    void persistNode(n);
  },

  setTags: (id, tags) => {
    const node = get().nodes[id];
    if (!node) return;
    const n = { ...node, tags };
    set((s) => ({ nodes: { ...s.nodes, [id]: n } }));
    void persistNode(n);
  },
}));

export function folderSize(nodes: Record<string, FsNode>, id: string): number {
  let total = 0;
  for (const n of Object.values(nodes)) {
    if (n.parentId === id && !n.trashed) total += n.kind === 'folder' ? folderSize(nodes, n.id) : n.size;
  }
  return total;
}

export function trashItems(nodes: Record<string, FsNode>) {
  return Object.values(nodes).filter((n) => n.trashed && n.parentId === TRASH);
}

/** Import host files (from <input type=file> or drag & drop) into the virtual filesystem. */
export async function importHostFiles(files: FileList | File[], parentId: string): Promise<FsNode[]> {
  const out: FsNode[] = [];
  for (const f of Array.from(files)) {
    const mime = f.type || mimeFromName(f.name);
    const isText = mime.startsWith('text/') || /\.(md|txt|json|js|ts|java|py|css|html|csv|xml|yml|yaml|sql|sh)$/i.test(f.name);
    const data: string | Blob = isText && f.size < 5_000_000 ? await f.text() : new Blob([await f.arrayBuffer()], { type: mime });
    out.push(await useFs.getState().createFile(parentId, f.name, data, mime));
  }
  return out;
}
