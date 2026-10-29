import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Images, Heart, Trash2, FolderOpen, Plus, ChevronLeft, ChevronRight, RotateCw, Info, Play, Image as ImageIcon, X, ZoomIn, ZoomOut, Upload } from 'lucide-react';
import type { AppProps, FsNode } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { idb, registerHydration, uid } from '../../lib/persist';
import { useFs, fileUrl, PICTURES, importHostFiles, trashItems } from '../../stores/fs';
import { useSettings } from '../../stores/settings';
import { useSystem, promptDialog } from '../../stores/system';
import { SearchField, EmptyState, Slider } from '../../components/ui';
import { formatBytes } from '../../lib/format';
import { moveToTrash } from '../../shell/actions';
import { pt } from '../../lib/screen';

interface PhotosMeta {
  favorites: string[];
  rotation: Record<string, number>;
  albums: { id: string; name: string; items: string[] }[];
  set: (p: Partial<PhotosMeta>) => void;
}
const useMeta = create<PhotosMeta>()(persist((set) => ({ favorites: [], rotation: {}, albums: [], set: (p) => set(p) }), idb<PhotosMeta>('app.photos')));
registerHydration(useMeta);

function Thumb({ node, size, onOpen, selected, onSelect, onContext }: { node: FsNode; size: number; onOpen: () => void; selected: boolean; onSelect: () => void; onContext: (e: React.MouseEvent) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const rot = useMeta((s) => s.rotation[node.id] ?? 0);
  const fav = useMeta((s) => s.favorites.includes(node.id));
  useEffect(() => {
    void fileUrl(node.id).then(setUrl);
  }, [node.id, node.modifiedAt]);
  return (
    <div className="relative overflow-hidden" style={{ width: size, height: size, boxShadow: selected ? 'inset 0 0 0 3px var(--accent)' : undefined, background: 'var(--bg-3)' }} onClick={onSelect} onDoubleClick={onOpen} onContextMenu={onContext}>
      {url && <img src={url} alt={node.name} loading="lazy" draggable={false} className="w-full h-full object-cover" style={{ transform: `rotate(${rot}deg)` }} />}
      {fav && <Heart size={14} fill="#fff" color="#fff" className="absolute left-1 bottom-1 drop-shadow" />}
      {selected && <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 0 3px var(--accent)' }} />}
    </div>
  );
}

export default function Photos({ win }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const meta = useMeta();
  const [view, setView] = useState<string>('library');
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(140);
  const [sel, setSel] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>((win.args?.fileId as string) ?? null);
  const [slideshow, setSlideshow] = useState(false);
  const [dropHover, setDropHover] = useState(false);

  const all = useMemo(() => Object.values(nodes).filter((n) => n.kind === 'file' && n.mime.startsWith('image/') && !n.trashed).sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name)), [nodes]);
  const deleted = useMemo(() => trashItems(nodes).filter((n) => n.mime.startsWith('image/')), [nodes]);
  const album = meta.albums.find((a) => a.id === view);
  const list = useMemo(() => {
    let l = view === 'favorites' ? all.filter((n) => meta.favorites.includes(n.id)) : view === 'deleted' ? deleted : album ? album.items.map((id) => nodes[id]).filter((n) => n && !n.trashed) : view === 'screenshots' ? all.filter((n) => n.name.startsWith('Screenshot')) : all;
    if (q) l = l.filter((n) => n.name.toLowerCase().includes(q.toLowerCase()) || new Date(n.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toLowerCase().includes(q.toLowerCase()));
    return l;
  }, [view, all, deleted, album, meta.favorites, q, nodes]);

  useEffect(() => {
    if (win.args?.fileId) setViewer(win.args.fileId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => input.files && void importHostFiles(input.files, PICTURES).then((f) => useSystem.getState().showToast(`Imported ${f.length} photo${f.length === 1 ? '' : 's'}.`));
    input.click();
  };
  const toggleFav = (id: string) => meta.set({ favorites: meta.favorites.includes(id) ? meta.favorites.filter((x) => x !== id) : [...meta.favorites, id] });
  const newAlbum = async (withId?: string) => {
    const name = await promptDialog('New Album', 'Album name:', 'Untitled Album');
    if (!name) return;
    const a = { id: uid('alb'), name, items: withId ? [withId] : [] };
    meta.set({ albums: [...meta.albums, a] });
    setView(a.id);
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'Import…', shortcut: 'mod+shift+i', action: doImport }, { label: 'New Album', shortcut: 'mod+n', action: () => void newAlbum() }, { separator: true }, { label: 'Play Slideshow', disabled: !list.length, action: () => setSlideshow(true) }] },
      { title: 'Image', items: [{ label: 'Favorite', shortcut: '.', disabled: !sel, action: () => sel && toggleFav(sel) }, { label: 'Rotate Clockwise', shortcut: 'mod+r', disabled: !sel, action: () => sel && meta.set({ rotation: { ...meta.rotation, [sel]: ((meta.rotation[sel] ?? 0) + 90) % 360 } }) }, { label: 'Set as Wallpaper', disabled: !sel, action: () => sel && useSettings.getState().patch('wallpaper', { id: `custom:${sel}`, customName: nodes[sel]?.name }) }, { separator: true }, { label: 'Delete Photo', shortcut: 'mod+backspace', disabled: !sel || view === 'deleted', action: () => sel && void moveToTrash([sel]) }] },
    ],
    [sel, list.length, view],
  );

  const context = (e: React.MouseEvent, n: FsNode) => {
    e.preventDefault();
    setSel(n.id);
    const p = pt(e);
    useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, n.trashed
      ? [{ label: 'Recover', action: () => void useFs.getState().restore([n.id]) }, { label: 'Delete Permanently', action: () => void useFs.getState().deleteForever([n.id]) }]
      : [
          { label: 'Open', action: () => setViewer(n.id) },
          { label: meta.favorites.includes(n.id) ? 'Unfavorite' : 'Favorite', action: () => toggleFav(n.id) },
          { label: 'Rotate Clockwise', action: () => meta.set({ rotation: { ...meta.rotation, [n.id]: ((meta.rotation[n.id] ?? 0) + 90) % 360 } }) },
          { label: 'Add to', submenu: [...meta.albums.map((a) => ({ label: a.name, action: () => meta.set({ albums: meta.albums.map((x) => (x.id === a.id ? { ...x, items: [...new Set([...x.items, n.id])] } : x)) }) })), { separator: true }, { label: 'New Album…', action: () => void newAlbum(n.id) }] },
          ...(album ? [{ label: `Remove from “${album.name}”`, action: () => meta.set({ albums: meta.albums.map((x) => (x.id === album.id ? { ...x, items: x.items.filter((i) => i !== n.id) } : x)) }) }] : []),
          { separator: true },
          { label: 'Set as Wallpaper', action: () => useSettings.getState().patch('wallpaper', { id: `custom:${n.id}`, customName: n.name }) },
          { label: 'Delete Photo', action: () => void moveToTrash([n.id]) },
        ]);
  };

  const sidebar = [
    { id: 'library', label: 'Library', icon: <Images size={16} />, n: all.length },
    { id: 'favorites', label: 'Favorites', icon: <Heart size={16} />, n: meta.favorites.filter((id) => nodes[id] && !nodes[id].trashed).length },
    { id: 'screenshots', label: 'Screenshots', icon: <ImageIcon size={16} />, n: all.filter((n) => n.name.startsWith('Screenshot')).length },
    { id: 'deleted', label: 'Recently Deleted', icon: <Trash2 size={16} />, n: deleted.length },
  ];
  const title = sidebar.find((s) => s.id === view)?.label ?? album?.name ?? 'Library';

  return (
    <div className="flex h-full min-h-0 relative">
      <div className="w-[200px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="scroll flex-1 px-[10px]">
          <div className="sb-heading">Photos</div>
          {sidebar.map((s) => (
            <div key={s.id} className={`sb-item accent ${view === s.id ? 'active' : ''}`} onClick={() => { setView(s.id); setSel(null); }}>
              <span className="sb-ico">{s.icon}</span>
              <span className="flex-1">{s.label}</span>
              <span className="text-[11px] opacity-60">{s.n}</span>
            </div>
          ))}
          <div className="sb-heading flex items-center justify-between">
            Albums
            <button className="border-0 bg-transparent p-0 opacity-70" aria-label="New album" onClick={() => void newAlbum()}><Plus size={13} /></button>
          </div>
          {meta.albums.map((a) => (
            <div key={a.id} className={`sb-item accent ${view === a.id ? 'active' : ''}`} onClick={() => setView(a.id)} onContextMenu={(e) => { const p = pt(e); useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [{ label: 'Rename Album…', action: async () => { const n = await promptDialog('Rename Album', 'Name:', a.name); if (n) meta.set({ albums: meta.albums.map((x) => (x.id === a.id ? { ...x, name: n } : x)) }); } }, { label: 'Delete Album', action: () => { meta.set({ albums: meta.albums.filter((x) => x.id !== a.id) }); setView('library'); } }]); }}>
              <span className="sb-ico"><FolderOpen size={16} /></span>
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-[11px] opacity-60">{a.items.length}</span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="flex-1 min-w-0 flex flex-col app-surface"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropHover(true); } }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => { e.preventDefault(); setDropHover(false); if (e.dataTransfer.files.length) void importHostFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), PICTURES); }}
        style={{ boxShadow: dropHover ? 'inset 0 0 0 3px var(--accent)' : undefined }}
      >
        <TitleBar lights={false} showTitle={false} className="chrome hairline-b !gap-3" style={{ paddingLeft: 16 }}>
          <div className="min-w-0">
            <div className="font-bold text-[14px] truncate">{title}</div>
            <div className="text-[11px] muted">{list.length} items</div>
          </div>
          <div className="flex-1" />
          <div className="w-[110px]" data-no-drag><Slider value={zoom} min={80} max={260} step={10} onChange={setZoom} ariaLabel="Thumbnail size" /></div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Favorite" disabled={!sel} onClick={() => sel && toggleFav(sel)}><Heart size={15} fill={sel && meta.favorites.includes(sel) ? 'currentColor' : 'none'} /></button>
            <button className="tb-btn" aria-label="Rotate" disabled={!sel} onClick={() => sel && meta.set({ rotation: { ...meta.rotation, [sel]: ((meta.rotation[sel] ?? 0) + 90) % 360 } })}><RotateCw size={15} /></button>
            <button className="tb-btn" aria-label="Slideshow" disabled={!list.length} onClick={() => setSlideshow(true)}><Play size={15} /></button>
            <button className="tb-btn" aria-label="Import" onClick={doImport}><Upload size={15} /></button>
          </div>
          <SearchField width={160} value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search photos" />
        </TitleBar>
        <div className="flex-1 scroll p-[2px]" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {list.length === 0 ? (
            <EmptyState icon={<Images size={48} />} title={view === 'deleted' ? 'No Recently Deleted Photos' : 'No Photos'} subtitle="Drag photos here from your computer, or click Import." action={view !== 'deleted' && <button className="btn" onClick={doImport}>Import…</button>} />
          ) : (
            <div className="flex flex-wrap gap-[2px]">
              {list.map((n) => (
                <Thumb key={n.id} node={n} size={zoom} selected={sel === n.id} onSelect={() => setSel(n.id)} onOpen={() => (n.trashed ? undefined : setViewer(n.id))} onContext={(e) => context(e, n)} />
              ))}
            </div>
          )}
        </div>
        {view === 'deleted' && deleted.length > 0 && (
          <div className="h-[40px] hairline-t flex items-center justify-end gap-2 px-3">
            <button className="btn" onClick={() => void useFs.getState().restore(deleted.map((d) => d.id))}>Recover All</button>
            <button className="btn" onClick={() => void useFs.getState().deleteForever(deleted.map((d) => d.id))}>Delete All</button>
          </div>
        )}
      </div>
      {viewer && nodes[viewer] && <Viewer list={list.length && list.some((n) => n.id === viewer) ? list : [nodes[viewer]]} id={viewer} onClose={() => setViewer(null)} onChange={setViewer} toggleFav={toggleFav} />}
      {slideshow && <Slideshow list={list} onClose={() => setSlideshow(false)} />}
    </div>
  );
}

function Viewer({ list, id, onClose, onChange, toggleFav }: { list: FsNode[]; id: string; onClose: () => void; onChange: (id: string) => void; toggleFav: (id: string) => void }) {
  const node = list.find((n) => n.id === id) ?? list[0];
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [info, setInfo] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const meta = useMeta();
  const idx = list.findIndex((n) => n.id === node.id);
  useEffect(() => {
    setZoom(1);
    void fileUrl(node.id).then(setUrl);
  }, [node.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && idx < list.length - 1) onChange(list[idx + 1].id);
      if (e.key === 'ArrowLeft' && idx > 0) onChange(list[idx - 1].id);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const rot = meta.rotation[node.id] ?? 0;
  return (
    <div className="absolute inset-0 z-30 flex flex-col app-surface">
      <TitleBar showTitle={false} className="chrome hairline-b !gap-2">
        <button className="btn ghost" data-no-drag onClick={onClose}><ChevronLeft size={15} /> Back</button>
        <div className="flex-1 text-center font-semibold truncate">{node.name}</div>
        <div className="tb-group" data-no-drag>
          <button className="tb-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}><ZoomOut size={15} /></button>
          <button className="tb-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}><ZoomIn size={15} /></button>
          <button className="tb-btn" aria-label="Favorite" onClick={() => toggleFav(node.id)}><Heart size={15} fill={meta.favorites.includes(node.id) ? 'currentColor' : 'none'} /></button>
          <button className="tb-btn" aria-label="Rotate" onClick={() => meta.set({ rotation: { ...meta.rotation, [node.id]: (rot + 90) % 360 } })}><RotateCw size={15} /></button>
          <button className={`tb-btn ${info ? 'active' : ''}`} aria-label="Info" onClick={() => setInfo(!info)}><Info size={15} /></button>
          <button className="tb-btn" aria-label="Delete" onClick={() => { void moveToTrash([node.id]); onClose(); }}><Trash2 size={15} /></button>
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative overflow-auto grid place-items-center" style={{ background: '#111' }} onWheel={(e) => { if (e.ctrlKey || e.metaKey) setZoom((z) => Math.min(6, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9)))); }}>
          {url && <img src={url} alt={node.name} onLoad={(e) => setDims({ w: (e.target as HTMLImageElement).naturalWidth, h: (e.target as HTMLImageElement).naturalHeight })} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `rotate(${rot}deg) scale(${zoom})` }} />}
          {idx > 0 && <button className="absolute left-3 top-1/2 -translate-y-1/2 w-[36px] h-[36px] rounded-full border-0 glass-strong grid place-items-center" aria-label="Previous" onClick={() => onChange(list[idx - 1].id)}><ChevronLeft size={18} /></button>}
          {idx < list.length - 1 && <button className="absolute right-3 top-1/2 -translate-y-1/2 w-[36px] h-[36px] rounded-full border-0 glass-strong grid place-items-center" aria-label="Next" onClick={() => onChange(list[idx + 1].id)}><ChevronRight size={18} /></button>}
        </div>
        {info && (
          <div className="w-[240px] flex-none hairline-l p-4 text-[12px] flex flex-col gap-2">
            <div className="font-semibold text-[13px] break-all">{node.name}</div>
            <div className="muted">{new Date(node.createdAt).toLocaleString()}</div>
            {dims && <div>{dims.w} × {dims.h} pixels</div>}
            <div>{formatBytes(node.size)} · {node.mime}</div>
            <button className="btn mt-2" onClick={() => useSettings.getState().patch('wallpaper', { id: `custom:${node.id}`, customName: node.name })}>Set as Wallpaper</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Slideshow({ list, onClose }: { list: FsNode[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    void Promise.all(list.map(async (n) => [n.id, await fileUrl(n.id)] as const)).then((r) => setUrls(Object.fromEntries(r.filter(([, u]) => u) as [string, string][])));
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch {
      /* ignore */
    }
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 4000);
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % list.length);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + list.length) % list.length);
    };
    window.addEventListener('keydown', k);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', k);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const n = list[i];
  return (
    <div className="fixed inset-0 z-[9900] bg-black" onClick={onClose}>
      {n && urls[n.id] && <img key={n.id} src={urls[n.id]} alt={n.name} className="absolute inset-0 w-full h-full object-contain anim-fade" style={{ animation: 'gg-fade-in .9s, gg-kb 4.2s linear' }} />}
      <button className="absolute right-4 top-4 w-[34px] h-[34px] rounded-full border-0 grid place-items-center" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} aria-label="Exit slideshow" onClick={onClose}><X size={16} /></button>
      <div className="absolute bottom-4 inset-x-0 text-center text-white/60 text-[12px]">{i + 1} / {list.length} · Esc to exit</div>
      <style>{`@keyframes gg-kb { from { transform: scale(1) } to { transform: scale(1.06) } }`}</style>
    </div>
  );
}
