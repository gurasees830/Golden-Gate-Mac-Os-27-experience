import type { AppDefinition, AppId } from '../types';

/**
 * Central application registry. Definitions are registered once at startup
 * (see apps/index.ts) so that stores can look apps up without import cycles.
 */
const registry = new Map<AppId, AppDefinition>();

export function registerApps(defs: AppDefinition[]) {
  for (const d of defs) registry.set(d.id, d);
}

export function getApp(id: AppId): AppDefinition | undefined {
  return registry.get(id);
}

export function allApps(): AppDefinition[] {
  return [...registry.values()];
}

export function appName(id: AppId): string {
  return registry.get(id)?.name ?? id;
}

/** Find the best app to open a file with a given mime type. */
export function appForMime(mime: string, name = ''): AppId {
  const ext = name.split('.').pop()?.toLowerCase();
  if (mime === 'application/zip') return 'archive';
  if (mime.startsWith('image/')) return 'preview';
  if (mime === 'application/pdf') return 'preview';
  if (mime.startsWith('audio/')) return 'music';
  if (mime.startsWith('video/')) return 'tv';
  if (ext && ['js', 'ts', 'tsx', 'jsx', 'java', 'py', 'json', 'css', 'html', 'c', 'cpp', 'sh', 'sql', 'yml', 'yaml', 'xml', 'md', 'mjs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scss'].includes(ext)) return 'code';
  return 'textedit';
}

/** How well an App Store listing matches a search: every word must appear in its name, subtitle, category or keywords. */
export function storeMatch(a: AppDefinition, q: string): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !a.store) return 0;
  const name = a.name.toLowerCase();
  const hay = `${name} ${a.store.subtitle} ${a.category} ${a.store.keywords ?? ''}`.toLowerCase();
  if (!words.every((w) => hay.includes(w))) return 0;
  return name.startsWith(words[0]) ? 3 : name.includes(words[0]) ? 2 : 1;
}

export function appsForMime(mime: string): AppDefinition[] {
  return allApps().filter((a) => a.opens?.some((p) => mime.startsWith(p)));
}
