import { useWindows } from '../stores/windows';
import { useSystem, showDialog, confirmDialog } from '../stores/system';
import { useSettings } from '../stores/settings';
import { useFs, trashItems } from '../stores/fs';
import { isInstalled, useApps } from '../stores/apps';
import { appForMime, appName, getApp } from '../lib/appRegistry';
import { playStartup, playUi } from '../lib/sound';
import type { AppId } from '../types';
import { kvStorage } from '../lib/db';

export function openApp(appId: AppId, args?: Record<string, unknown>, opts?: { forceNew?: boolean }) {
  const def = getApp(appId);
  if (!def) return null;
  if (appId === 'launchpad') {
    const sys = useSystem.getState();
    sys.set({ launchpad: !sys.launchpad, spotlight: false });
    return null;
  }
  if (!isInstalled(appId)) {
    useSystem.getState().showToast(`${def.name} isn't installed. Get it from the App Store.`);
    useWindows.getState().open('appstore', { appId });
    return null;
  }
  const sys = useSystem.getState();
  sys.set({ launchpad: false, spotlight: false });
  const running = useWindows.getState().windows.some((w) => w.appId === appId);
  if (!running && useSettings.getState().dock.animateOpening) {
    sys.set({ dockBounce: { ...sys.dockBounce, [appId]: Date.now() } });
  }
  // A running app with only minimized windows: restore the most recent one.
  if (!args && !opts?.forceNew) {
    const wins = useWindows.getState().windows.filter((w) => w.appId === appId);
    if (wins.length) {
      const visible = wins.filter((w) => !w.minimized);
      if (visible.length) useWindows.getState().showApp(appId);
      const target = (visible.length ? visible : wins).reduce((a, b) => (a.z > b.z ? a : b));
      useWindows.getState().restore(target.id);
      return target.id;
    }
  }
  return useWindows.getState().open(appId, args, opts);
}

export function openFile(nodeId: string, withApp?: AppId) {
  const fs = useFs.getState();
  const node = fs.nodes[nodeId];
  if (!node) return;
  if (node.kind === 'folder') {
    openApp('finder', { folderId: nodeId }, { forceNew: true });
    return;
  }
  if (node.appId) {
    openApp(node.appId);
    return;
  }
  const app = withApp ?? appForMime(node.mime, node.name);
  useApps.getState().addRecentDoc(nodeId);
  const target = isInstalled(app) ? app : node.mime.startsWith('text/') || app === 'codepad' ? 'textedit' : app === 'tv' ? 'preview' : app;
  if (!isInstalled(target)) {
    useSystem.getState().showToast(`No installed app can open “${node.name}”.`);
    return;
  }
  openApp(target, { fileId: nodeId }, { forceNew: getApp(target)?.window.singleton ? false : true });
}

export function openSettings(pane?: string) {
  openApp('settings', pane ? { pane } : undefined);
}

export function aboutThisMac() {
  openApp('about');
}

export async function moveToTrash(ids: string[]) {
  if (!ids.length) return;
  await useFs.getState().trash(ids);
  playUi('trash');
}

export async function emptyTrash() {
  const items = trashItems(useFs.getState().nodes);
  if (!items.length) return;
  if (useSettings.getState().finder.warnEmptyTrash) {
    const ok = await confirmDialog(
      `Are you sure you want to permanently erase the ${items.length === 1 ? 'item' : `${items.length} items`} in the Trash?`,
      "You can't undo this action.",
      'Empty Trash',
      { icon: 'warning' },
    );
    if (!ok) return;
  }
  await useFs.getState().emptyTrash();
  playUi('trash');
}

// ---------------------------------------------------------------- power
async function saveSession() {
  const reopen = useSettings.getState().reopenWindows;
  const wins = useWindows.getState().windows;
  const session = reopen ? wins.map((w) => ({ appId: w.appId, bounds: w.bounds, args: w.args })) : [];
  await kvStorage.setItem('session', JSON.stringify(session));
}

export async function restoreSession() {
  const raw = await kvStorage.getItem('session');
  const loginItems = useSettings.getState().loginItems;
  const opened = new Set<string>();
  if (raw && useSettings.getState().reopenWindows) {
    try {
      const list = JSON.parse(raw) as { appId: AppId; bounds: { x: number; y: number; w: number; h: number }; args?: Record<string, unknown> }[];
      for (const w of list) {
        if (!getApp(w.appId) || !isInstalled(w.appId) || getApp(w.appId)?.hidden) continue;
        useWindows.getState().open(w.appId, w.args, { forceNew: true, bounds: w.bounds });
        opened.add(w.appId);
      }
    } catch {
      /* ignore corrupt session */
    }
  }
  for (const id of loginItems) if (!opened.has(id) && isInstalled(id)) openApp(id);
}

