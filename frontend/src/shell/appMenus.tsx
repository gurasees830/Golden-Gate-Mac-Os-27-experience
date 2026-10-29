import type { AppId, MenuDef, MenuItem } from '../types';
import { appName, getApp } from '../lib/appRegistry';
import { useWindows } from '../stores/windows';
import { useSystem } from '../stores/system';
import { useFs, DESKTOP, HOME, DOCUMENTS, DOWNLOADS, APPLICATIONS } from '../stores/fs';
import { useApps } from '../stores/apps';
import {
  aboutThisMac, confirmPower, emptyTrash, forceQuitDialog, lockScreen, openApp, openFile, openSettings, sleep, takeScreenshot, toggleBrowserFullscreen,
} from './actions';

function editMenu(): MenuDef {
  const exec = (cmd: string) => () => {
    try {
      document.execCommand(cmd);
    } catch {
      /* ignore */
    }
  };
  return {
    title: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'mod+z', action: exec('undo') },
      { label: 'Redo', shortcut: 'mod+shift+z', action: exec('redo') },
      { separator: true },
      { label: 'Cut', shortcut: 'mod+x', action: exec('cut') },
      { label: 'Copy', shortcut: 'mod+c', action: exec('copy') },
      {
        label: 'Paste',
        shortcut: 'mod+v',
        action: async () => {
          try {
            const t = await navigator.clipboard.readText();
            document.execCommand('insertText', false, t);
          } catch {
            useSystem.getState().showToast('Press Ctrl+V (⌘V on a Mac) to paste.');
          }
        },
      },
      { label: 'Select All', shortcut: 'mod+a', action: exec('selectAll') },
      { separator: true },
      { label: 'Emoji & Symbols', action: () => useSystem.getState().showToast('Use your computer’s emoji picker (Win + . on Windows, Ctrl ⌘ Space on a Mac).') },
    ],
  };
}

function windowMenu(appId: AppId, winId: string | null): MenuDef {
  const ws = useWindows.getState();
  const appWins = ws.windows.filter((w) => w.appId === appId);
  const has = !!winId;
  return {
    title: 'Window',
    items: [
      { label: 'Minimize', shortcut: 'mod+m', disabled: !has, action: () => winId && ws.minimize(winId) },
      { label: 'Zoom', disabled: !has, action: () => winId && ws.toggleMaximize(winId) },
      { label: 'Fill', shortcut: 'ctrl+alt+enter', disabled: !has, action: () => winId && ws.tile(winId, 'fill') },
      { label: 'Center', shortcut: 'ctrl+alt+c', disabled: !has, action: () => winId && ws.tile(winId, 'center') },
      {
        label: 'Move & Resize',
        disabled: !has,
        submenu: [
          { label: 'Left', shortcut: 'ctrl+alt+arrowleft', action: () => winId && ws.tile(winId, 'left') },
          { label: 'Right', shortcut: 'ctrl+alt+arrowright', action: () => winId && ws.tile(winId, 'right') },
          { label: 'Top', shortcut: 'ctrl+alt+arrowup', action: () => winId && ws.tile(winId, 'top') },
          { label: 'Bottom', shortcut: 'ctrl+alt+arrowdown', action: () => winId && ws.tile(winId, 'bottom') },
          { separator: true },
          { label: 'Return to Previous Size', action: () => winId && ws.toggleMaximize(winId) },
        ],
      },
      { label: 'Full Screen Tile', disabled: !has, action: () => winId && ws.toggleFullscreen(winId) },
      { separator: true },
      { label: 'Bring All to Front', action: () => appWins.forEach((w) => ws.restore(w.id)) },
      ...(appWins.length ? [{ separator: true } as MenuItem] : []),
      ...appWins.map((w) => ({ label: w.title || appName(appId), checked: w.id === winId, action: () => ws.restore(w.id) })),
    ],
  };
}

