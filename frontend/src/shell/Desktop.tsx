import { useEffect, useMemo, useRef, useState } from 'react';
import { useFs, DESKTOP, importHostFiles } from '../stores/fs';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { focusedWindow, useWindows } from '../stores/windows';
import { FileIcon } from '../icons/FileIcon';
import { pt, deskSize } from '../lib/screen';
import { beginFsDrag } from '../lib/dnd';
import { fileContextItems, getInfo, newTextDocument, pasteInto, TAG_COLORS } from './fileMenu';
import { moveToTrash, openApp, openFile, openSettings, showDesktopToggle } from './actions';
import type { FsNode, MenuItem } from '../types';

const CELL_W = 96;

export function useDesktopLayout(items: FsNode[], iconSize: number, sortBy: string) {
  const cellH = iconSize + 44;
  const ds = deskSize();
  const topPad = 40;
  const rows = Math.max(1, Math.floor((ds.h - topPad - 90) / cellH));
  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'kind') return a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1;
    if (sortBy === 'date') return b.modifiedAt - a.modifiedAt;
    if (sortBy === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
    return a.createdAt - b.createdAt;
  });
  const taken = new Set<string>();
  const pos: Record<string, { x: number; y: number }> = {};
  const slotOf = (i: number) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    return { x: ds.w - 16 - CELL_W * (col + 1), y: topPad + row * cellH };
  };
  if (sortBy === 'none') {
    for (const n of sorted) {
      if (n.deskPos) {
        const x = Math.min(Math.max(0, n.deskPos.x), ds.w - CELL_W);
        const y = Math.min(Math.max(32, n.deskPos.y), ds.h - cellH - 40);
        pos[n.id] = { x, y };
        taken.add(`${Math.round(x / 20)}:${Math.round(y / 20)}`);
      }
    }
  }
  let slot = 0;
  for (const n of sorted) {
    if (pos[n.id]) continue;
    let p = slotOf(slot++);
    // skip slots overlapping manually placed icons
    let guard = 0;
    while (Object.values(pos).some((q) => Math.abs(q.x - p.x) < CELL_W * 0.7 && Math.abs(q.y - p.y) < cellH * 0.7) && guard++ < 400) p = slotOf(slot++);
    pos[n.id] = p;
  }
  return { pos, cellH };
}