export function lockScreen() {
  useSystem.getState().closeOverlays();
  useSystem.getState().set({ power: 'locked' });
}

export function sleep() {
  useSystem.getState().closeOverlays();
  useSystem.getState().set({ power: 'sleep' });
}

export function wake() {
  const s = useSettings.getState();
  const needsPass = s.lockScreen.requirePasswordAfterSleep && !!s.user.passcodeHash;
  useSystem.getState().set({ power: needsPass ? 'locked' : 'desktop', screensaver: false });
}

async function quitEverything(): Promise<boolean> {
  await saveSession();
  const ok = await useWindows.getState().closeAll();
  if (!ok) {
    useSystem.getState().showToast('An app with unsaved changes cancelled the request.');
    return false;
  }
  return true;
}

export async function restart(reason: 'restart' | 'update' = 'restart') {
  useSystem.getState().closeOverlays();
  if (!(await quitEverything())) return;
  useSystem.getState().set({ power: 'restarting', bootReason: reason });
  setTimeout(() => {
    playStartup();
    useSystem.getState().set({ power: 'booting' });
  }, 1600);
}

export async function shutDown() {
  useSystem.getState().closeOverlays();
  if (!(await quitEverything())) return;
  useSystem.getState().set({ power: 'shuttingdown' });
  setTimeout(() => useSystem.getState().set({ power: 'off' }), 1400);
}

export async function logOut() {
  useSystem.getState().closeOverlays();
  if (!(await quitEverything())) return;
  useSystem.getState().set({ power: 'loggingout' });
  setTimeout(() => useSystem.getState().set({ power: 'login' }), 900);
}

export async function confirmPower(kind: 'restart' | 'shutdown' | 'logout') {
  const name = useSettings.getState().user.fullName;
  const titles = {
    restart: 'Are you sure you want to restart your computer now?',
    shutdown: 'Are you sure you want to shut down your computer now?',
    logout: `Are you sure you want to quit all applications and log out now?`,
  };
  const btn = { restart: 'Restart', shutdown: 'Shut Down', logout: 'Log Out' };
  const r = await showDialog({
    title: titles[kind],
    message: kind === 'logout' ? `${name}'s open windows will close.` : 'Open windows will close. Unsaved changes will ask before closing.',
    icon: 'about',
    checkbox: { label: 'Reopen windows when logging back in', checked: useSettings.getState().reopenWindows },
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: btn[kind], value: 'ok', primary: true },
    ],
  });
  if (r.value !== 'ok') return;
  useSettings.getState().set({ reopenWindows: !!r.checked });
  if (kind === 'restart') void restart();
  else if (kind === 'shutdown') void shutDown();
  else void logOut();
}

export async function forceQuitDialog() {
  const apps = [...new Set(useWindows.getState().windows.map((w) => w.appId))];
  if (!apps.length) {
    useSystem.getState().showToast('No apps are running.');
    return;
  }
  const r = await showDialog({
    title: 'Force Quit Applications',
    message: 'If an app doesn’t respond for a while, select its name and click Force Quit.',
    icon: 'warning',
    buttons: [{ label: 'Cancel', value: 'cancel' }, ...apps.map((a) => ({ label: `Force Quit ${appName(a)}`, value: a, danger: true }))],
  });
  if (r.value !== 'cancel') await useWindows.getState().quitApp(r.value, true);
}

export function showDesktopToggle() {
  const ws = useWindows.getState();
  const anyVisible = ws.windows.some((w) => !w.minimized && !w.hidden);
  if (anyVisible) useWindows.setState((s) => ({ windows: s.windows.map((w) => (!w.minimized && !w.hidden ? { ...w, hidden: true } : w)) }));
  else ws.showAll();
}

export async function takeScreenshot(mode: 'screen' | 'window' = 'screen') {
  const { captureScreenshot } = await import('../lib/screenshot');
  await captureScreenshot(mode);
}

export function toggleBrowserFullscreen() {
  try {
    // In full screen, Keyboard Lock (Chromium) lets ⌘/Alt-Tab, Ctrl-W/N/T and Esc reach the simulator.
    const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
    if (document.fullscreenElement) {
      kb?.unlock?.();
      void document.exitFullscreen();
    } else
      void document.documentElement
        .requestFullscreen()
        .then(() => kb?.lock?.().catch(() => undefined))
        .catch(() => {
        useSystem.getState().showToast('Full screen isn’t allowed here. Press F11 in your browser instead.');
      });
  } catch {
    useSystem.getState().showToast('Full screen isn’t available here. Press F11 in your browser instead.');
  }
}
