import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Columns3, Clock, AppWindow, Monitor, FileText, Download, Image as ImageIcon, Music2, Film, Home, HardDrive, Trash2, Ellipsis, Share, Tag, ArrowUpDown, FolderPlus, ChevronRight as Chev,
} from 'lucide-react';
import type { AppProps, FsNode, MenuItem } from '../../types';
import { TitleBar, useMenus, useWindowTitle, useWindow } from '../../shell/windowContext';
import { useFs, pathOf, ROOT, HOME, DESKTOP, DOCUMENTS, DOWNLOADS, PICTURES, MUSIC, MOVIES, APPLICATIONS, TRASH, importHostFiles, folderSize, trashItems } from '../../stores/fs';
import { useSettings } from '../../stores/settings';
import { useSystem } from '../../stores/system';
import { useApps, launchableApps } from '../../stores/apps';
import { useWindows } from '../../stores/windows';
import { FileIcon } from '../../icons/FileIcon';
import { SearchField, Segmented, EmptyState } from '../../components/ui';
import { finderDate, formatBytes, kindOf } from '../../lib/format';
import { beginFsDrag } from '../../lib/dnd';
import { fileContextItems, getInfo, newTextDocument, pasteInto, TAG_COLORS, downloadNode } from '../../shell/fileMenu';
import { emptyTrash, moveToTrash, openApp, openFile } from '../../shell/actions';
import { RenameField } from '../../shell/Desktop';
import { getApp } from '../../lib/appRegistry';
import { uninstallApp } from '../../shell/Launchpad';
import { pt } from '../../lib/screen';
import { importFromComputer } from '../../lib/hostAccess';

type View = 'icons' | 'list' | 'columns';
type SortKey = 'name' | 'date' | 'size' | 'kind';

const SPECIAL_NAMES: Record<string, string> = { recents: 'Recents', [TRASH]: 'Trash', [APPLICATIONS]: 'Applications', search: 'Searching' };

function sidebarItems(accountName: string) {
  return [
    { heading: 'Favorites' },
    { id: 'recents', label: 'Recents', icon: <Clock size={16} />, key: 'recents' },
    { id: APPLICATIONS, label: 'Applications', icon: <AppWindow size={16} />, key: 'applications' },
    { id: DESKTOP, label: 'Desktop', icon: <Monitor size={16} />, key: 'desktop' },
    { id: DOCUMENTS, label: 'Documents', icon: <FileText size={16} />, key: 'documents' },
    { id: DOWNLOADS, label: 'Downloads', icon: <Download size={16} />, key: 'downloads' },
    { id: PICTURES, label: 'Pictures', icon: <ImageIcon size={16} />, key: 'pictures' },
    { id: MUSIC, label: 'Music', icon: <Music2 size={16} />, key: 'music' },
    { id: MOVIES, label: 'Movies', icon: <Film size={16} />, key: 'movies' },
    { id: HOME, label: accountName, icon: <Home size={16} />, key: 'home' },
    { heading: 'Locations' },
    { id: ROOT, label: 'Golden Gate HD', icon: <HardDrive size={16} />, key: 'disk' },
    { id: TRASH, label: 'Trash', icon: <Trash2 size={16} />, key: 'trash' },
  ] as ({ heading: string } | { id: string; label: string; icon: React.ReactNode; key: string })[];
}