export function Desktop() {
  const nodes = useFs((s) => s.nodes);
  const showItems = useSettings((s) => s.desktop.showItems);
  const iconSize = useSettings((s) => s.desktop.iconSize);
  const sortBy = useSettings((s) => s.desktop.sortBy);
  const clickReveal = useSettings((s) => s.desktop.clickWallpaperToReveal);
  const showExt = useSettings((s) => s.finder.showExtensions);
  const selected = useSystem((s) => s.desktopSelection);
  const setSel = (ids: string[]) => useSystem.getState().set({ desktopSelection: ids });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dropHover, setDropHover] = useState(false);
  const lastClick = useRef<{ id: string; t: number } | null>(null);
  const items = useMemo(() => Object.values(nodes).filter((n) => n.parentId === DESKTOP && !n.trashed), [nodes]);
  const { pos, cellH } = useDesktopLayout(items, iconSize, sortBy);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,[contenteditable="true"]')) return;
      const focusedWin = !!focusedWindow();
      const sel = useSystem.getState().desktopSelection;
      if (focusedWin || !sel.length) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        setRenaming(sel[0]);
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        const ql = useSystem.getState().quickLook;
        useSystem.getState().set({ quickLook: ql ? null : sel[0] });
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        void moveToTrash(sel);
        setSel([]);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        sel.forEach((id) => openFile(id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onBgPointerDown = (e: React.PointerEvent) => {
    useWindows.getState().activate('finder'); // clicking the desktop makes Finder frontmost
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-desk-icon]')) return;
    useSystem.getState().closeOverlays();
    const p0 = pt(e);
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) setSel([]);
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const p = pt(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      moved = true;
      const b = { x0: p0.x, y0: p0.y, x1: p.x, y1: p.y };
      setBand(b);
      const minX = Math.min(b.x0, b.x1);
      const maxX = Math.max(b.x0, b.x1);
      const minY = Math.min(b.y0, b.y1);
      const maxY = Math.max(b.y0, b.y1);
      const hit = items.filter((n) => {
        const q = pos[n.id];
        return q && q.x + CELL_W > minX && q.x < maxX && q.y + cellH > minY && q.y < maxY;
      });
      setSel(hit.map((n) => n.id));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setBand(null);
      if (!moved && clickReveal) showDesktopToggle();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onIconPointerDown = (e: React.PointerEvent, n: FsNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useSystem.getState().closeOverlays();
    let sel = selected;
    if (e.metaKey || e.ctrlKey) sel = selected.includes(n.id) ? selected.filter((x) => x !== n.id) : [...selected, n.id];
    else if (!selected.includes(n.id)) sel = [n.id];
    setSel(sel);
    const start = pt(e);
    const ids = sel.includes(n.id) ? sel : [n.id];
    beginFsDrag(
      e,
      ids,
      (r) => {
        if (r.kind === 'desktop' && !r.copy) {
          const dx = r.x - start.x;
          const dy = r.y - start.y;
          const fs = useFs.getState();
          ids.forEach((id) => {
            const q = pos[id];
            if (!q) return;
            fs.setDeskPos(id, { x: Math.round((q.x + dx) / 10) * 10, y: Math.round((q.y + dy) / 10) * 10 });
          });
          if (useSettings.getState().desktop.sortBy !== 'none') useSettings.getState().patch('desktop', { sortBy: 'none' });
        }
      },
      { internalDesktop: true },
    );
  };

  const onIconClick = (e: React.MouseEvent, n: FsNode) => {
    const now = Date.now();
    const dbl = useSettings.getState().pointer.doubleClickMs;
    if (lastClick.current && lastClick.current.id === n.id && now - lastClick.current.t < dbl) {
      lastClick.current = null;
      openFile(n.id);
      return;
    }
    lastClick.current = { id: n.id, t: now };
    void e;
  };

  const bgContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if ((e.target as HTMLElement).closest('[data-desk-icon]')) return;
    setSel([]);
    const fs = useFs.getState();
    const clip = useSystem.getState().fsClipboard;
    const at = pt(e);
    const menu: MenuItem[] = [
      {
        label: 'New Folder',
        action: async () => {
          const f = await fs.createFolder(DESKTOP);
          fs.setDeskPos(f.id, { x: at.x - 40, y: at.y - 20 });
          setSel([f.id]);
          setRenaming(f.id);
        },
      },
      {
        label: 'New Text Document',
        action: async () => {
          const f = await newTextDocument(DESKTOP);
          if (f) fs.setDeskPos(f.id, { x: at.x - 40, y: at.y - 20 });
        },
      },
      { separator: true },
      { label: 'Paste Item', disabled: !clip, action: () => void pasteInto(DESKTOP) },
      { label: 'Import Files from Computer…', action: () => pickHostFiles() },
      { separator: true },
      { label: 'Change Wallpaper…', action: () => openSettings('wallpaper') },
      { label: 'Edit Widgets…', action: () => useSystem.getState().set({ notificationCenter: true }) },
      { separator: true },
      {
        label: 'Sort By',
        submenu: (['none', 'name', 'kind', 'date'] as const).map((k) => ({
          label: k === 'none' ? 'None' : k === 'date' ? 'Date Modified' : k[0].toUpperCase() + k.slice(1),
          checked: useSettings.getState().desktop.sortBy === k,
          action: () => useSettings.getState().patch('desktop', { sortBy: k }),
        })),
      },
      { label: 'Clean Up', action: () => items.forEach((n) => fs.setDeskPos(n.id, undefined)) },
      { label: 'Show View Options', action: () => openSettings('desktop') },
    ];
    useSystem.getState().openContextMenu({ clientX: at.x, clientY: at.y }, menu);
  };

  const pickHostFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) void importHostFiles(input.files, DESKTOP).then((f) => useSystem.getState().showToast(`Imported ${f.length} item${f.length === 1 ? '' : 's'} to the Desktop.`));
    };
    input.click();
  };

  const iconContext = (e: React.MouseEvent, n: FsNode) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = selected.includes(n.id) ? selected : [n.id];
    if (!selected.includes(n.id)) setSel([n.id]);
    const p = pt(e);
    useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, fileContextItems(ids, { folderId: DESKTOP, onRename: setRenaming }));
  };

  return (
    <div
      className="absolute inset-0"
      data-drop-desktop
      data-drop-folder-desktop={DESKTOP}
      onPointerDown={onBgPointerDown}
      onContextMenu={bgContext}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropHover(true);
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        if (!e.dataTransfer.files.length) return;
        const at = pt(e);
        void importHostFiles(e.dataTransfer.files, DESKTOP).then((created) => {
          created.forEach((f, i) => useFs.getState().setDeskPos(f.id, { x: at.x - 40 - i * 12, y: at.y - 30 + i * 12 }));
        });
      }}
    >
      {dropHover && <div className="absolute inset-[6px] rounded-[18px] pointer-events-none" style={{ boxShadow: 'inset 0 0 0 3px var(--accent)' }} />}
      {showItems &&
        items.map((n) => {
          const q = pos[n.id];
          if (!q) return null;
          const isSel = selected.includes(n.id);
          const display = showExt || n.kind === 'folder' ? n.name : n.name.replace(/\.(txt|md|jpg|jpeg|png)$/i, '');
          const tag = n.tags?.[0] ? TAG_COLORS.find((t) => t.name === n.tags![0])?.color : undefined;
          return (
            <div
              key={n.id}
              data-desk-icon
              {...(n.kind === 'folder' ? { 'data-drop-folder': n.id } : {})}
              className="absolute flex flex-col items-center gap-[3px] text-center"
              style={{ left: q.x, top: q.y, width: CELL_W }}
              onPointerDown={(e) => onIconPointerDown(e, n)}
              onClick={(e) => onIconClick(e, n)}
              onContextMenu={(e) => iconContext(e, n)}
            >
              <div className="rounded-[6px] p-[3px] desk-ico-wrap" style={{ background: isSel ? 'rgba(0,0,0,.28)' : undefined, boxShadow: isSel ? 'inset 0 0 0 1px rgba(255,255,255,.35)' : undefined }}>
                <FileIcon node={n} size={iconSize} />
              </div>
              {renaming === n.id ? (
                <RenameField
                  node={n}
                  onDone={() => setRenaming(null)}
                />
              ) : (
                <div
                  className="text-[12px] leading-[1.25] px-[5px] py-[1px] rounded-[4px] max-w-full break-words font-medium"
                  style={{ color: '#fff', textShadow: isSel ? 'none' : '0 1px 2px rgba(0,0,0,.75), 0 0 1px rgba(0,0,0,.6)', background: isSel ? 'var(--accent)' : undefined, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!n.system) setRenaming(n.id);
                  }}
                >
                  {tag && <span className="inline-block w-[8px] h-[8px] rounded-full mr-[4px] align-middle" style={{ background: tag }} />}
                  {display}
                </div>
              )}
            </div>
          );
        })}
      {band && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(band.x0, band.x1),
            top: Math.min(band.y0, band.y1),
            width: Math.abs(band.x1 - band.x0),
            height: Math.abs(band.y1 - band.y0),
            background: 'rgba(255,255,255,.14)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.6)',
          }}
        />
      )}
    </div>
  );
}

export function RenameField({ node, onDone, className = '' }: { node: FsNode; onDone: () => void; className?: string }) {
  const [v, setV] = useState(node.name);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    const dot = node.kind === 'file' ? node.name.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : node.name.length);
  }, [node]);
  const commit = () => {
    void useFs.getState().rename(node.id, v);
    onDone();
  };
  return (
    <textarea
      ref={ref}
      rows={2}
      className={`text-[12px] text-center rounded-[4px] border-0 px-1 resize-none w-full ${className}`}
      style={{ background: 'var(--bg)', color: 'var(--text)', boxShadow: '0 0 0 2px var(--accent)', outline: 'none' }}
      value={v}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') onDone();
      }}
    />
  );
}

export { openApp, getInfo };
