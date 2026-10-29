import { describe, it, expect, beforeAll } from 'vitest';
import { registerApps } from '../lib/appRegistry';
import { APPS } from '../apps';
import { useWindows, focusedWindow, activeAppId, runningAppIds } from '../stores/windows';

const ws = () => useWindows.getState();

beforeAll(() => registerApps(APPS));

describe('window manager follows macOS app lifecycle', () => {
  it('closing the last window keeps a normal app running and frontmost', async () => {
    const id = ws().open('notes')!;
    expect(activeAppId()).toBe('notes');
    await ws().close(id);
    expect(ws().windows.some((w) => w.appId === 'notes')).toBe(false);
    expect(runningAppIds()).toContain('notes');
    expect(activeAppId()).toBe('notes');
    expect(focusedWindow()).toBeUndefined();
  });
  it('⌘Q quits the app and hands the menu bar to the next app', async () => {
    const t = ws().open('textedit')!;
    ws().open('notes');
    await ws().quitApp('notes');
    expect(runningAppIds()).not.toContain('notes');
    expect(activeAppId()).toBe('textedit');
    expect(focusedWindow()?.id).toBe(t);
    await ws().quitApp('textedit');
  });
  it('single-window utilities quit when their window closes', async () => {
    const id = ws().open('calculator')!;
    await ws().close(id);
    expect(runningAppIds()).not.toContain('calculator');
  });
  it('hide removes windows from view without minimizing, and activation un-hides', () => {
    const a = ws().open('notes')!;
    ws().hideApp('notes');
    const w = ws().windows.find((x) => x.id === a)!;
    expect(w.hidden).toBe(true);
    expect(w.minimized).toBe(false);
    ws().focus(a);
    expect(ws().windows.find((x) => x.id === a)!.hidden).toBe(false);
  });
  it('minimize and restore round-trip', () => {
    const a = ws().open('textedit')!;
    ws().minimize(a);
    expect(focusedWindow()?.id).not.toBe(a);
    ws().restore(a);
    expect(focusedWindow()?.id).toBe(a);
  });
});
