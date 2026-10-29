import { create } from 'zustand';
import type { AppId, Bounds, WindowState } from '../types';
import { getApp } from '../lib/appRegistry';
import { useSettings } from './settings';
import { uid } from '../lib/persist';

export const MENUBAR_H = 30;

/** Usable desktop area (excludes menu bar and a visible Dock). */
export function workArea(): Bounds {
  const s = useSettings.getState();
  const scale = s.display.scale || 1;
  const vw = window.innerWidth / scale;
  const vh = window.innerHeight / scale;
  const dockSpace = s.dock.autohide ? 6 : s.dock.size + 22;
  const top = MENUBAR_H;
  if (s.dock.position === 'bottom') return { x: 0, y: top, w: vw, h: vh - top - dockSpace };
  if (s.dock.position === 'left') return { x: dockSpace, y: top, w: vw - dockSpace, h: vh - top };
  return { x: 0, y: top, w: vw - dockSpace, h: vh - top };
}

type CloseGuard = () => Promise<boolean>;
const closeGuards = new Map<string, CloseGuard>();
export const hasCloseGuard = (winId: string) => closeGuards.has(winId);
export function setCloseGuard(winId: string, guard: CloseGuard | null) {
  if (guard) closeGuards.set(winId, guard);
  else closeGuards.delete(winId);
}

