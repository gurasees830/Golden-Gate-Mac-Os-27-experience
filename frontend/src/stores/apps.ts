import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idb, registerHydration } from '../lib/persist';
import { allApps, getApp } from '../lib/appRegistry';
import type { AppId } from '../types';
import { notify } from './notifications';

export const DEFAULT_DOCK: AppId[] = [
  'finder', 'launchpad', 'safari', 'messages', 'mail', 'maps', 'photos', 'facetime', 'calendar', 'contacts', 'reminders', 'notes', 'music', 'appstore', 'settings', 'terminal', 'code',
];

export interface InstallJob {
  appId: AppId;
  progress: number; // 0..1
  startedAt: number;
  kind: 'install' | 'update';
}

interface AppsState {
  installed: AppId[]; // catalog apps installed from the App Store
  removed: AppId[]; // preinstalled apps the user uninstalled
  versions: Record<AppId, string>;
  dock: AppId[];
  launchpadOrder: AppId[];
  history: { appId: AppId; action: 'install' | 'uninstall' | 'update'; time: number; version?: string }[];
  ratings: Record<AppId, { stars: number; title: string; review: string; time: number }>;
  recentDocs: string[];
  jobs: Record<AppId, InstallJob>;
  set: (p: Partial<AppsState>) => void;
  addToDock: (id: AppId, index?: number) => void;
  removeFromDock: (id: AppId) => void;
  moveInDock: (id: AppId, toIndex: number) => void;
  markInstalled: (id: AppId, version: string, kind: 'install' | 'update') => void;
  uninstall: (id: AppId) => void;
  addRecentDoc: (nodeId: string) => void;
}

export const useApps = create<AppsState>()(
  persist(
    (set, get) => ({
      installed: [],
      removed: [],
      versions: {},
      dock: DEFAULT_DOCK,
      launchpadOrder: [],
      history: [],
      ratings: {},
      recentDocs: [],
      jobs: {},
      set: (p) => set(p),
      addToDock: (id, index) =>
        set((s) => {
          if (s.dock.includes(id)) return s;
          const d = [...s.dock];
          d.splice(index ?? d.length, 0, id);
          return { dock: d };
        }),
      removeFromDock: (id) => set((s) => ({ dock: s.dock.filter((x) => x !== id || x === 'finder') })),
      moveInDock: (id, toIndex) =>
        set((s) => {
          const d = s.dock.filter((x) => x !== id);
          d.splice(Math.max(0, Math.min(toIndex, d.length)), 0, id);
          return { dock: d };
        }),
      markInstalled: (id, version, kind) =>
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[id];
          const def = getApp(id);
          return {
            jobs,
            installed: def?.preinstalled ? s.installed : [...new Set([...s.installed, id])],
            removed: s.removed.filter((x) => x !== id),
            versions: { ...s.versions, [id]: version },
            history: [{ appId: id, action: kind, time: Date.now(), version }, ...s.history].slice(0, 200),
          };
        }),
      uninstall: (id) =>
        set((s) => ({
          installed: s.installed.filter((x) => x !== id),
          removed: getApp(id)?.preinstalled ? [...new Set([...s.removed, id])] : s.removed,
          dock: s.dock.filter((x) => x !== id),
          history: [{ appId: id, action: 'uninstall' as const, time: Date.now() }, ...s.history].slice(0, 200),
        })),
      addRecentDoc: (nodeId) => set((s) => ({ recentDocs: [nodeId, ...s.recentDocs.filter((x) => x !== nodeId)].slice(0, 12) })),
    }),
    idb<AppsState>('apps', {
      partialize: (s) => ({ ...s, jobs: {} }) as AppsState,
    }),
  ),
);
registerHydration(useApps);

export function isInstalled(id: AppId, s: Pick<AppsState, 'installed' | 'removed'> = useApps.getState()): boolean {
  const def = getApp(id);
  if (!def) return false;
  if (def.system) return true;
  if (def.preinstalled) return !s.removed.includes(id);
  return s.installed.includes(id);
}

export function installedVersion(id: AppId): string | undefined {
  const s = useApps.getState();
  if (!isInstalled(id)) return undefined;
  return s.versions[id] ?? getApp(id)?.store?.version ?? '1.0';
}

export function launchableApps(s: Pick<AppsState, 'installed' | 'removed'>) {
  return allApps().filter((a) => !a.hidden && isInstalled(a.id, s));
}

/** Simulated install: progress is driven by the app's listed size; nothing native is downloaded. */
const timers = new Map<AppId, number>();
export function startInstall(id: AppId, kind: 'install' | 'update' = 'install') {
  const def = getApp(id);
  if (!def?.store) return;
  if (timers.has(id)) return;
  const sizeMB = def.store.sizeMB;
  const duration = Math.min(9000, 1800 + sizeMB * 45);
  const started = Date.now();
  useApps.setState((s) => ({ jobs: { ...s.jobs, [id]: { appId: id, progress: 0, startedAt: started, kind } } }));
  const t = window.setInterval(() => {
    const p = Math.min(1, (Date.now() - started) / duration);
    const eased = p < 1 ? 1 - Math.pow(1 - p, 1.6) : 1;
    useApps.setState((s) => (s.jobs[id] ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], progress: eased } } } : s));
    if (p >= 1) {
      window.clearInterval(t);
      timers.delete(id);
      useApps.getState().markInstalled(id, def.store!.latestVersion ?? def.store!.version, kind);
      notify({ appId: 'appstore', title: `${def.name} ${kind === 'update' ? 'Updated' : 'Installed'}`, body: 'Open it from Launchpad, Spotlight or the Applications folder.', open: { appId: id } });
    }
  }, 120);
  timers.set(id, t);
}

export function cancelInstall(id: AppId) {
  const t = timers.get(id);
  if (t) window.clearInterval(t);
  timers.delete(id);
  useApps.setState((s) => {
    const jobs = { ...s.jobs };
    delete jobs[id];
    return { jobs };
  });
}

export function hasUpdate(id: AppId): boolean {
  const def = getApp(id);
  if (!def?.store?.latestVersion || !isInstalled(id)) return false;
  const v = useApps.getState().versions[id] ?? def.store.version;
  return v !== def.store.latestVersion;
}
