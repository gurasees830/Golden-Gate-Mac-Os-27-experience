import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../icons/AppIcon';
import { appName } from '../lib/appRegistry';
import { isMacHost } from '../lib/env';
import { useSystem } from '../stores/system';
import { useSettings } from '../stores/settings';
import { focusedWindow, runningAppIds, useWindows } from '../stores/windows';
import { openApp } from './actions';

/** Running apps, most recently used first. Finder is always running, as on macOS. */
function runningApps(): string[] {
  const s = useWindows.getState();
  const ws = [...s.windows].sort((a, b) => b.z - a.z);
  const ids: string[] = s.activeApp ? [s.activeApp] : [];
  for (const w of ws) if (!ids.includes(w.appId)) ids.push(w.appId);
  for (const a of runningAppIds()) if (!ids.includes(a)) ids.push(a);
  return ids.filter((a) => a !== 'launchpad');
}

function activate(appId: string) {
  const ws = useWindows.getState();
  const wins = ws.windows.filter((w) => w.appId === appId);
  if (!wins.length) {
    // a running app with no windows just becomes frontmost (its menu bar appears)
    if (useWindows.getState().running.includes(appId)) useWindows.getState().activate(appId);
    else openApp(appId);
    return;
  }
  const visible = wins.filter((w) => !w.minimized);
  const target = (visible.length ? visible : wins).reduce((a, b) => (a.z > b.z ? a : b));
  ws.restore(target.id);
}

/**
 * ⌘-Tab app switcher. Browsers and host systems reserve ⌘/Alt-Tab, so it also
 * answers to Option/Alt-` . In browser full screen the Keyboard Lock API lets
 * ⌘/Alt-Tab itself through (Chromium browsers).
 *
 * ⌘-` (Ctrl-` on Windows/Linux) cycles windows of the frontmost app.
 */
export function AppSwitcher() {
  const [apps, setApps] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const state = useRef<{ apps: string[]; index: number; hold: 'Meta' | 'Alt' } | null>(null);

  useEffect(() => {
    const close = (commit: boolean) => {
      const st = state.current;
      state.current = null;
      setApps(null);
      if (commit && st) activate(st.apps[st.index]);
    };
    const onDown = (e: KeyboardEvent) => {
      if (useSystem.getState().power !== 'desktop' || !useSettings.getState().keyboard.shortcutsEnabled) return;
      const st = state.current;
      const isTab = e.code === 'Tab';
      const isTick = e.code === 'Backquote';
      // window cycling: ⌘` / Ctrl`
      if (!st && isTick && (isMacHost ? e.metaKey : e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const fw = focusedWindow();
        if (!fw) return;
        const same = useWindows.getState().windows.filter((w) => w.appId === fw.appId && !w.minimized).sort((a, b) => a.z - b.z);
        if (same.length > 1) useWindows.getState().focus(e.shiftKey ? same[same.length - 2].id : same[0].id);
        return;
      }
      const holdMeta = isMacHost && e.metaKey && !e.ctrlKey;
      const holdAlt = e.altKey && !e.ctrlKey && !e.metaKey;
      if (!st) {
        if (!((isTab && (holdMeta || holdAlt)) || (isTick && holdAlt))) return;
        e.preventDefault();
        e.stopPropagation();
        const list = runningApps();
        const start = list.length > 1 ? (e.shiftKey ? list.length - 1 : 1) : 0;
        state.current = { apps: list, index: start, hold: holdMeta ? 'Meta' : 'Alt' };
        setApps(list);
        setIndex(start);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const n = st.apps.length;
      if (isTab || isTick || e.key === 'ArrowRight') st.index = (st.index + (e.shiftKey && !e.key.startsWith('Arrow') ? -1 : 1) + n) % n;
      else if (e.key === 'ArrowLeft') st.index = (st.index - 1 + n) % n;
      else if (e.key === 'Escape') return close(false);
      else if (e.code === 'KeyQ') {
        const id = st.apps[st.index];
        void useWindows.getState().quitApp(id);
        st.apps = st.apps.filter((a) => a !== id || a === 'finder');
        st.index = Math.min(st.index, st.apps.length - 1);
        setApps([...st.apps]);
      } else if (e.code === 'KeyH') useWindows.getState().hideApp(st.apps[st.index]);
      setIndex(st.index);
    };
    const onUp = (e: KeyboardEvent) => {
      const st = state.current;
      if (st && e.key === st.hold) close(true);
    };
    const onBlur = () => close(false);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (!apps) return null;
  const size = apps.length > 10 ? 64 : 92;
  return (
    <div className="absolute inset-0 z-[9500] grid place-items-center pointer-events-none" role="listbox" aria-label="App Switcher">
      <div className="liquid rounded-[26px] px-[14px] py-[14px] flex gap-[6px] pointer-events-auto" style={{ background: 'var(--glass-strong)', boxShadow: '0 20px 60px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(255,255,255,.35)', backdropFilter: 'blur(40px) saturate(1.8)' }}>
        {apps.map((id, i) => (
          <button
            key={id}
            role="option"
            aria-selected={i === index}
            className="border-0 bg-transparent p-[8px] rounded-[18px] flex flex-col items-center gap-[6px]"
            style={{ background: i === index ? 'rgba(127,127,127,.32)' : undefined }}
            onPointerEnter={() => state.current && ((state.current.index = i), setIndex(i))}
            onClick={() => {
              state.current = null;
              setApps(null);
              activate(id);
            }}
          >
            <AppIcon id={id} size={size} />
            <span className="text-[12px] leading-[16px] max-w-[110px] truncate" style={{ opacity: i === index ? 0.9 : 0, color: 'var(--text)' }}>{appName(id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