interface WindowsState {
  windows: WindowState[];
  topZ: number;
  recentApps: AppId[];
  /** Apps that are running, even with no windows open (macOS keeps them alive until ⌘Q). */
  running: AppId[];
  /** The frontmost app — owns the menu bar, even when it has no windows. */
  activeApp: AppId | null;
  activate: (appId: AppId) => void;
  open: (appId: AppId, args?: Record<string, unknown>, opts?: { forceNew?: boolean; bounds?: Partial<Bounds> }) => string | null;
  close: (id: string, force?: boolean) => Promise<boolean>;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  toggleFullscreen: (id: string) => void;
  tile: (id: string, mode: 'left' | 'right' | 'fill' | 'top' | 'bottom' | 'center') => void;
  setBounds: (id: string, b: Bounds) => void;
  setTitle: (id: string, title: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
  setArgs: (id: string, args: Record<string, unknown>) => void;
  quitApp: (appId: AppId, force?: boolean) => Promise<void>;
  hideApp: (appId: AppId) => void;
  showApp: (appId: AppId) => void;
  hideOthers: (appId: AppId) => void;
  showAll: () => void;
  closeAll: (force?: boolean) => Promise<boolean>;
  minimizeAll: () => void;
}

let cascade = 0;

export const useWindows = create<WindowsState>()((set, get) => ({
  windows: [],
  topZ: 10,
  recentApps: [],
  running: [],
  activeApp: null,
  activate: (appId) => set({ activeApp: appId }),

  open: (appId, args, opts) => {
    const def = getApp(appId);
    if (!def) return null;
    const state = get();
    if (def.window.singleton && !opts?.forceNew) {
      const existing = state.windows.find((w) => w.appId === appId);
      if (existing) {
        if (args) get().setArgs(existing.id, { ...(existing.args || {}), ...args, _nonce: Date.now() });
        get().restore(existing.id);
        return existing.id;
      }
    }
    const area = workArea();
    const w = Math.min(def.window.width, area.w - 40);
    const h = Math.min(def.window.height, area.h - 20);
    const sameApp = state.windows.filter((x) => x.appId === appId).length;
    const offset = ((cascade++ % 8) * 26) * (sameApp > 0 || state.windows.length > 0 ? 1 : 0);
    let x = area.x + Math.max(10, (area.w - w) / 2) + offset - (state.windows.length ? 80 : 0);
    let y = area.y + Math.max(8, (area.h - h) / 2.6) + offset - (state.windows.length ? 30 : 0);
    x = Math.max(area.x + 4, Math.min(x, area.x + area.w - w - 4));
    y = Math.max(area.y + 4, Math.min(y, area.y + area.h - h - 4));
    const id = uid('win');
    const z = state.topZ + 1;
    const win: WindowState = {
      id,
      appId,
      title: def.name,
      bounds: { x, y, w, h, ...(opts?.bounds || {}) },
      z,
      minimized: false,
      maximized: false,
      fullscreen: false,
      args,
      createdAt: Date.now(),
    };
    set({
      windows: [...state.windows, win],
      topZ: z,
      running: state.running.includes(appId) ? state.running : [...state.running, appId],
      activeApp: appId,
      recentApps: [appId, ...state.recentApps.filter((a) => a !== appId)].slice(0, 10),
    });
    return id;
  },

  close: async (id, force) => {
    const guard = closeGuards.get(id);
    if (guard && !force) {
      const ok = await guard();
      if (!ok) return false;
    }
    closeGuards.delete(id);
    set((s) => {
      const gone = s.windows.find((w) => w.id === id);
      const windows = s.windows.filter((w) => w.id !== id);
      if (!gone) return { windows };
      const lastOne = !windows.some((w) => w.appId === gone.appId);
      // Like macOS, closing an app's last window leaves the app running — except
      // for single-window utilities, which quit when their window closes.
      if (lastOne && QUIT_ON_LAST_CLOSE.has(gone.appId)) {
        return { windows, running: s.running.filter((a) => a !== gone.appId), activeApp: s.activeApp === gone.appId ? topApp(windows) : s.activeApp };
      }
      return { windows };
    });
    return true;
  },

  focus: (id) =>
    set((s) => {
      const w = s.windows.find((x) => x.id === id);
      if (!w) return s;
      const maxZ = Math.max(...s.windows.map((x) => x.z));
      if (w.z === maxZ && !w.minimized && !w.hidden) return s.activeApp === w.appId ? s : { activeApp: w.appId };
      const z = s.topZ + 1;
      // activating an app un-hides all of its windows, as on macOS
      return { topZ: z, activeApp: w.appId, windows: s.windows.map((x) => (x.id === id ? { ...x, z, minimized: false, hidden: false } : x.appId === w.appId && x.hidden ? { ...x, hidden: false } : x)) };
    }),

  minimize: (id) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) })),

  restore: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      const app = s.windows.find((w) => w.id === id)?.appId;
      return { topZ: z, activeApp: app ?? s.activeApp, windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false, hidden: false, z } : w.appId === app && w.hidden ? { ...w, hidden: false } : w)) };
    }),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized || w.fullscreen) return { ...w, maximized: false, fullscreen: false, bounds: w.prevBounds || w.bounds };
        const a = workArea();
        return { ...w, maximized: true, prevBounds: w.bounds, bounds: { x: a.x, y: a.y, w: a.w, h: a.h } };
      }),
    })),

  toggleFullscreen: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.fullscreen) return { ...w, fullscreen: false, maximized: false, bounds: w.prevBounds || w.bounds };
        const scale = useSettings.getState().display.scale || 1;
        return { ...w, fullscreen: true, prevBounds: w.maximized ? w.prevBounds : w.bounds, bounds: { x: 0, y: 0, w: window.innerWidth / scale, h: window.innerHeight / scale } };
      }),
    })),

  tile: (id, mode) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        const a = workArea();
        const def = getApp(w.appId);
        const prev = w.maximized || w.fullscreen ? w.prevBounds : w.bounds;
        const gap = 6;
        let b: Bounds;
        switch (mode) {
          case 'left':
            b = { x: a.x + gap, y: a.y + gap, w: a.w / 2 - gap * 1.5, h: a.h - gap * 2 };
            break;
          case 'right':
            b = { x: a.x + a.w / 2 + gap / 2, y: a.y + gap, w: a.w / 2 - gap * 1.5, h: a.h - gap * 2 };
            break;
          case 'top':
            b = { x: a.x + gap, y: a.y + gap, w: a.w - gap * 2, h: a.h / 2 - gap * 1.5 };
            break;
          case 'bottom':
            b = { x: a.x + gap, y: a.y + a.h / 2 + gap / 2, w: a.w - gap * 2, h: a.h / 2 - gap * 1.5 };
            break;
          case 'center': {
            const cw = Math.min(def?.window.width ?? w.bounds.w, a.w - 40);
            const ch = Math.min(def?.window.height ?? w.bounds.h, a.h - 40);
            b = { x: a.x + (a.w - cw) / 2, y: a.y + (a.h - ch) / 2, w: cw, h: ch };
            break;
          }
          default:
            b = { x: a.x + gap, y: a.y + gap, w: a.w - gap * 2, h: a.h - gap * 2 };
        }
        if (def) {
          b.w = Math.max(b.w, def.window.minWidth);
          b.h = Math.max(b.h, def.window.minHeight);
        }
        return { ...w, bounds: b, maximized: false, fullscreen: false, prevBounds: prev, minimized: false };
      }),
    })),

  setBounds: (id, b) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, bounds: b, maximized: false } : w)) })),
  setTitle: (id, title) => set((s) => ({ windows: s.windows.map((w) => (w.id === id && w.title !== title ? { ...w, title } : w)) })),
  setDirty: (id, dirty) => set((s) => ({ windows: s.windows.map((w) => (w.id === id && w.dirty !== dirty ? { ...w, dirty } : w)) })),
  setArgs: (id, args) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, args } : w)) })),

  quitApp: async (appId, force) => {
    const wins = get().windows.filter((w) => w.appId === appId);
    for (const w of wins) {
      const ok = await get().close(w.id, force);
      if (!ok) return;
    }
    if (appId === 'finder') return; // Finder is always running
    set((s) => ({ running: s.running.filter((a) => a !== appId), activeApp: s.activeApp === appId ? topApp(s.windows) : s.activeApp }));
  },
  hideApp: (appId) =>
    set((s) => {
      const windows = s.windows.map((w) => (w.appId === appId ? { ...w, hidden: true } : w));
      return { windows, activeApp: s.activeApp === appId ? topApp(windows) : s.activeApp };
    }),
  showApp: (appId) => set((s) => ({ windows: s.windows.map((w) => (w.appId === appId && w.hidden ? { ...w, hidden: false } : w)) })),
  hideOthers: (appId) => set((s) => ({ windows: s.windows.map((w) => (w.appId !== appId ? { ...w, hidden: true } : w)) })),
  showAll: () => set((s) => ({ windows: s.windows.map((w) => (w.hidden ? { ...w, hidden: false } : w)) })),
  closeAll: async (force) => {
    for (const w of [...get().windows]) {
      const ok = await get().close(w.id, force);
      if (!ok) return false;
    }
    set({ running: [], activeApp: null });
    return true;
  },
  minimizeAll: () => set((s) => ({ windows: s.windows.map((w) => ({ ...w, minimized: true })) })),
}));

