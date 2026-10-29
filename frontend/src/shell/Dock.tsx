import { memo, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { useApps, isInstalled, hasUpdate } from '../stores/apps';
import { useWindows } from '../stores/windows';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { useNotifications } from '../stores/notifications';
import { useFs, trashItems, DOWNLOADS, TRASH } from '../stores/fs';
import { getApp, appName, allApps } from '../lib/appRegistry';
import { AppIcon } from '../icons/AppIcon';
import { dockEls, pt, uiScale } from '../lib/screen';
import { emptyTrash, openApp, openFile, openSettings } from './actions';
import type { MenuItem, WindowState } from '../types';
import { dndState, dropAt } from '../lib/dnd';

type DockEntry = { kind: 'app'; id: string; pinned: boolean } | { kind: 'sep'; id: string } | { kind: 'min'; id: string; win: WindowState } | { kind: 'downloads'; id: string } | { kind: 'trash'; id: string };

function useDockEntries(): DockEntry[] {
  const dock = useApps((s) => s.dock);
  const installed = useApps((s) => s.installed);
  const removed = useApps((s) => s.removed);
  // only re-render when the set of apps with windows, or minimised windows, changes — not on every move or focus
  const windowApps = useWindows(useShallow((s) => [...new Set(s.windows.map((w) => w.appId))]));
  const minimised = useWindows(useShallow((s) => s.windows.filter((w) => w.minimized)));
  const recent = useWindows((s) => s.recentApps);
  const minToApp = useSettings((s) => s.dock.minimizeToApp);
  const showRecents = useSettings((s) => s.dock.showRecents);
  void installed;
  void removed;
  const pinned = dock.filter((id) => getApp(id) && isInstalled(id));
  const runningIds = useWindows((s) => s.running);
  const running = [...new Set([...runningIds, ...windowApps])].filter((id) => !pinned.includes(id) && !getApp(id)?.hidden);
  const recents = showRecents ? recent.filter((id) => !pinned.includes(id) && !running.includes(id) && getApp(id) && !getApp(id)!.hidden && isInstalled(id)).slice(0, 3) : [];
  const out: DockEntry[] = pinned.map((id) => ({ kind: 'app' as const, id, pinned: true }));
  const extra = [...running, ...recents];
  if (extra.length) {
    out.push({ kind: 'sep', id: 'sep1' });
    extra.forEach((id) => out.push({ kind: 'app', id, pinned: false }));
  }
  out.push({ kind: 'sep', id: 'sep2' });
  if (!minToApp) minimised.forEach((w) => out.push({ kind: 'min', id: `min:${w.id}`, win: w }));
  out.push({ kind: 'downloads', id: 'downloads' });
  out.push({ kind: 'trash', id: 'trash' });
  return out.map(stable);
}

const entryCache = new Map<string, DockEntry>();
function stable(e: DockEntry): DockEntry {
  const prev = entryCache.get(e.id);
  const same = prev && prev.kind === e.kind && (e.kind !== 'app' || (prev as typeof e).pinned === e.pinned) && (e.kind !== 'min' || (prev as typeof e).win === e.win);
  if (same) return prev;
  entryCache.set(e.id, e);
  return e;
}

const DockItem = memo(function DockItem({
  entry,
  mouse,
  base,
  max,
  vertical,
  onDragStart,
  dragging,
}: {
  entry: DockEntry;
  mouse: MotionValue<number>;
  base: number;
  max: number;
  vertical: boolean;
  onDragStart: (e: React.PointerEvent, id: string) => void;
  dragging: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const runningApps = useWindows((st) => st.running);
  // Measure the icon's resting centre once per hover instead of on every pointer move:
  // reading layout each frame forced a full page layout for every icon, which stuttered app launches.
  const center = useRef<number | null>(null);
  const distance = useTransform(mouse, (v) => {
    const el = ref.current;
    if (!el || !Number.isFinite(v)) {
      center.current = null;
      return Infinity;
    }
    if (center.current == null) {
      const r = el.getBoundingClientRect();
      const s = uiScale();
      center.current = vertical ? (r.top + r.height / 2) / s : (r.left + r.width / 2) / s;
    }
    return v - center.current;
  });
  useEffect(() => {
    center.current = null;
  });
  const range = base * 2.8;
  const target = useTransform(distance, [-range, 0, range], [base, max, base], { clamp: true });
  const size = useSpring(target, { mass: 0.1, stiffness: 190, damping: 15 });
  const hasWindow = useWindows((s) => entry.kind === 'app' && s.windows.some((w) => w.appId === entry.id));
  const bounceAt = useSystem((s) => (entry.kind === 'app' ? s.dockBounce[entry.id] : undefined));
  const badges = useNotifications((s) => s.badges);
  const notifBadge = useSettings((s) => (entry.kind === 'app' ? s.notifications.perApp[entry.id]?.badge !== false : true));
  const showInd = useSettings((s) => s.dock.showIndicators);
  const trashFull = useFs((s) => entry.kind === 'trash' && trashItems(s.nodes).length > 0);
  const [hover, setHover] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const reduce = useSettings((s) => s.accessibility.reduceMotion);
  const dragOver = useSystem((s) => s.dragOverDock);
  void dragOver;

  useEffect(() => {
    if (ref.current) dockEls.set(entry.kind === 'min' ? entry.id : entry.id, ref.current);
    return () => {
      dockEls.delete(entry.id);
    };
  }, [entry.id, entry.kind]);

  useEffect(() => {
    if (!bounceAt || reduce) return;
    setBouncing(true);
    const t = setTimeout(() => setBouncing(false), 1500);
    return () => clearTimeout(t);
  }, [bounceAt, reduce]);

  if (entry.kind === 'sep')
    return <div className="flex-none self-center" style={vertical ? { height: 1, width: base * 0.8, margin: '4px 0', background: 'var(--separator-strong)' } : { width: 1, height: base * 0.8, margin: '0 4px', background: 'var(--separator-strong)' }} />;

  const running = entry.kind === 'app' && (entry.id === 'finder' || hasWindow || runningApps.includes(entry.id));
  const label =
    entry.kind === 'app' ? appName(entry.id) : entry.kind === 'trash' ? 'Trash' : entry.kind === 'downloads' ? 'Downloads' : entry.kind === 'min' ? entry.win.title : '';
  const badgeCount = entry.kind === 'app' ? (entry.id === 'appstore' ? countUpdates() : notifBadge ? badges[entry.id] ?? 0 : 0) : 0;

  const onClick = () => {
    if (entry.kind === 'app') openApp(entry.id);
    else if (entry.kind === 'trash') openApp('finder', { folderId: TRASH }, { forceNew: true });
    else if (entry.kind === 'downloads') openApp('finder', { folderId: DOWNLOADS }, { forceNew: true });
    else if (entry.kind === 'min') useWindows.getState().restore(entry.win.id);
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const items = contextFor(entry, running);
    const r = ref.current!.getBoundingClientRect();
    const s = uiScale();
    useSystem.getState().set({
      contextMenu: vertical
        ? { x: ds_pos() === 'left' ? r.right / s + 8 : r.left / s - 8, y: (r.top + r.height / 2) / s - 12, items, anchor: ds_pos() === 'left' ? 'top-left' : 'top-right' }
        : { x: (r.left + r.width / 2) / s, y: r.top / s - 6, items, anchor: 'bottom-center' },
      activeMenu: null,
    });
  };

  const icon =
    entry.kind === 'app' ? (
      <AppIcon id={entry.id} size={100} />
    ) : entry.kind === 'trash' ? (
      <AppIcon id={trashFull ? 'trash-full' : 'trash'} size={100} />
    ) : entry.kind === 'downloads' ? (
      <AppIcon id="downloads" size={100} />
    ) : entry.kind === 'min' ? (
      <div className="w-full h-full rounded-[10%] relative overflow-hidden" style={{ background: 'var(--bg)', boxShadow: '0 0 0 .5px rgba(0,0,0,.2), 0 2px 6px rgba(0,0,0,.25)' }}>
        <div className="h-[18%] chrome" />
        <div className="absolute inset-x-[10%] top-[30%] text-[7px] leading-tight opacity-60 truncate">{entry.win.title}</div>
        <div className="absolute right-[4%] bottom-[4%] w-[42%] h-[42%]">
          <AppIcon id={entry.win.appId} size={100} />
        </div>
      </div>
    ) : null;

  const dropProps =
    entry.kind === 'trash'
      ? { 'data-drop-trash': '1' }
      : entry.kind === 'app'
        ? { 'data-drop-app': entry.id }
        : entry.kind === 'downloads'
          ? { 'data-drop-folder': DOWNLOADS }
          : {};

  return (
    <motion.div
      ref={ref}
      {...dropProps}
      className="relative flex-none flex items-center justify-center dock-ico"
      style={{ width: size, height: size, opacity: dragging ? 0.25 : 1 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => {
        if (e.button === 0 && entry.kind === 'app') onDragStart(e, entry.id);
      }}
      onClick={onClick}
      onContextMenu={onContext}
      role="button"
      aria-label={label}
    >
      <div className="w-full h-full" style={{ animation: bouncing ? 'gg-dock-bounce 0.75s ease-in-out 2' : undefined, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.22))' }}>
        {icon}
      </div>
      {badgeCount > 0 && <div className="badge absolute -top-[2px] -right-[4px]">{badgeCount > 99 ? '99+' : badgeCount}</div>}
      {showInd && running && (
        <div
          className="absolute rounded-full"
          style={vertical ? { left: -6, top: '50%', width: 4, height: 4, marginTop: -2, background: 'var(--text)' } : { bottom: -6, left: '50%', width: 4, height: 4, marginLeft: -2, background: 'var(--text)', opacity: 0.8 }}
        />
      )}
      {hover && !dragging && (
        <div
          className="absolute whitespace-nowrap px-[10px] py-[3px] rounded-[8px] text-[12.5px] pointer-events-none glass-strong anim-fade"
          style={vertical ? { left: '115%', top: '50%', transform: 'translateY(-50%)' } : { bottom: '118%', left: '50%', transform: 'translateX(-50%)' }}
        >
          {label}
        </div>
      )}
    </motion.div>
  );
});

function ds_pos() {
  return useSettings.getState().dock.position;
}

function countUpdates() {
  return allApps().filter((a) => hasUpdate(a.id)).length;
}

function contextFor(entry: DockEntry, running: boolean): MenuItem[] {
  const apps = useApps.getState();
  const ws = useWindows.getState();
  if (entry.kind === 'trash')
    return [
      { label: 'Open', action: () => openApp('finder', { folderId: TRASH }, { forceNew: true }) },
      { separator: true },
      { label: 'Empty Trash', disabled: !trashItems(useFs.getState().nodes).length, action: () => void emptyTrash() },
    ];
  if (entry.kind === 'downloads') {
    const items = Object.values(useFs.getState().nodes)
      .filter((n) => n.parentId === DOWNLOADS && !n.trashed)
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, 8);
    return [
      ...(items.length ? items.map((n) => ({ label: n.name, action: () => openFile(n.id) })) : [{ label: 'No downloads', disabled: true }]),
      { separator: true },
      { label: 'Open in Finder', action: () => openApp('finder', { folderId: DOWNLOADS }, { forceNew: true }) },
    ];
  }
  if (entry.kind === 'min') return [{ label: 'Restore', action: () => ws.restore(entry.win.id) }, { label: 'Close', action: () => void ws.close(entry.win.id) }];
  if (entry.kind !== 'app') return [];
  const id = entry.id;
  const def = getApp(id)!;
  const wins = ws.windows.filter((w) => w.appId === id);
  const inDock = apps.dock.includes(id);
  const login = useSettings.getState().loginItems.includes(id);
  return [
    ...wins.map((w) => ({ label: w.title || def.name, checked: !w.minimized, action: () => ws.restore(w.id) })),
    ...(wins.length ? [{ separator: true } as MenuItem] : []),
    ...(!def.window.singleton ? [{ label: 'New Window', action: () => openApp(id, undefined, { forceNew: true }) } as MenuItem] : []),
    {
      label: 'Options',
      submenu: [
        { label: 'Keep in Dock', checked: inDock, disabled: id === 'finder', action: () => (inDock ? apps.removeFromDock(id) : apps.addToDock(id)) },
        {
          label: 'Open at Login',
          checked: login,
          action: () => {
            const s = useSettings.getState();
            s.set({ loginItems: login ? s.loginItems.filter((x) => x !== id) : [...s.loginItems, id] });
          },
        },
        { separator: true },
        { label: 'Show in Finder', action: () => openApp('finder', { folderId: 'applications', select: id }, { forceNew: true }) },
        { label: 'Notification Settings…', action: () => openSettings('notifications') },
      ],
    },
    { separator: true },
    ...(running && id !== 'finder'
      ? [
          { label: 'Hide', action: () => ws.hideApp(id) } as MenuItem,
          { label: 'Quit', action: () => void ws.quitApp(id) } as MenuItem,
          { label: 'Force Quit', danger: true, action: () => void ws.quitApp(id, true) } as MenuItem,
        ]
      : [{ label: 'Open', action: () => openApp(id) } as MenuItem]),
    ...(!running && inDock && id !== 'finder' ? [{ label: 'Remove from Dock', action: () => apps.removeFromDock(id) } as MenuItem] : []),
  ];
}

export function Dock({ hidden: forceHidden }: { hidden?: boolean }) {
  const entries = useDockEntries();
  const ds = useSettings((s) => s.dock);
  const mouse = useMotionValue(Infinity);
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; remove: boolean; index: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vertical = ds.position !== 'bottom';
  const base = ds.size;
  const max = ds.magnification ? Math.max(base, ds.magnifySize) : base;
  const contextOpen = useSystem((s) => !!s.contextMenu);
  const fileDrag = useSystem((s) => s.dragOverDock);

  // auto-hide: reveal when the pointer touches the screen edge
  useEffect(() => {
    if (!ds.autohide) return;
    const onMove = (e: PointerEvent) => {
      const p = pt(e);
      const w = window.innerWidth / uiScale();
      const h = window.innerHeight / uiScale();
      const edge = ds.position === 'bottom' ? p.y >= h - 4 : ds.position === 'left' ? p.x <= 3 : p.x >= w - 4;
      if (edge) setRevealed(true);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [ds.autohide, ds.position]);

  const onDragStart = (e: React.PointerEvent, id: string) => {
    const start = pt(e);
    let started = false;
    const onMove = (ev: PointerEvent) => {
      const p = pt(ev);
      if (!started && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
      started = true;
      const r = containerRef.current!.getBoundingClientRect();
      const s = uiScale();
      const off = vertical ? Math.abs(p.x - (ds.position === 'left' ? r.right / s : r.left / s)) : r.top / s - p.y;
      const remove = off > 80;
      // insertion index among pinned apps
      const pinnedIds = useApps.getState().dock;
      let index = pinnedIds.length;
      for (let i = 0; i < pinnedIds.length; i++) {
        const el = dockEls.get(pinnedIds[i]);
        if (!el) continue;
        const er = el.getBoundingClientRect();
        const c = vertical ? (er.top + er.height / 2) / s : (er.left + er.width / 2) / s;
        if ((vertical ? p.y : p.x) < c) {
          index = i;
          break;
        }
      }
      setDrag({ id, x: p.x, y: p.y, remove, index });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag((d) => {
        if (d) {
          const apps = useApps.getState();
          if (d.remove) {
            if (d.id !== 'finder') apps.removeFromDock(d.id);
          } else {
            const cur = apps.dock.indexOf(d.id);
            let to = d.index;
            if (cur !== -1 && cur < to) to -= 1;
            apps.moveInDock(d.id, to);
          }
          // suppress the click that follows a drag
          const stop = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
            window.removeEventListener('click', stop, true);
          };
          window.addEventListener('click', stop, true);
          setTimeout(() => window.removeEventListener('click', stop, true), 50);
        }
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const hidden = forceHidden || (ds.autohide && !revealed && !contextOpen && !drag && !fileDrag);
  const pad = 6;
  const radius = Math.round(base * 0.42 + 6);
  const posStyle: React.CSSProperties =
    ds.position === 'bottom'
      ? { bottom: 6, left: '50%', transform: `translateX(-50%) translateY(${hidden ? base + 30 : 0}px)` }
      : ds.position === 'left'
        ? { left: 6, top: '50%', transform: `translateY(-50%) translateX(${hidden ? -(base + 30) : 0}px)` }
        : { right: 6, top: '50%', transform: `translateY(-50%) translateX(${hidden ? base + 30 : 0}px)` };

  return (
    <>
      <div
        ref={containerRef}
        className="absolute z-[8000]"
        style={{ ...posStyle, transition: 'transform .35s cubic-bezier(.2,.9,.25,1)' }}
        onPointerLeave={() => {
          mouse.set(Infinity);
          if (ds.autohide) setTimeout(() => setRevealed(false), 250);
        }}
      >
        <div
          className={`glass liquid flex ${vertical ? 'flex-col' : 'flex-row'} items-end`}
          style={{ padding: pad, gap: 4, borderRadius: radius, alignItems: vertical ? (ds.position === 'left' ? 'flex-start' : 'flex-end') : 'flex-end' }}
          onPointerMove={(e) => {
            const p = pt(e);
            mouse.set(vertical ? p.y : p.x);
          }}
          onPointerLeave={() => mouse.set(Infinity)}
          onDragOver={(e) => e.preventDefault()}
        >
          {entries.map((en) => (
            <DockItem key={en.id} entry={en} mouse={mouse} base={base} max={max} vertical={vertical} onDragStart={onDragStart} dragging={drag?.id === en.id} />
          ))}
        </div>
      </div>
      {drag && (
        <div className="fixed z-[9600] pointer-events-none" style={{ left: drag.x - base / 2, top: drag.y - base / 2, width: base, height: base, opacity: drag.remove ? 0.6 : 0.95 }}>
          <AppIcon id={drag.id} size={base} />
          {drag.remove && <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 glass-strong rounded-[6px] px-2 text-[11px] whitespace-nowrap">Remove</div>}
        </div>
      )}
    </>
  );
}

export { dndState, dropAt };