export default function Finder({ win }: AppProps) {
  const { focused } = useWindow();
  const nodes = useFs((s) => s.nodes);
  const fs = useFs.getState();
  const settings = useSettings((s) => s.finder);
  const patch = useSettings((s) => s.patch);
  const acct = useSettings((s) => s.user.accountName);
  const apps = useApps();
  const start = (win.args?.folderId as string) || HOME;
  const [history, setHistory] = useState<string[]>([start]);
  const [hIndex, setHIndex] = useState(0);
  const loc = history[hIndex];
  const [view, setView] = useState<View>(settings.defaultView);
  const [sel, setSel] = useState<string[]>(win.args?.select ? [`app:${win.args.select}`] : []);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastClick = useRef<{ id: string; t: number } | null>(null);

  // respond to "open this folder" requests on an existing window
  useEffect(() => {
    const f = win.args?.folderId as string | undefined;
    if (f && f !== loc) go(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const go = (id: string) => {
    const h = [...history.slice(0, hIndex + 1), id];
    setHistory(h);
    setHIndex(h.length - 1);
    setSel([]);
    setQuery('');
  };
  const back = () => hIndex > 0 && (setHIndex(hIndex - 1), setSel([]));
  const forward = () => hIndex < history.length - 1 && (setHIndex(hIndex + 1), setSel([]));
  const parent = () => {
    const p = nodes[loc]?.parentId;
    if (p) go(p);
  };

  const locName = SPECIAL_NAMES[loc] ?? (loc.startsWith('tag:') ? loc.slice(4) : nodes[loc]?.name ?? 'Finder');
  useWindowTitle(query ? `Searching “${query}”` : locName);

  const appItems = useMemo<FsNode[]>(
    () =>
      launchableApps(apps).map((a) => ({
        id: `app:${a.id}`,
        appId: a.id,
        parentId: APPLICATIONS,
        name: a.name,
        kind: 'file' as const,
        mime: 'application/x-gg-app',
        size: (a.store?.sizeMB ?? 30) * 1e6,
        createdAt: 0,
        modifiedAt: 0,
        trashed: false,
      })),
    [apps],
  );

  const items = useMemo(() => {
    let list: FsNode[];
    if (query) {
      const q = query.toLowerCase();
      list = Object.values(nodes).filter((n) => !n.trashed && n.parentId && n.name.toLowerCase().includes(q));
      list = [...list, ...appItems.filter((a) => a.name.toLowerCase().includes(q))];
    } else if (loc === 'recents') list = Object.values(nodes).filter((n) => n.kind === 'file' && !n.trashed).sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 60);
    else if (loc === APPLICATIONS) list = appItems;
    else if (loc === TRASH) list = trashItems(nodes);
    else if (loc.startsWith('tag:')) list = Object.values(nodes).filter((n) => !n.trashed && n.tags?.includes(loc.slice(4)));
    else list = Object.values(nodes).filter((n) => n.parentId === loc && !n.trashed);
    if (loc === 'recents' && !query) return list;
    const dir = sort.dir;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'date':
          return (a.modifiedAt - b.modifiedAt) * dir;
        case 'size':
          return (a.size - b.size) * dir;
        case 'kind':
          return kindOf(a.mime, a.name).localeCompare(kindOf(b.mime, b.name)) * dir;
        default:
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * dir;
      }
    });
  }, [nodes, loc, query, sort, appItems]);

  const isVirtual = loc === 'recents' || loc === APPLICATIONS || loc === TRASH || loc.startsWith('tag:') || !!query;
  const dropTarget = isVirtual ? null : loc;
  const inTrash = loc === TRASH;

  const open = (n: FsNode) => {
    if (n.appId) return openApp(n.appId);
    if (n.trashed) return useSystem.getState().set({ quickLook: n.id });
    if (n.kind === 'folder') {
      if (view === 'columns') return;
      return go(n.id);
    }
    openFile(n.id);
  };

  const selectedNodes = sel.map((id) => nodes[id] ?? appItems.find((a) => a.id === id)).filter(Boolean) as FsNode[];
  const realSel = selectedNodes.filter((n) => !n.appId).map((n) => n.id);

  const newFolder = async () => {
    if (!dropTarget) return;
    const f = await fs.createFolder(dropTarget);
    setSel([f.id]);
    setRenaming(f.id);
  };

  const trashSelected = () => {
    if (inTrash) return;
    const appSel = selectedNodes.filter((n) => n.appId);
    if (appSel.length) {
      const def = getApp(appSel[0].appId!);
      if (def && !def.system) void uninstallApp(def);
      else useSystem.getState().showToast('System apps can’t be deleted.');
      return;
    }
    if (realSel.length) {
      void moveToTrash(realSel);
      setSel([]);
    }
  };

  useMenus(
    [
      {
        title: 'File',
        items: [
          { label: 'New Finder Window', shortcut: 'mod+n', action: () => openApp('finder', { folderId: HOME }, { forceNew: true }) },
          { label: 'New Folder', shortcut: 'mod+shift+n', disabled: !dropTarget, action: () => void newFolder() },
          { label: 'New Text Document', disabled: !dropTarget, action: () => void (dropTarget && newTextDocument(dropTarget)) },
          { separator: true },
          { label: 'Open', shortcut: 'mod+o', disabled: !sel.length, action: () => selectedNodes.forEach(open) },
          { label: 'Import from Your Computer…', disabled: !dropTarget, action: () => pickFiles() },
          { label: 'Export to Your Computer…', disabled: realSel.length !== 1 || nodes[realSel[0]]?.kind !== 'file', action: () => void downloadNode(realSel[0]) },
          { separator: true },
          { label: 'Get Info', shortcut: 'mod+i', disabled: !realSel.length, action: () => realSel.forEach(getInfo) },
          { label: 'Duplicate', shortcut: 'mod+d', disabled: !realSel.length || !dropTarget, action: () => void fs.copy(realSel, dropTarget!) },
          { label: 'Quick Look', shortcut: 'space', disabled: !realSel.length, action: () => useSystem.getState().set({ quickLook: realSel[0] }) },
          { separator: true },
          { label: 'Move to Trash', shortcut: 'mod+backspace', disabled: !sel.length || inTrash, action: trashSelected },
          ...(inTrash ? [{ label: 'Put Back', disabled: !realSel.length, action: () => void fs.restore(realSel) } as MenuItem, { label: 'Empty Trash…', action: () => void emptyTrash() } as MenuItem] : []),
        ],
      },
      {
        title: 'Edit',
        items: [
          { label: 'Copy', shortcut: 'mod+c', disabled: !realSel.length, action: () => useSystem.getState().set({ fsClipboard: { ids: realSel, mode: 'copy' } }) },
          { label: 'Cut', shortcut: 'mod+x', disabled: !realSel.length, action: () => useSystem.getState().set({ fsClipboard: { ids: realSel, mode: 'cut' } }) },
          { label: 'Paste Item', shortcut: 'mod+v', disabled: !useSystem.getState().fsClipboard || !dropTarget, action: () => dropTarget && void pasteInto(dropTarget) },
          { label: 'Select All', shortcut: 'mod+a', action: () => setSel(items.map((n) => n.id)) },
          { separator: true },
          { label: 'Find', shortcut: 'mod+f', action: () => searchRef.current?.focus() },
        ],
      },
      {
        title: 'View',
        items: [
          { label: 'as Icons', shortcut: 'mod+1', checked: view === 'icons', action: () => setView('icons') },
          { label: 'as List', shortcut: 'mod+2', checked: view === 'list', action: () => setView('list') },
          { label: 'as Columns', shortcut: 'mod+3', checked: view === 'columns', action: () => setView('columns') },
          { separator: true },
          { label: settings.showPathBar ? 'Hide Path Bar' : 'Show Path Bar', shortcut: 'mod+alt+p', action: () => patch('finder', { showPathBar: !settings.showPathBar }) },
          { label: settings.showStatusBar ? 'Hide Status Bar' : 'Show Status Bar', shortcut: 'mod+/', action: () => patch('finder', { showStatusBar: !settings.showStatusBar }) },
          { separator: true },
          { label: 'Sort By', submenu: (['name', 'kind', 'date', 'size'] as SortKey[]).map((k) => ({ label: k === 'date' ? 'Date Modified' : k[0].toUpperCase() + k.slice(1), checked: sort.key === k, action: () => setSort({ key: k, dir: 1 }) })) },
          { label: settings.showExtensions ? 'Hide Filename Extensions' : 'Show Filename Extensions', action: () => patch('finder', { showExtensions: !settings.showExtensions }) },
        ],
      },
      {
        title: 'Go',
        items: [
          { label: 'Back', shortcut: 'mod+[', disabled: hIndex === 0, action: back },
          { label: 'Forward', shortcut: 'mod+]', disabled: hIndex >= history.length - 1, action: forward },
          { label: 'Enclosing Folder', shortcut: 'mod+arrowup', disabled: !nodes[loc]?.parentId, action: parent },
          { separator: true },
          { label: 'Recents', shortcut: 'mod+shift+f', action: () => go('recents') },
          { label: 'Documents', shortcut: 'mod+shift+o', action: () => go(DOCUMENTS) },
          { label: 'Desktop', shortcut: 'mod+shift+d', action: () => go(DESKTOP) },
          { label: 'Downloads', shortcut: 'mod+alt+l', action: () => go(DOWNLOADS) },
          { label: 'Home', shortcut: 'mod+shift+h', action: () => go(HOME) },
          { label: 'Computer', shortcut: 'mod+shift+c', action: () => go(ROOT) },
          { label: 'Applications', shortcut: 'mod+shift+a', action: () => go(APPLICATIONS) },
        ],
      },
    ],
    [sel, loc, view, sort, items.length, hIndex, history.length, settings, inTrash, dropTarget],
  );

  // keyboard handling inside the window
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,[contenteditable="true"]')) return;
      if (useSystem.getState().dialogs.length || useSystem.getState().spotlight) return;
      if (e.key === 'Enter' && sel.length === 1 && !nodes[sel[0]]?.system && nodes[sel[0]]) {
        e.preventDefault();
        setRenaming(sel[0]);
      } else if (e.key === ' ' && realSel.length) {
        e.preventDefault();
        const ql = useSystem.getState().quickLook;
        useSystem.getState().set({ quickLook: ql ? null : realSel[0] });
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown' && selectedNodes[0]) {
        e.preventDefault();
        open(selectedNodes[0]);
      } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key) && !e.metaKey && !e.ctrlKey && items.length) {
        e.preventDefault();
        const idx = items.findIndex((n) => n.id === sel[sel.length - 1]);
        const cols = view === 'icons' ? Math.max(1, Math.floor((contentRef.current?.clientWidth ?? 600) / 104)) : 1;
        let next = idx;
        if (e.key === 'ArrowRight') next = view === 'icons' ? idx + 1 : idx;
        if (e.key === 'ArrowLeft') next = view === 'icons' ? idx - 1 : idx;
        if (e.key === 'ArrowDown') next = idx + cols;
        if (e.key === 'ArrowUp') next = idx - cols;
        if (idx === -1) next = 0;
        next = Math.max(0, Math.min(items.length - 1, next));
        setSel([items[next].id]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickFiles = () => {
    if (!dropTarget) return;
    void importFromComputer(dropTarget).then((c) => setSel(c.map((n) => n.id)));
  };

  const itemPointerDown = (e: React.PointerEvent, n: FsNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    let next = sel;
    if (e.metaKey || e.ctrlKey) next = sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id];
    else if (e.shiftKey && sel.length) {
      const a = items.findIndex((x) => x.id === sel[0]);
      const b = items.findIndex((x) => x.id === n.id);
      next = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
    } else if (!sel.includes(n.id)) next = [n.id];
    setSel(next);
    if (n.appId || renaming) return;
    const ids = (next.includes(n.id) ? next : [n.id]).filter((id) => !id.startsWith('app:'));
    beginFsDrag(e, ids);
  };

  const itemClick = (n: FsNode) => {
    const now = Date.now();
    if (lastClick.current?.id === n.id && now - lastClick.current.t < useSettings.getState().pointer.doubleClickMs) {
      lastClick.current = null;
      open(n);
    } else lastClick.current = { id: n.id, t: now };
  };

  const itemContext = (e: React.MouseEvent, n: FsNode) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = sel.includes(n.id) ? sel : [n.id];
    if (!sel.includes(n.id)) setSel([n.id]);
    const p = pt(e);
    if (n.appId) {
      const def = getApp(n.appId);
      useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
        { label: 'Open', action: () => openApp(n.appId!) },
        { label: 'Show in App Store', action: () => openApp('appstore', { appId: n.appId }) },
        { separator: true },
        { label: 'Keep in Dock', checked: useApps.getState().dock.includes(n.appId), action: () => (useApps.getState().dock.includes(n.appId!) ? useApps.getState().removeFromDock(n.appId!) : useApps.getState().addToDock(n.appId!)) },
        { separator: true },
        { label: 'Move to Trash', disabled: !!def?.system, action: () => def && void uninstallApp(def) },
      ]);
      return;
    }
    useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, fileContextItems(ids.filter((x) => !x.startsWith('app:')), { folderId: dropTarget ?? nodes[n.id]?.parentId ?? HOME, onRename: setRenaming, inTrash: n.trashed }));
  };

  const bgContext = (e: React.MouseEvent) => {
    e.preventDefault();
    setSel([]);
    const p = pt(e);
    const items: MenuItem[] = inTrash
      ? [{ label: 'Empty Trash…', action: () => void emptyTrash() }]
      : dropTarget
        ? [
            { label: 'New Folder', action: () => void newFolder() },
            { label: 'New Text Document', action: () => void newTextDocument(dropTarget) },
            { separator: true },
            { label: 'Get Info', action: () => getInfo(dropTarget) },
            { label: 'Import from Your Computer…', action: pickFiles },
            { separator: true },
            { label: 'Paste Item', disabled: !useSystem.getState().fsClipboard, action: () => void pasteInto(dropTarget) },
            { separator: true },
            { label: 'View', submenu: (['icons', 'list', 'columns'] as View[]).map((v) => ({ label: `as ${v[0].toUpperCase()}${v.slice(1)}`, checked: view === v, action: () => setView(v) })) },
            { label: 'Sort By', submenu: (['name', 'kind', 'date', 'size'] as SortKey[]).map((k) => ({ label: k === 'date' ? 'Date Modified' : k[0].toUpperCase() + k.slice(1), checked: sort.key === k, action: () => setSort({ key: k, dir: 1 }) })) },
          ]
        : [{ label: 'View', submenu: (['icons', 'list', 'columns'] as View[]).map((v) => ({ label: `as ${v}`, checked: view === v, action: () => setView(v) })) }];
    useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, items);
  };

  const bgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || view !== 'icons') {
      if (e.button === 0) setSel([]);
      return;
    }
    const host = contentRef.current!;
    const r = host.getBoundingClientRect();
    const scale = r.width / host.offsetWidth || 1;
    const toLocal = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - r.left) / scale + host.scrollLeft, y: (ev.clientY - r.top) / scale + host.scrollTop });
    const p0 = toLocal(e);
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) setSel([]);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toLocal(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      moved = true;
      setBand({ x0: p0.x, y0: p0.y, x1: p.x, y1: p.y });
      const minX = Math.min(p0.x, p.x), maxX = Math.max(p0.x, p.x), minY = Math.min(p0.y, p.y), maxY = Math.max(p0.y, p.y);
      const hits: string[] = [];
      host.querySelectorAll<HTMLElement>('[data-item-id]').forEach((el) => {
        const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
        if (x + w > minX && x < maxX && y + h > minY && y < maxY) hits.push(el.dataset.itemId!);
      });
      setSel(hits);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBand(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const displayName = (n: FsNode) => (settings.showExtensions || n.kind === 'folder' || n.appId ? n.name : n.name.replace(/\.(txt|md|jpg|jpeg|png|rtf)$/i, ''));
  const tagDot = (n: FsNode) =>
    n.tags?.length ? (
      <span className="inline-flex -space-x-[3px] mr-1 align-middle">
        {n.tags.map((t) => (
          <span key={t} className="w-[8px] h-[8px] rounded-full inline-block" style={{ background: TAG_COLORS.find((c) => c.name === t)?.color, boxShadow: '0 0 0 1px var(--bg)' }} />
        ))}
      </span>
    ) : null;

  const path = useMemo(() => (nodes[loc] ? pathOf(nodes, loc) : []), [nodes, loc]);
  const sb = sidebarItems(acct);
  const sbVisible = useSettings((s) => s.finder.sidebarItems);
  const sbSize = useSettings((s) => s.sidebarIconSize);
  const freeSpace = useFreeSpace();

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="w-[190px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} className="!h-[52px]" />
        <div className="scroll flex-1 px-[10px] pb-3" style={{ fontSize: sbSize === 'large' ? 14 : sbSize === 'small' ? 12 : 13 }}>
          {sb.map((it, i) =>
            'heading' in it ? (
              <div key={i} className="sb-heading">
                {it.heading}
              </div>
            ) : sbVisible[it.key] === false ? null : (
              <div
                key={it.id}
                className={`sb-item accent ${loc === it.id && !query ? 'active' : ''}`}
                {...(it.id === TRASH ? { 'data-drop-trash': '1' } : it.id !== 'recents' && it.id !== APPLICATIONS ? { 'data-drop-folder': it.id } : {})}
                onClick={() => go(it.id)}
              >
                <span className="sb-ico">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </div>
            ),
          )}
          {sbVisible.tags !== false && (
            <>
              <div className="sb-heading">Tags</div>
              {TAG_COLORS.map((t) => (
                <div key={t.name} className={`sb-item accent ${loc === `tag:${t.name}` ? 'active' : ''}`} onClick={() => go(`tag:${t.name}`)}>
                  <span className="sb-ico">
                    <span className="w-[10px] h-[10px] rounded-full" style={{ background: t.color }} />
                  </span>
                  {t.name}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="chrome hairline-b !gap-2" style={{ paddingLeft: 10 }}>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Back" disabled={hIndex === 0} onClick={back}>
              <ChevronLeft size={17} />
            </button>
            <button className="tb-btn" aria-label="Forward" disabled={hIndex >= history.length - 1} onClick={forward}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="font-semibold text-[14px] truncate min-w-0 flex-1 toolbar-dim">{query ? `Searching “${query}”` : locName}</div>
          <div className="tb-group" data-no-drag>
            {([
              ['icons', <LayoutGrid size={15} key="i" />, 'Icon view'],
              ['list', <List size={16} key="l" />, 'List view'],
              ['columns', <Columns3 size={15} key="c" />, 'Column view'],
            ] as const).map(([v, ic, label]) => (
              <button key={v} aria-label={label} className={`tb-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {ic}
              </button>
            ))}
          </div>
          <div className="tb-group" data-no-drag>
            <button
              className="tb-btn"
              aria-label="Sort"
              onClick={(e) => {
                const p = pt(e);
                useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y + 14 }, (['name', 'kind', 'date', 'size'] as SortKey[]).map((k) => ({ label: k === 'date' ? 'Date Modified' : k[0].toUpperCase() + k.slice(1), checked: sort.key === k, action: () => setSort({ key: k, dir: 1 }) })));
              }}
            >
              <ArrowUpDown size={15} />
            </button>
            <button className="tb-btn" aria-label="Export" disabled={realSel.length !== 1 || nodes[realSel[0]]?.kind !== 'file'} onClick={() => void downloadNode(realSel[0])}>
              <Share size={15} />
            </button>
            <button
              className="tb-btn"
              aria-label="Tags"
              disabled={!realSel.length}
              onClick={(e) => {
                const p = pt(e);
                useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y + 14 }, TAG_COLORS.map((t) => ({ label: t.name, icon: <span style={{ width: 10, height: 10, borderRadius: 5, background: t.color, display: 'inline-block' }} />, checked: !!nodes[realSel[0]]?.tags?.includes(t.name), action: () => realSel.forEach((id) => { const tags = useFs.getState().nodes[id]?.tags ?? []; fs.setTags(id, tags.includes(t.name) ? tags.filter((x) => x !== t.name) : [...tags, t.name]); }) })));
              }}
            >
              <Tag size={15} />
            </button>
            <button
              className="tb-btn"
              aria-label="More actions"
              onClick={(e) => {
                const p = pt(e);
                if (realSel.length) useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y + 14 }, fileContextItems(realSel, { folderId: dropTarget ?? HOME, onRename: setRenaming, inTrash }));
                else bgContext(e);
              }}
            >
              <Ellipsis size={16} />
            </button>
          </div>
          {dropTarget && (
            <div className="tb-group" data-no-drag>
              <button className="tb-btn" aria-label="New Folder" onClick={() => void newFolder()}>
                <FolderPlus size={15} />
              </button>
            </div>
          )}
          <SearchField ref={searchRef} width={170} value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} aria-label="Search files" />
        </TitleBar>

        {inTrash && (
          <div className="h-[38px] flex items-center px-4 gap-3 hairline-b text-[12px] muted">
            <span className="flex-1">Items in the Trash are kept until you empty it.</span>
            <button className="btn" disabled={!items.length} onClick={() => void emptyTrash()}>
              Empty
            </button>
          </div>
        )}

        <div
          ref={contentRef}
          className="flex-1 min-h-0 relative scroll"
          {...(dropTarget ? { 'data-drop-folder': dropTarget } : {})}
          onPointerDown={bgPointerDown}
          onContextMenu={bgContext}
          onDragOver={(e) => {
            if (dropTarget && e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDropHover(true);
            }
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropHover(false);
            if (dropTarget && e.dataTransfer.files.length) void importHostFiles(e.dataTransfer.files, dropTarget).then((c) => setSel(c.map((n) => n.id)));
          }}
          style={{ boxShadow: dropHover ? 'inset 0 0 0 3px var(--accent)' : undefined }}
        >
          {items.length === 0 && view !== 'columns' && (
            <EmptyState
              title={query ? 'No Results' : inTrash ? 'Trash is Empty' : 'This folder is empty'}
              subtitle={query ? 'Try a different search.' : dropTarget ? 'Drag files here from your computer, or use File ▸ Import.' : undefined}
            />
          )}

          {view === 'icons' && (
            <div className="grid p-3 gap-y-1 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
              {items.map((n) => {
                const isSel = sel.includes(n.id);
                return (
                  <div
                    key={n.id}
                    data-item-id={n.id}
                    {...(n.kind === 'folder' && !n.trashed ? { 'data-drop-folder': n.id } : {})}
                    className="flex flex-col items-center gap-1 p-1 rounded-[8px] text-center"
                    onPointerDown={(e) => itemPointerDown(e, n)}
                    onClick={() => itemClick(n)}
                    onContextMenu={(e) => itemContext(e, n)}
                  >
                    <div className="rounded-[7px] p-[4px]" style={{ background: isSel ? 'var(--press)' : undefined }}>
                      <FileIcon node={n} size={64} />
                    </div>
                    {renaming === n.id ? (
                      <RenameField node={n} onDone={() => setRenaming(null)} />
                    ) : (
                      <div
                        className="text-[12px] leading-[1.25] px-[5px] rounded-[4px] max-w-full break-words"
                        style={{ background: isSel ? (focused ? 'var(--accent)' : 'var(--press)') : undefined, color: isSel && focused ? '#fff' : undefined, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {tagDot(n)}
                        {displayName(n)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === 'list' && items.length > 0 && (
            <div className="min-w-[560px]">
              <div className="flex h-[28px] items-center px-3 text-[11.5px] font-medium hairline-b sticky top-0 z-10" style={{ background: 'var(--bg)', color: 'var(--text-2)' }}>
                {([
                  ['name', 'Name', 'flex-1'],
                  ['date', 'Date Modified', 'w-[200px]'],
                  ['size', 'Size', 'w-[90px] text-right'],
                  ['kind', 'Kind', 'w-[150px] pl-4'],
                ] as const).map(([k, l, cls]) => (
                  <button key={k} className={`${cls} border-0 bg-transparent text-left p-0 flex items-center gap-1 ${cls.includes('right') ? 'justify-end' : ''}`} style={{ color: sort.key === k ? 'var(--text)' : undefined }} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                    {l}
                    {sort.key === k && <span className="text-[9px]">{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                ))}
              </div>
              <div className="px-[6px] py-1">
                {items.map((n, i) => {
                  const isSel = sel.includes(n.id);
                  return (
                    <div
                      key={n.id}
                      data-item-id={n.id}
                      {...(n.kind === 'folder' && !n.trashed ? { 'data-drop-folder': n.id } : {})}
                      className={`list-row ${i % 2 ? 'alt' : ''} ${isSel ? 'selected' : ''}`}
                      onPointerDown={(e) => itemPointerDown(e, n)}
                      onClick={() => itemClick(n)}
                      onContextMenu={(e) => itemContext(e, n)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <FileIcon node={n} size={18} />
                        {renaming === n.id ? <input autoFocus className="field !h-[20px]" defaultValue={n.name} onPointerDown={(e) => e.stopPropagation()} onBlur={(e) => { void fs.rename(n.id, e.target.value); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} /> : (
                          <span className="truncate">
                            {tagDot(n)}
                            {displayName(n)}
                          </span>
                        )}
                      </div>
                      <div className="w-[200px] truncate text-[12px] opacity-75">{n.appId ? '—' : finderDate(n.modifiedAt)}</div>
                      <div className="w-[90px] text-right text-[12px] opacity-75">{n.kind === 'folder' ? (n.trashed ? '--' : formatBytes(folderSize(nodes, n.id))) : formatBytes(n.size)}</div>
                      <div className="w-[150px] pl-4 truncate text-[12px] opacity-75">{n.appId ? 'Application' : kindOf(n.mime, n.name)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'columns' && <ColumnView loc={isVirtual ? null : loc} items={items} sel={sel} setSel={setSel} onOpen={open} onContext={itemContext} onPointerDown={itemPointerDown} displayName={displayName} />}

          {band && (
            <div
              className="absolute pointer-events-none"
              style={{ left: Math.min(band.x0, band.x1), top: Math.min(band.y0, band.y1), width: Math.abs(band.x1 - band.x0), height: Math.abs(band.y1 - band.y0), background: 'color-mix(in srgb, var(--accent) 14%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)' }}
            />
          )}
        </div>

        {settings.showPathBar && !query && path.length > 0 && (
          <div className="h-[24px] flex items-center px-3 gap-1 hairline-t text-[11.5px] muted overflow-hidden whitespace-nowrap">
            {path.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <Chev size={10} className="opacity-60" />}
                <button className="border-0 bg-transparent p-0 flex items-center gap-1 hover:underline" onClick={() => go(p.id)} data-drop-folder={p.id}>
                  <FileIcon node={p} size={14} />
                  {p.name}
                </button>
              </span>
            ))}
          </div>
        )}
        {settings.showStatusBar && (
          <div className="h-[22px] flex items-center justify-center hairline-t text-[11px] muted">
            {sel.length ? `${sel.length} of ${items.length} selected` : `${items.length} item${items.length === 1 ? '' : 's'}`}
            {freeSpace && `, ${freeSpace} available`}
          </div>
        )}
      </div>
    </div>
  );
}

function useFreeSpace() {
  const [s, setS] = useState<string | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.quota != null && e.usage != null) setS(`${formatBytes(e.quota - e.usage)} (browser storage)`);
    });
  }, []);
  return s;
}

function ColumnView({
  loc, items, sel, setSel, onOpen, onContext, onPointerDown, displayName,
}: {
  loc: string | null;
  items: FsNode[];
  sel: string[];
  setSel: (s: string[]) => void;
  onOpen: (n: FsNode) => void;
  onContext: (e: React.MouseEvent, n: FsNode) => void;
  onPointerDown: (e: React.PointerEvent, n: FsNode) => void;
  displayName: (n: FsNode) => string;
}) {
  const nodes = useFs((s) => s.nodes);
  const { focused } = useWindow();
  const [trail, setTrail] = useState<string[]>([]);
  useEffect(() => setTrail([]), [loc]);
  const columns: { id: string | null; list: FsNode[]; selected?: string }[] = [{ id: loc, list: items, selected: trail[0] }];
  trail.forEach((id, i) => {
    const n = nodes[id];
    if (n?.kind === 'folder') columns.push({ id, list: Object.values(nodes).filter((c) => c.parentId === id && !c.trashed).sort((a, b) => a.name.localeCompare(b.name)), selected: trail[i + 1] });
  });
  const lastSel = trail[trail.length - 1] ? nodes[trail[trail.length - 1]] : null;
  return (
    <div className="flex h-full min-w-max">
      {columns.map((col, ci) => (
        <div key={`${col.id}-${ci}`} className="w-[230px] flex-none hairline-r scroll py-1 px-[5px]" {...(col.id ? { 'data-drop-folder': col.id } : {})}>
          {col.list.map((n) => {
            const active = col.selected === n.id || (ci === columns.length - 1 && sel.includes(n.id));
            return (
              <div
                key={n.id}
                className="h-[24px] flex items-center gap-[6px] px-2 rounded-[5px]"
                style={{ background: active ? (focused && sel.includes(n.id) ? 'var(--accent)' : 'var(--press)') : undefined, color: active && focused && sel.includes(n.id) ? '#fff' : undefined }}
                {...(n.kind === 'folder' ? { 'data-drop-folder': n.id } : {})}
                onPointerDown={(e) => {
                  onPointerDown(e, n);
                  setTrail([...trail.slice(0, ci), n.id]);
                  setSel([n.id]);
                }}
                onDoubleClick={() => onOpen(n)}
                onContextMenu={(e) => onContext(e, n)}
              >
                <FileIcon node={n} size={16} />
                <span className="truncate flex-1 text-[12.5px]">{displayName(n)}</span>
                {n.kind === 'folder' && <Chev size={12} className="opacity-60" />}
              </div>
            );
          })}
        </div>
      ))}
      {lastSel && lastSel.kind === 'file' && (
        <div className="w-[260px] flex-none p-5 flex flex-col items-center gap-2 text-center">
          <FileIcon node={lastSel} size={120} />
          <div className="font-semibold break-all">{lastSel.name}</div>
          <div className="text-[12px] muted">
            {kindOf(lastSel.mime, lastSel.name)} · {formatBytes(lastSel.size)}
          </div>
          <div className="text-[11.5px] muted">Modified {finderDate(lastSel.modifiedAt)}</div>
          <button className="btn mt-1" onClick={() => openFile(lastSel.id)}>
            Open
          </button>
        </div>
      )}
    </div>
  );
}

export { useWindows };
