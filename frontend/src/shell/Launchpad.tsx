import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSystem, confirmDialog } from '../stores/system';
import { useApps, launchableApps } from '../stores/apps';
import { useSettings } from '../stores/settings';
import { AppIcon } from '../icons/AppIcon';
import { SearchField } from '../components/ui';
import { openApp } from './actions';
import { pt } from '../lib/screen';
import type { AppDefinition } from '../types';
import { Wallpaper } from './Wallpaper';

const COLS = 7;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;

export async function uninstallApp(app: AppDefinition) {
  const { showDialog } = await import('../stores/system');
  const r = await showDialog({
    title: `Delete “${app.name}”?`,
    message: 'Deleting this app also removes it from the Dock and Launchpad. You can reinstall it from the App Store.',
    icon: app.id,
    checkbox: { label: 'Also delete this app’s data', checked: false },
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Delete', value: 'ok', primary: true, danger: true },
    ],
  });
  if (r.value !== 'ok') return false;
  const { useWindows } = await import('../stores/windows');
  await useWindows.getState().quitApp(app.id, true);
  useApps.getState().uninstall(app.id);
  if (r.checked) {
    const { kvStorage } = await import('../lib/db');
    await kvStorage.removeItem(`app.${app.id}`);
  }
  return true;
}
void confirmDialog;

