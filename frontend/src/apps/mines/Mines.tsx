import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Flag, Bomb, RotateCcw } from 'lucide-react';
import type { AppProps } from '../../types';
import { DragRegion, TrafficLights, useMenus } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useWindows } from '../../stores/windows';
import { playUi } from '../../lib/sound';

const LEVELS = { beginner: { w: 9, h: 9, m: 10 }, intermediate: { w: 16, h: 16, m: 40 }, expert: { w: 24, h: 16, m: 70 } } as const;
type Level = keyof typeof LEVELS;
interface Cell { mine: boolean; open: boolean; flag: boolean; n: number }
const useBest = create<{ best: Partial<Record<Level, number>>; set: (p: { best: Partial<Record<Level, number>> }) => void }>()(persist((set) => ({ best: {}, set: (p) => set(p) }), idb('app.mines')));
registerHydration(useBest);
const COLORS = ['', '#0a84ff', '#30a14e', '#ff3b30', '#5856d6', '#a2452b', '#30b0c7', '#1c1c1e', '#8e8e93'];

function makeBoard(w: number, h: number): Cell[] {
  return Array.from({ length: w * h }, () => ({ mine: false, open: false, flag: false, n: 0 }));
}

export default function Mines({ win }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const L = LEVELS[level];
  const [cells, setCells] = useState<Cell[]>(() => makeBoard(L.w, L.h));
  const [state, setState] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready');
  const [start, setStart] = useState(0);
  const [now, setNow] = useState(0);
  const best = useBest();
  const CS = 28;

  useEffect(() => {
    const ws = useWindows.getState();
    const cur = ws.windows.find((w) => w.id === win.id);
    if (cur) ws.setBounds(win.id, { ...cur.bounds, w: Math.max(300, L.w * CS + 32), h: L.h * CS + 128 });
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  useEffect(() => {
    if (state !== 'playing') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state]);

  const reset = () => {
    setCells(makeBoard(L.w, L.h));
    setState('ready');
    setNow(0);
  };
  const neighbors = (i: number) => {
    const x = i % L.w;
    const y = Math.floor(i / L.w);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h) out.push(ny * L.w + nx);
      }
    return out;
  };
  const open = (i: number) => {
    if (state === 'won' || state === 'lost') return;
    let b = cells.map((c) => ({ ...c }));
    if (state === 'ready') {
      const safe = new Set([i, ...neighbors(i)]);
      let placed = 0;
      while (placed < L.m) {
        const r = Math.floor(Math.random() * b.length);
        if (!b[r].mine && !safe.has(r)) {
          b[r].mine = true;
          placed++;
        }
      }
      b = b.map((c, k) => ({ ...c, n: neighbors(k).filter((j) => b[j].mine).length }));
      setState('playing');
      setStart(Date.now());
      setNow(Date.now());
    }
    if (b[i].flag || b[i].open) return;
    if (b[i].mine) {
      b.forEach((c) => c.mine && (c.open = true));
      setCells(b);
      setState('lost');
      playUi('error');
      return;
    }
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      if (b[k].open || b[k].flag) continue;
      b[k].open = true;
      if (b[k].n === 0) stack.push(...neighbors(k));
    }
    setCells(b);
    if (b.filter((c) => !c.open).length === L.m) {
      setState('won');
      const t = Math.round((Date.now() - start) / 1000);
      if (!best.best[level] || t < best.best[level]!) best.set({ best: { ...best.best, [level]: t } });
    }
  };
  const flag = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    if (state !== 'playing' || cells[i].open) return;
    setCells(cells.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c)));
  };
  useMenus([{ title: 'Game', items: [{ label: 'New Game', shortcut: 'mod+n', action: reset }, { separator: true }, ...(Object.keys(LEVELS) as Level[]).map((l) => ({ label: l[0].toUpperCase() + l.slice(1), checked: level === l, action: () => setLevel(l) }))] }], [level]);
  const secs = state === 'playing' || state === 'won' || state === 'lost' ? Math.max(0, Math.round(((state === 'playing' ? now : now || Date.now()) - start) / 1000)) : 0;
  const flags = cells.filter((c) => c.flag).length;

  return (
    <div className="flex flex-col h-full" style={{ background: '#c9d1d9' }}>
      <DragRegion className="h-[40px] flex items-center pr-2 flex-none" style={{ background: 'linear-gradient(#e5e9ee,#cfd6dd)' }}>
        <TrafficLights />
        <select className="popup ml-3" value={level} onChange={(e) => setLevel(e.target.value as Level)} data-no-drag aria-label="Difficulty">
          {(Object.keys(LEVELS) as Level[]).map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
        </select>
      </DragRegion>
      <div className="flex items-center justify-between px-4 py-2" style={{ color: '#1c1c1e' }}>
        <span className="font-mono text-[18px] font-bold flex items-center gap-1"><Flag size={15} /> {L.m - flags}</span>
        <button className="btn" onClick={reset} aria-label="New game"><RotateCcw size={13} /> {state === 'won' ? 'You won!' : state === 'lost' ? 'Try again' : 'New'}</button>
        <span className="font-mono text-[18px] font-bold">{String(secs).padStart(3, '0')}</span>
      </div>
      <div className="flex-1 grid place-items-center pb-3">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${L.w}, ${CS}px)` }}>
          {cells.map((c, i) => (
            <button
              key={i}
              aria-label={c.open ? (c.mine ? 'mine' : `${c.n}`) : c.flag ? 'flagged' : 'hidden'}
              className="border-0 p-0 grid place-items-center text-[14px] font-bold"
              style={{ width: CS, height: CS, background: c.open ? (c.mine ? '#ff6b60' : '#eef1f4') : 'linear-gradient(#f7f9fb,#d5dce3)', boxShadow: c.open ? 'inset 0 0 0 .5px #b6c0ca' : 'inset 0 0 0 .5px #9aa6b2, inset 0 1px 0 #fff', color: COLORS[c.n] }}
              onClick={() => open(i)}
              onContextMenu={(e) => flag(e, i)}
            >
              {c.open ? (c.mine ? <Bomb size={15} color="#1c1c1e" /> : c.n || '') : c.flag ? <Flag size={13} color="#ff3b30" fill="#ff3b30" /> : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="text-center text-[11px] pb-2" style={{ color: '#4a5560' }}>Right-click to flag · Best: {best.best[level] ? `${best.best[level]}s` : '—'}</div>
    </div>
  );
}