function helpMenu(appId: AppId): MenuDef {
  return {
    title: 'Help',
    items: [
      { label: `${appName(appId)} Help`, action: () => openApp('safari', { url: `golden-gate://help#${appId}` }) },
      { label: 'Keyboard Shortcuts', shortcut: 'mod+/', action: () => useSystem.getState().set({ shortcutsPanel: true }) },
      { separator: true },
      { label: 'About This Simulator', action: () => openApp('safari', { url: 'golden-gate://help#about' }) },
    ],
  };
}

export function finderDesktopMenus(): MenuDef[] {
  const fs = useFs.getState();
  return [
    {
      title: 'File',
      items: [
        { label: 'New Finder Window', shortcut: 'mod+n', action: () => openApp('finder', { folderId: HOME }, { forceNew: true }) },
        { label: 'New Folder', shortcut: 'mod+shift+n', action: () => void fs.createFolder(DESKTOP) },
        { label: 'New Text Document', action: () => void fs.createFile(DESKTOP, 'Untitled.txt', '', 'text/plain') },
        { separator: true },
        { label: 'Open', shortcut: 'mod+o', disabled: !useSystem.getState().desktopSelection.length, action: () => useSystem.getState().desktopSelection.forEach((id) => openFile(id)) },
        { label: 'Move to Trash', shortcut: 'mod+backspace', disabled: !useSystem.getState().desktopSelection.length, action: () => void import('./actions').then((m) => m.moveToTrash(useSystem.getState().desktopSelection)) },
        { separator: true },
        { label: 'Take Screenshot', shortcut: 'mod+shift+3', action: () => void takeScreenshot('screen') },
      ],
    },
    editMenu(),
    {
      title: 'View',
      items: [
        { label: 'Clean Up', action: () => Object.values(fs.nodes).filter((n) => n.parentId === DESKTOP).forEach((n) => fs.setDeskPos(n.id, undefined)) },
        { label: 'Show View Options', action: () => openSettings('desktop') },
        { separator: true },
        { label: 'Enter Full Screen', shortcut: 'ctrl+mod+f', action: toggleBrowserFullscreen },
      ],
    },
    {
      title: 'Go',
      items: [
        { label: 'Recents', action: () => openApp('finder', { folderId: 'recents' }, { forceNew: true }) },
        { label: 'Documents', shortcut: 'mod+shift+o', action: () => openApp('finder', { folderId: DOCUMENTS }, { forceNew: true }) },
        { label: 'Desktop', shortcut: 'mod+shift+d', action: () => openApp('finder', { folderId: DESKTOP }, { forceNew: true }) },
        { label: 'Downloads', shortcut: 'mod+alt+l', action: () => openApp('finder', { folderId: DOWNLOADS }, { forceNew: true }) },
        { label: 'Home', shortcut: 'mod+shift+h', action: () => openApp('finder', { folderId: HOME }, { forceNew: true }) },
        { label: 'Applications', shortcut: 'mod+shift+a', action: () => openApp('finder', { folderId: APPLICATIONS }, { forceNew: true }) },
        { label: 'Utilities', action: () => openApp('finder', { folderId: APPLICATIONS }, { forceNew: true }) },
      ],
    },
  ];
}

