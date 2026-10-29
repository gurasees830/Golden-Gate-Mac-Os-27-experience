import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppProps } from '../../types';
import { DragRegion, useMenus, useWindow, useWindowTitle } from '../../shell/windowContext';
import { idb, registerHydration, uid } from '../../lib/persist';
import { useWindows } from '../../stores/windows';
import { openApp } from '../../shell/actions';
import { replaceInTextarea } from '../../lib/textReplace';
import { confirmDialog } from '../../stores/system';

const COLORS = [
  { id: 'yellow', bg: '#fff59a', bar: '#ffe55c' },
  { id: 'blue', bg: '#bfe3ff', bar: '#9fd2ff' },
  { id: 'green', bg: '#c9f5b4', bar: '#a8ec8a' },
  { id: 'pink', bg: '#ffc9e3', bar: '#ffa8d0' },
  { id: 'purple', bg: '#e1ccff', bar: '#cfb0ff' },
  { id: 'gray', bg: '#e8e8e8', bar: '#d4d4d4' },
];
interface Note { id: string; text: string; color: string; bounds?: { x: number; y: number; w: number; h: number } }
const useStickies = create<{ notes: Note[]; set: (p: { notes: Note[] }) => void }>()(persist((set) => ({ notes: [], set: (p) => set(p) }), idb('app.stickies')));
registerHydration(useStickies);

export default function Stickies({ win }: AppProps) {
  const { notes, set } = useStickies();
  const { close, focused } = useWindow();
  const noteId = useRef<string>((win.args?.noteId as string) ?? '');

  // first window opens every saved note; new windows create a note
  useEffect(() => {
    if (noteId.current) return;
    const others = useWindows.getState().windows.filter((w) => w.appId === 'stickies' && w.id !== win.id);
    const all = useStickies.getState().notes;
    const unopened = all.filter((n) => !others.some((w) => w.args?.noteId === n.id));
    if (unopened.length && !win.args?.fresh) {
      noteId.current = unopened[0].id;
      useWindows.getState().setArgs(win.id, { noteId: unopened[0].id });
      if (unopened[0].bounds) useWindows.getState().setBounds(win.id, unopened[0].bounds);
      unopened.slice(1).forEach((n) => useWindows.getState().open('stickies', { noteId: n.id }, { forceNew: true, bounds: n.bounds }));
    } else {
      const n: Note = { id: uid('st'), text: '', color: 'yellow' };
      noteId.current = n.id;
      set({ notes: [...all, n] });
      useWindows.getState().setArgs(win.id, { noteId: n.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = notes.find((n) => n.id === (noteId.current || win.args?.noteId));
  const update = (p: Partial<Note>) => set({ notes: useStickies.getState().notes.map((n) => (n.id === note?.id ? { ...n, ...p } : n)) });
  useEffect(() => {
    if (note) update({ bounds: win.bounds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.bounds.x, win.bounds.y, win.bounds.w, win.bounds.h]);
  useWindowTitle(note?.text.split('\n')[0]?.slice(0, 40) || 'Stickies');
  const color = COLORS.find((c) => c.id === note?.color) ?? COLORS[0];

  const del = async () => {
    if (note?.text && !(await confirmDialog('Delete this note?', 'Its text will be lost.', 'Delete'))) return;
    set({ notes: useStickies.getState().notes.filter((n) => n.id !== note?.id) });
    close();
  };
  useMenus([{ title: 'File', items: [{ label: 'New Note', shortcut: 'mod+n', action: () => openApp('stickies', { fresh: true }, { forceNew: true }) }, { label: 'Delete Note', action: () => void del() }] }, { title: 'Color', items: COLORS.map((c) => ({ label: c.id[0].toUpperCase() + c.id.slice(1), checked: note?.color === c.id, action: () => update({ color: c.id }) })) }], [note?.color, note?.id]);

  return (
    <div className="flex flex-col h-full" style={{ background: color.bg, color: '#1c1c1e' }}>
      <DragRegion className="h-[22px] flex items-center px-2 flex-none" style={{ background: color.bar, opacity: focused ? 1 : 0.85 }}>
        <button className="w-[11px] h-[11px] border-0 p-0" style={{ background: 'rgba(0,0,0,.18)' }} aria-label="Close note" onClick={close} data-no-drag />
        <div className="flex-1" />
        <div className="flex gap-[3px]" data-no-drag>
          {COLORS.map((c) => <button key={c.id} aria-label={c.id} className="w-[10px] h-[10px] rounded-full border-0 p-0" style={{ background: c.bar, boxShadow: '0 0 0 .5px rgba(0,0,0,.3)' }} onClick={() => update({ color: c.id })} />)}
        </div>
      </DragRegion>
      <textarea
        aria-label="Sticky note"
        className="flex-1 w-full resize-none border-0 outline-none bg-transparent p-2 text-[13px] leading-snug selectable"
        style={{ fontFamily: '"Marker Felt", "Segoe Print", "Comic Sans MS", var(--font)' }}
        value={note?.text ?? ''}
        placeholder="Type a note…"
        onChange={(e) => {
          update({ text: e.target.value });
          const ie = e.nativeEvent as InputEvent;
          if (ie.data && /[\s.,!?]/.test(ie.data) && replaceInTextarea(e.target)) update({ text: e.target.value });
        }}
      />
    </div>
  );
}