export function Launchpad() {
  const open = useSystem((s) => s.launchpad);
  const set = useSystem((s) => s.set);
  const installed = useApps((s) => s.installed);
  const removed = useApps((s) => s.removed);
  const order = useApps((s) => s.launchpadOrder);
  const natural = useSettings((s) => s.pointer.naturalScrolling);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [jiggle, setJiggle] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: number } | null>(null);
  const wheelLock = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const apps = useMemo(() => {
    const list = launchableApps({ installed, removed });
    const idx = (id: string) => {
      const i = order.indexOf(id);
      return i === -1 ? 1000 + list.findIndex((a) => a.id === id) : i;
    };
    return list.sort((a, b) => idx(a.id) - idx(b.id));
  }, [installed, removed, order]);

  const categories = useMemo(() => ['All', ...[...new Set(apps.map((a) => a.category))].sort()], [apps]);
  const filtered = apps.filter((a) => (cat === 'All' || a.category === cat) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  useEffect(() => {
    if (!open) return;
    setQ('');
    setPage(0);
    setJiggle(false);
    setCat('All');
    setTimeout(() => inputRef.current?.focus(), 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (jiggle) setJiggle(false);
        else set({ launchpad: false });
      }
      if (e.key === 'ArrowRight' && !(e.target as HTMLElement).closest('input')) setPage((p) => Math.min(p + 1, pages - 1));
      if (e.key === 'ArrowLeft' && !(e.target as HTMLElement).closest('input')) setPage((p) => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [pages, page]);

  if (!open) return null;

  const onIconDown = (e: React.PointerEvent, app: AppDefinition) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = pt(e);
    let started = false;
    const longPress = window.setTimeout(() => setJiggle(true), 700);
    const move = (ev: PointerEvent) => {
      const p = pt(ev);
      if (!started && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
      window.clearTimeout(longPress);
      started = true;
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const cell = els.find((el) => (el as HTMLElement).dataset?.lpIndex) as HTMLElement | undefined;
      setDrag({ id: app.id, x: p.x, y: p.y, over: cell ? Number(cell.dataset.lpIndex) : -1 });
    };
    const up = () => {
      window.clearTimeout(longPress);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag((d) => {
        if (d && d.over >= 0) {
          const ids = apps.map((a) => a.id);
          const from = ids.indexOf(d.id);
          const target = filtered[d.over]?.id;
          const to = target ? ids.indexOf(target) : ids.length - 1;
          ids.splice(from, 1);
          ids.splice(to, 0, d.id);
          useApps.setState({ launchpadOrder: ids });
        } else if (!started && !jiggle) {
          openApp(app.id);
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className="absolute inset-0 z-[8500] anim-fade"
      onPointerDown={() => (jiggle ? setJiggle(false) : set({ launchpad: false }))}
      onWheel={(e) => {
        const now = Date.now();
        if (now - wheelLock.current < 500) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 12) return;
        wheelLock.current = now;
        const dir = (d > 0 ? 1 : -1) * (natural ? 1 : -1);
        setPage((p) => Math.max(0, Math.min(pages - 1, p + dir)));
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Wallpaper blur={40} dim={0.18} />
      <div className="absolute inset-0 flex flex-col items-center pt-[52px]" style={{ color: '#fff' }}>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <SearchField ref={inputRef} width={260} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} onClear={() => setQ('')} aria-label="Search apps" />
        </div>
        <div className="flex gap-[6px] mt-4 flex-wrap justify-center max-w-[80%]" onPointerDown={(e) => e.stopPropagation()}>
          {categories.map((c) => (
            <button
              key={c}
              className="h-[24px] px-3 rounded-full border-0 text-[12px] font-medium"
              style={{ background: c === cat ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.18)', color: c === cat ? '#000' : '#fff' }}
              onClick={() => {
                setCat(c);
                setPage(0);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1 w-full overflow-hidden relative mt-4">
          <div className="absolute inset-0 flex transition-transform duration-500" style={{ transform: `translateX(-${page * 100}%)`, transitionTimingFunction: 'cubic-bezier(.2,.9,.25,1)' }}>
            {Array.from({ length: pages }, (_, pi) => (
              <div key={pi} className="w-full h-full flex-none flex justify-center">
                <div className="grid gap-y-[18px] gap-x-[10px] content-start pt-6" style={{ gridTemplateColumns: `repeat(${COLS}, 128px)` }}>
                  {filtered.slice(pi * PER_PAGE, (pi + 1) * PER_PAGE).map((a, i) => {
                    const idx = pi * PER_PAGE + i;
                    return (
                      <div
                        key={a.id}
                        data-lp-index={idx}
                        className="flex flex-col items-center gap-[6px] relative"
                        style={{ opacity: drag?.id === a.id ? 0.3 : 1, animation: jiggle && !a.system ? `gg-jiggle .28s ${(i % 3) * 0.05}s infinite alternate` : undefined, outline: drag && drag.over === idx && drag.id !== a.id ? '2px dashed rgba(255,255,255,.6)' : undefined, borderRadius: 18 }}
                        onPointerDown={(e) => onIconDown(e, a)}
                      >
                        <div style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.3))' }}>
                          <AppIcon id={a.id} size={84} />
                        </div>
                        <div className="text-[12.5px] font-medium text-center truncate max-w-[120px]" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
                          {a.name}
                        </div>
                        {jiggle && !a.system && (
                          <button
                            aria-label={`Delete ${a.name}`}
                            className="absolute -top-1 left-3 w-[22px] h-[22px] rounded-full border-0 grid place-items-center"
                            style={{ background: 'rgba(60,60,60,.85)', color: '#fff' }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => void uninstallApp(a)}
                          >
                            <X size={12} strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <div className="absolute inset-0 grid place-items-center text-[15px] opacity-80">No Results</div>}
        </div>
        <div className="flex gap-[9px] pb-[110px] pt-2" onPointerDown={(e) => e.stopPropagation()}>
          {pages > 1 &&
            Array.from({ length: pages }, (_, i) => (
              <button key={i} aria-label={`Page ${i + 1}`} className="w-[8px] h-[8px] rounded-full border-0 p-0" style={{ background: i === page ? '#fff' : 'rgba(255,255,255,.4)' }} onClick={() => setPage(i)} />
            ))}
        </div>
      </div>
      {drag && (
        <div className="fixed pointer-events-none z-[8600]" style={{ left: drag.x - 42, top: drag.y - 42 }}>
          <AppIcon id={drag.id} size={84} />
        </div>
      )}
      <style>{`@keyframes gg-jiggle { from { transform: rotate(-2deg) } to { transform: rotate(2deg) } }`}</style>
    </div>
  );
}