/** Apps that quit when their only window closes (as their macOS counterparts do). */
const QUIT_ON_LAST_CLOSE = new Set<AppId>(['settings', 'calculator', 'about', 'systemreport', 'getinfo', 'photobooth', 'screenshot', 'archive', 'launchpad']);

function topApp(windows: WindowState[]): AppId | null {
  let best: WindowState | null = null;
  for (const w of windows) if (!w.minimized && !w.hidden && (!best || w.z > best.z)) best = w;
  return best ? best.appId : null;
}

/** Frontmost window of the active app (null when the active app has no visible windows). */
function pickFocused(s: { windows: WindowState[]; activeApp: AppId | null }): WindowState | null {
  let best: WindowState | null = null;
  const app = s.activeApp;
  for (const w of s.windows) if (!w.minimized && !w.hidden && (!app || w.appId === app) && (!best || w.z > best.z)) best = w;
  return best;
}

export function focusedWindow(): WindowState | undefined {
  return pickFocused(useWindows.getState()) ?? undefined;
}

export function activeAppId(): AppId {
  const s = useWindows.getState();
  return s.activeApp ?? topApp(s.windows) ?? 'finder';
}

export function runningAppIds(): AppId[] {
  const s = useWindows.getState();
  const ids = [...new Set([...s.running, ...s.windows.map((w) => w.appId)])];
  return ids.includes('finder') ? ids : ['finder', ...ids];
}

export function useFocusedWindowId(): string | null {
  return useWindows((s) => pickFocused(s)?.id ?? null);
}

export function useFocusedAppId(): AppId {
  return useWindows((s) => s.activeApp ?? topApp(s.windows) ?? 'finder');
}