/** Build the full menu bar for the focused app (app menu + app menus + standard menus). */
export function buildMenus(appId: AppId, winId: string | null): MenuDef[] {
  const def = getApp(appId);
  const name = def?.name ?? 'Finder';
  const ws = useWindows.getState();
  const registered = (winId && useSystem.getState().menus[winId]) || (appId === 'finder' && !winId ? finderDesktopMenus() : []);
  const has = (t: string) => registered.some((m) => m.title === t);
  const appMenu: MenuDef = {
    title: name,
    items: [
      { label: `About ${name}`, action: () => (appId === 'finder' ? aboutThisMac() : openApp('appstore', { appId, about: true })) },
      { separator: true },
      { label: 'Settings…', shortcut: 'mod+,', action: () => openSettings(appId === 'finder' ? 'desktop' : 'applications') },
      { separator: true },
      ...(appId === 'finder' ? [{ label: 'Empty Trash…', shortcut: 'mod+shift+backspace', action: () => void emptyTrash() } as MenuItem, { separator: true } as MenuItem] : []),
      { label: `Hide ${name}`, shortcut: 'mod+h', action: () => ws.hideApp(appId) },
      { label: 'Hide Others', shortcut: 'mod+alt+h', action: () => ws.hideOthers(appId) },
      { label: 'Show All', action: () => ws.showAll() },
      ...(appId !== 'finder' ? [{ separator: true } as MenuItem, { label: `Quit ${name}`, shortcut: 'mod+q', action: () => void ws.quitApp(appId) } as MenuItem] : []),
    ],
  };
  const fileDefault: MenuDef = {
    title: 'File',
    items: [
      ...(def && !def.window.singleton ? [{ label: 'New Window', shortcut: 'mod+n', action: () => openApp(appId, undefined, { forceNew: true }) } as MenuItem] : []),
      { label: 'Close Window', shortcut: 'mod+w', disabled: !winId, action: () => winId && void ws.close(winId) },
    ],
  };
  const out: MenuDef[] = [appMenu];
  out.push(has('File') ? registered.find((m) => m.title === 'File')! : fileDefault);
  if (has('File')) {
    const f = out[out.length - 1];
    if (!f.items.some((i) => i.label === 'Close Window')) f.items = [...f.items, { separator: true }, { label: 'Close Window', shortcut: 'mod+w', disabled: !winId, action: () => winId && void ws.close(winId) }];
  }
  out.push(has('Edit') ? registered.find((m) => m.title === 'Edit')! : editMenu());
  for (const m of registered) if (!['File', 'Edit', 'Window', 'Help'].includes(m.title)) out.push(m);
  if (!has('View'))
    out.splice(3, 0, {
      title: 'View',
      items: [{ label: 'Enter Full Screen', shortcut: 'ctrl+mod+f', disabled: !winId, action: () => winId && ws.toggleFullscreen(winId) }],
    });
  out.push(windowMenu(appId, winId));
  out.push(helpMenu(appId));
  return out;
}

export function systemMenu(): MenuItem[] {
  const recentApps = useWindows.getState().recentApps.filter((a) => getApp(a) && !getApp(a)!.hidden).slice(0, 6);
  const nodes = useFs.getState().nodes;
  const recentDocs = useApps.getState().recentDocs.filter((id) => nodes[id] && !nodes[id].trashed).slice(0, 6);
  const name = settingsName();
  return [
    { label: 'About This Mac', action: aboutThisMac },
    { separator: true },
    { label: 'System Settings…', action: () => openSettings() },
    { label: 'App Store…', action: () => openApp('appstore') },
    { separator: true },
    {
      label: 'Recent Items',
      submenu: [
        { label: 'Applications', disabled: true },
        ...(recentApps.length ? recentApps.map((a) => ({ label: appName(a), action: () => openApp(a) })) : [{ label: 'No recent apps', disabled: true }]),
        { separator: true },
        { label: 'Documents', disabled: true },
        ...(recentDocs.length ? recentDocs.map((id) => ({ label: nodes[id].name, action: () => openFile(id) })) : [{ label: 'No recent documents', disabled: true }]),
        { separator: true },
        { label: 'Clear Menu', action: () => useApps.setState({ recentDocs: [] }) },
      ],
    },
    { separator: true },
    { label: 'Force Quit…', shortcut: 'mod+alt+escape', action: () => void forceQuitDialog() },
    { separator: true },
    { label: 'Sleep', action: sleep },
    { label: 'Restart…', action: () => void confirmPower('restart') },
    { label: 'Shut Down…', action: () => void confirmPower('shutdown') },
    { separator: true },
    { label: 'Lock Screen', shortcut: 'ctrl+mod+q', action: lockScreen },
    { label: `Log Out ${name}…`, shortcut: 'mod+shift+q', action: () => void confirmPower('logout') },
  ];
}

import { useSettings } from '../stores/settings';
function settingsName() {
  return useSettings.getState().user.fullName;
}
