import { useEffect } from 'react';
import { isMacHost } from '../lib/env';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { activeAppId, focusedWindow, useWindows } from '../stores/windows';
import type { MenuItem } from '../types';
import { buildMenus } from './appMenus';
import { confirmPower, forceQuitDialog, lockScreen, takeScreenshot } from './actions';

export function normalizeKey(e: KeyboardEvent): string {
  const c = e.code || '';
  if (c.startsWith('Key')) return c.slice(3).toLowerCase();
  if (c.startsWith('Digit')) return c.slice(5);
  const map: Record<string, string> = { Space: 'space', Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\' };
  if (map[c]) return map[c];
  return (e.key || '').toLowerCase();
}

export function eventMatches(sc: string, e: KeyboardEvent): boolean {
  const parts = sc.toLowerCase().split('+');
  const key = parts.pop();
  const need = new Set(parts);
  let wantMeta = false;
  let wantCtrl = false;
  let wantAlt = need.has('alt');
  const wantShift = need.has('shift');
  if (isMacHost) {
    wantMeta = need.has('mod');
    wantCtrl = need.has('ctrl');
  } else if (need.has('mod')) {
    wantCtrl = true;
    if (need.has('ctrl')) wantAlt = true;
  } else if (need.has('ctrl')) wantCtrl = true;
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl || e.altKey !== wantAlt || e.shiftKey !== wantShift) return false;
  return normalizeKey(e) === key;
}

const NATIVE_EDIT = new Set(['mod+c', 'mod+v', 'mod+x', 'mod+a', 'mod+z', 'mod+shift+z', 'mod+backspace', 'mod+arrowup', 'mod+arrowdown', 'mod+arrowleft', 'mod+arrowright', 'mod+[', 'mod+]']);
/** Plain keys (Space, Return, Delete, arrows) belong to a text field while one is focused. */
const hasCommandModifier = (sc: string) => /(^|\+)(mod|ctrl|alt)\+/.test(sc.toLowerCase());

function findMenuShortcut(items: MenuItem[], e: KeyboardEvent): MenuItem | null {
  for (const it of items) {
    if (it.submenu) {
      const f = findMenuShortcut(it.submenu, e);
      if (f) return f;
    }
    if (it.shortcut && !it.disabled && it.action && eventMatches(it.shortcut, e)) return it;
  }
  return null;
}

/** Centralised keyboard shortcut manager (global + menu-bar derived). */
export function useShortcuts(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useSettings.getState();
      if (!s.keyboard.shortcutsEnabled) return;
      const sys = useSystem.getState();
      if (sys.power !== 'desktop') return;
      const target = e.target as HTMLElement;
      const editable = !!target.closest?.('input,textarea,[contenteditable="true"],.xterm');
      const disabled = new Set(s.keyboard.disabled);
      // Apps with their own key bindings (Code Studio's editor) keep Ctrl+Space, Ctrl+/, Ctrl+H, Ctrl+K…:
      // only that window's own menu shortcuts and a few essentials are handled here.
      if (target.closest?.('[data-own-keys]') && !sys.dialogs.length) {
        const fw0 = focusedWindow();
        const own = (fw0 && sys.menus[fw0.id]) || [];
        // Alt+W / Alt+Q stand in for the Ctrl+W / Ctrl+Q browsers keep for themselves
        if (fw0 && (eventMatches('alt+w', e) || eventMatches('alt+q', e))) {
          e.preventDefault();
          e.stopPropagation();
          const closeItem = own.flatMap((m) => m.items).find((i) => i.shortcut === 'mod+w' && !i.disabled && i.action);
          if (eventMatches('alt+q', e)) void useWindows.getState().quitApp(fw0.appId);
          else if (closeItem) closeItem.action!();
          else void useWindows.getState().close(fw0.id);
          return;
        }
        for (const m of own) {
          const it = findMenuShortcut(m.items, e);
          if (it && !NATIVE_EDIT.has(it.shortcut!)) {
            e.preventDefault();
            e.stopPropagation();
            it.action!();
            return;
          }
        }
        for (const m of buildMenus(activeAppId(), fw0?.id ?? null)) {
          const it = findMenuShortcut(m.items, e);
          if (it && ['mod+q', 'mod+m', 'mod+n'].includes(it.shortcut!)) {
            e.preventDefault();
            it.action!();
            return;
          }
        }
        if (eventMatches('mod+shift+3', e)) void takeScreenshot('screen');
        return;
      }
      const run = (id: string, sc: string | string[], fn: () => void) => {
        if (disabled.has(id)) return false;
        const list = Array.isArray(sc) ? sc : [sc];
        if (list.some((x) => eventMatches(x, e))) {
          e.preventDefault();
          e.stopPropagation();
          fn();
          return true;
        }
        return false;
      };
      if (
        run('spotlight', [s.keyboard.spotlightShortcut, 'mod+k'], () => sys.set({ spotlight: !useSystem.getState().spotlight, launchpad: false, activeMenu: null })) ||
        run('launchpad', 'f4', () => sys.set({ launchpad: !useSystem.getState().launchpad, spotlight: false })) ||
        run('screenshot', 'mod+shift+3', () => void takeScreenshot('screen')) ||
        run('screenshot-window', 'mod+shift+4', () => void takeScreenshot('window')) ||
        run('lock', 'ctrl+mod+q', lockScreen) ||
        run('logout', 'mod+shift+q', () => void confirmPower('logout')) ||
        run('forcequit', 'mod+alt+escape', () => void forceQuitDialog()) ||
        run('shortcuts', 'mod+/', () => sys.set({ shortcutsPanel: !useSystem.getState().shortcutsPanel }))
      )
        return;
      if (sys.dialogs.length) return;
      // Alternatives for keys browsers reserve (Ctrl+W / Ctrl+N / Ctrl+T)
      const fw = focusedWindow();
      if (!editable || e.altKey) {
        if (run('alt-close', 'alt+w', () => {
          const close = buildMenus(activeAppId(), fw?.id ?? null).flatMap((m) => m.items).find((i) => i.shortcut === 'mod+w' && !i.disabled && i.action);
          if (close) close.action!();
          else if (fw) void useWindows.getState().close(fw.id);
        })) return;
        if (run('alt-quit', 'alt+q', () => fw && void useWindows.getState().quitApp(fw.appId))) return;
      }
      const menus = buildMenus(activeAppId(), fw?.id ?? null);
      for (const m of menus) {
        const it = findMenuShortcut(m.items, e);
        if (it) {
          if (editable && it.shortcut && (NATIVE_EDIT.has(it.shortcut) || !hasCommandModifier(it.shortcut))) return; // let the browser edit text
          if (disabled.has(it.shortcut!)) return;
          e.preventDefault();
          e.stopPropagation();
          it.action!();
          return;
        }
      }
      if (!editable && e.altKey && !e.ctrlKey && !e.metaKey) {
        // Alt+N → File ▸ New (mod+n) for browsers that reserve Ctrl+N
        const alt = normalizeKey(e);
        if (alt === 'n' || alt === 't') {
          const fake = new KeyboardEvent('keydown', { key: alt, code: `Key${alt.toUpperCase()}`, ctrlKey: !isMacHost, metaKey: isMacHost });
          for (const m of menus) {
            const it = findMenuShortcut(m.items, fake);
            if (it) {
              e.preventDefault();
              it.action!();
              return;
            }
          }
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}
