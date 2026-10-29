import { create } from 'zustand';
import type { DialogSpec, MenuDef, MenuItem } from '../types';
import { uid } from '../lib/persist';

export type PowerState = 'booting' | 'onboarding' | 'login' | 'locked' | 'desktop' | 'sleep' | 'off' | 'restarting' | 'shuttingdown' | 'loggingout';

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
  anchor?: 'top-left' | 'bottom-center' | 'top-right';
}

interface SystemState {
  power: PowerState;
  bootReason: 'cold' | 'restart' | 'update';
  spotlight: boolean;
  launchpad: boolean;
  controlCenter: boolean;
  notificationCenter: boolean;
  activeMenu: string | null;
  contextMenu: ContextMenuState | null;
  dialogs: DialogSpec[];
  quickLook: string | null;
  screensaver: boolean;
  shortcutsPanel: boolean;
  menus: Record<string, MenuDef[]>; // windowId → menus
  fsClipboard: { ids: string[]; mode: 'copy' | 'cut' } | null;
  dockBounce: Record<string, number>; // appId → timestamp
  dragOverDock: boolean;
  desktopSelection: string[];
  toast: { id: string; text: string } | null;
  set: (partial: Partial<SystemState>) => void;
  closeOverlays: () => void;
  openContextMenu: (e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => void;
  registerMenus: (windowId: string, menus: MenuDef[]) => void;
  unregisterMenus: (windowId: string) => void;
  showToast: (text: string) => void;
}

export const useSystem = create<SystemState>()((set) => ({
  power: 'booting',
  bootReason: 'cold',
  spotlight: false,
  launchpad: false,
  controlCenter: false,
  notificationCenter: false,
  activeMenu: null,
  contextMenu: null,
  dialogs: [],
  quickLook: null,
  screensaver: false,
  shortcutsPanel: false,
  menus: {},
  fsClipboard: null,
  dockBounce: {},
  dragOverDock: false,
  desktopSelection: [],
  toast: null,
  set: (partial) => set(partial),
  closeOverlays: () => set({ spotlight: false, launchpad: false, controlCenter: false, notificationCenter: false, activeMenu: null, contextMenu: null }),
  openContextMenu: (e, items) => {
    e.preventDefault?.();
    set({ contextMenu: { x: e.clientX, y: e.clientY, items }, activeMenu: null, controlCenter: false });
  },
  registerMenus: (windowId, menus) => set((s) => ({ menus: { ...s.menus, [windowId]: menus } })),
  unregisterMenus: (windowId) =>
    set((s) => {
      const m = { ...s.menus };
      delete m[windowId];
      return { menus: m };
    }),
  showToast: (text) => {
    const id = uid();
    set({ toast: { id, text } });
    setTimeout(() => {
      if (useSystem.getState().toast?.id === id) set({ toast: null });
    }, 2600);
  },
}));

type DialogInput = Omit<DialogSpec, 'id' | 'resolve'>;

/** Promise-based macOS-style alert. Resolves with the clicked button value. */
export function showDialog(spec: DialogInput): Promise<{ value: string; input?: string; checked?: boolean }> {
  return new Promise((resolve) => {
    const id = uid('dlg');
    const d: DialogSpec = {
      ...spec,
      id,
      resolve: (r) => {
        useSystem.setState((s) => ({ dialogs: s.dialogs.filter((x) => x.id !== id) }));
        resolve(r);
      },
    };
    useSystem.setState((s) => ({ dialogs: [...s.dialogs, d] }));
  });
}

export async function confirmDialog(title: string, message: string, confirmLabel = 'OK', opts: Partial<DialogInput> = {}): Promise<boolean> {
  const r = await showDialog({
    title,
    message,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: confirmLabel, value: 'ok', primary: true, danger: opts.icon === 'warning' },
    ],
    ...opts,
  });
  return r.value === 'ok';
}

export async function promptDialog(title: string, message: string, value = '', opts: Partial<DialogInput> = {}): Promise<string | null> {
  const r = await showDialog({
    title,
    message,
    input: { value },
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'OK', value: 'ok', primary: true },
    ],
    ...opts,
  });
  return r.value === 'ok' ? (r.input ?? '') : null;
}
