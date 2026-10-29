import Dexie, { type Table } from 'dexie';
import type { FsNode } from '../types';

/**
 * IndexedDB layout. Each local profile (guest or a signed-in cloud account)
 * gets its own database so guest data never mixes with account data.
 */
export interface KV {
  key: string;
  value: string;
}
export interface Content {
  id: string;
  data: string | Blob;
}

class GoldenGateDB extends Dexie {
  kv!: Table<KV, string>;
  nodes!: Table<FsNode, string>;
  contents!: Table<Content, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      kv: 'key',
      nodes: 'id, parentId, trashed',
      contents: 'id',
    });
  }
}

export function activeProfile(): string {
  try {
    return localStorage.getItem('gg-active-profile') || 'guest';
  } catch {
    return 'guest';
  }
}

export function setActiveProfile(profile: string) {
  try {
    localStorage.setItem('gg-active-profile', profile);
  } catch {
    /* storage unavailable */
  }
}

export const db = new GoldenGateDB(`golden-gate-${activeProfile()}`);

let dbAvailable: boolean | null = null;
export async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await db.open();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

// In-memory fallback when IndexedDB is blocked (private mode, sandbox).
const memKV = new Map<string, string>();

export const kvStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!(await isDbAvailable())) return memKV.get(key) ?? null;
    try {
      return (await db.kv.get(key))?.value ?? null;
    } catch {
      return memKV.get(key) ?? null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    memKV.set(key, value);
    if (!(await isDbAvailable())) return;
    try {
      await db.kv.put({ key, value });
    } catch (e) {
      reportQuotaError(e);
    }
  },
  async removeItem(key: string): Promise<void> {
    memKV.delete(key);
    if (!(await isDbAvailable())) return;
    try {
      await db.kv.delete(key);
    } catch {
      /* ignore */
    }
  },
};

type QuotaListener = (msg: string) => void;
const quotaListeners = new Set<QuotaListener>();
export function onQuotaError(fn: QuotaListener) {
  quotaListeners.add(fn);
  return () => {
    quotaListeners.delete(fn);
  };
}
export function reportQuotaError(e: unknown) {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(String(e))) {
    quotaListeners.forEach((fn) => fn('Your browser storage for this simulator is full. Empty the Trash or delete large files.'));
  }
}

/** Approximate bytes used per category, measured from stored data. */
export async function measureStorage() {
  const out = { files: 0, photos: 0, music: 0, video: 0, documents: 0, appData: 0, system: 0 };
  if (!(await isDbAvailable())) return out;
  const nodes = await db.nodes.toArray();
  for (const n of nodes) {
    if (n.kind !== 'file') continue;
    if (n.mime.startsWith('image/')) out.photos += n.size;
    else if (n.mime.startsWith('audio/')) out.music += n.size;
    else if (n.mime.startsWith('video/')) out.video += n.size;
    else if (n.mime.startsWith('text/') || n.mime.includes('pdf') || n.mime.includes('json')) out.documents += n.size;
    else out.files += n.size;
  }
  const kv = await db.kv.toArray();
  for (const k of kv) {
    const size = k.value.length * 2;
    if (k.key === 'settings' || k.key === 'apps') out.system += size;
    else out.appData += size;
  }
  return out;
}

export async function exportAllData(): Promise<string> {
  const kv = await db.kv.toArray();
  const nodes = await db.nodes.toArray();
  const contents = await db.contents.toArray();
  const serialContents = await Promise.all(
    contents.map(async (c) => {
      if (typeof c.data === 'string') return { id: c.id, type: 'text', data: c.data };
      const buf = await c.data.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { id: c.id, type: 'blob', mime: c.data.type, data: btoa(bin) };
    }),
  );
  return JSON.stringify({ format: 'golden-gate-backup', version: 1, exportedAt: new Date().toISOString(), kv, nodes, contents: serialContents });
}

export async function importAllData(json: string) {
  const parsed = JSON.parse(json) as {
    format: string;
    kv: KV[];
    nodes: FsNode[];
    contents: { id: string; type: string; mime?: string; data: string }[];
  };
  if (parsed.format !== 'golden-gate-backup') throw new Error('This file is not a Golden Gate backup.');
  await db.transaction('rw', db.kv, db.nodes, db.contents, async () => {
    await db.kv.clear();
    await db.nodes.clear();
    await db.contents.clear();
    await db.kv.bulkPut(parsed.kv);
    await db.nodes.bulkPut(parsed.nodes);
    await db.contents.bulkPut(
      parsed.contents.map((c) => {
        if (c.type === 'text') return { id: c.id, data: c.data };
        const bin = atob(c.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { id: c.id, data: new Blob([bytes], { type: c.mime }) };
      }),
    );
  });
}

export async function eraseAllData() {
  try {
    await db.delete();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('gg-active-profile');
  } catch {
    /* ignore */
  }
}
