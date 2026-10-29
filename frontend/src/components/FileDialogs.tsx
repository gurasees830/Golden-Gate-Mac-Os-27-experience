import { useMemo, useState } from 'react';
import { useFs, DESKTOP, DOCUMENTS, DOWNLOADS, HOME, PICTURES, MUSIC, MOVIES, pathString } from '../stores/fs';
import { FileIcon } from '../icons/FileIcon';
import { SearchField } from './ui';
import type { FsNode } from '../types';
import { finderDate } from '../lib/format';
import { importFromComputer } from '../lib/hostAccess';

const PLACES = [
  { id: DESKTOP, label: 'Desktop' },
  { id: DOCUMENTS, label: 'Documents' },
  { id: DOWNLOADS, label: 'Downloads' },
  { id: PICTURES, label: 'Pictures' },
  { id: MUSIC, label: 'Music' },
  { id: MOVIES, label: 'Movies' },
  { id: HOME, label: 'Home' },
];

function Sheet({ children, width = 460 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="absolute inset-0 z-50 flex justify-center" style={{ background: 'rgba(0,0,0,.12)' }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mt-[52px] rounded-[18px] p-5 glass-strong liquid anim-pop self-start" style={{ width, color: 'var(--text)', background: 'var(--menu-bg)' }}>
        {children}
      </div>
    </div>
  );
}

export function SaveSheet({
  defaultName,
  defaultFolder = DOCUMENTS,
  formats,
  onSave,
  onCancel,
  title = 'Save',
}: {
  defaultName: string;
  defaultFolder?: string;
  formats?: { ext: string; label: string }[];
  onSave: (folderId: string, name: string, ext?: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  const nodes = useFs((s) => s.nodes);
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState(defaultFolder);
  const [fmt, setFmt] = useState(formats?.[0]?.ext);
  const subfolders = useMemo(() => Object.values(nodes).filter((n) => n.kind === 'folder' && !n.trashed && !n.system && n.parentId && !PLACES.some((p) => p.id === n.id)), [nodes]);
  const exists = Object.values(nodes).some((n) => n.parentId === folder && !n.trashed && n.name.toLowerCase() === withExt(name, fmt).toLowerCase());
  return (
    <Sheet>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(folder, withExt(name.trim(), fmt), fmt);
        }}
        className="flex flex-col gap-3"
      >
        <div className="font-bold text-[13px]">{title}</div>
        <label className="flex items-center gap-3 text-[12.5px]">
          <span className="w-[60px] text-right">Save As:</span>
          <input autoFocus className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <label className="flex items-center gap-3 text-[12.5px]">
          <span className="w-[60px] text-right">Where:</span>
          <select className="popup flex-1" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {PLACES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            {subfolders.length > 0 && <option disabled>──────────</option>}
            {subfolders.map((f) => (
              <option key={f.id} value={f.id}>{pathString(nodes, f.id).split('/').slice(-2).join(' ▸ ')}</option>
            ))}
          </select>
        </label>
        {formats && (
          <label className="flex items-center gap-3 text-[12.5px]">
            <span className="w-[60px] text-right">Format:</span>
            <select className="popup flex-1" value={fmt} onChange={(e) => setFmt(e.target.value)}>
              {formats.map((f) => (
                <option key={f.ext} value={f.ext}>{f.label}</option>
              ))}
            </select>
          </label>
        )}
        {exists && <div className="text-[11.5px] text-[#ff9500]">A file with this name already exists here. Saving creates a numbered copy.</div>}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" className="btn lg" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn lg primary" disabled={!name.trim()}>Save</button>
        </div>
      </form>
    </Sheet>
  );
}

function withExt(name: string, ext?: string) {
  if (!ext) return name;
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name.replace(/\.[a-z0-9]{1,5}$/i, '')}.${ext}`;
}

export function OpenSheet({ filter, onOpen, onCancel, title = 'Open' }: { filter: (n: FsNode) => boolean; onOpen: (id: string) => void; onCancel: () => void; title?: string }) {
  const nodes = useFs((s) => s.nodes);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const files = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.kind === 'file' && !n.trashed && filter(n) && (!q || n.name.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 200),
    [nodes, q, filter],
  );
  return (
    <Sheet width={560}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[13px]">{title}</div>
        <SearchField width={200} value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} autoFocus />
      </div>
      <div className="h-[280px] scroll rounded-[10px] p-1" style={{ background: 'var(--bg)', boxShadow: 'inset 0 0 0 .5px var(--separator)' }}>
        {files.length === 0 && <div className="text-center muted text-[12px] mt-10">No matching files</div>}
        {files.map((n) => (
          <div key={n.id} className={`list-row gap-2 ${sel === n.id ? 'selected' : ''}`} style={{ height: 30 }} onClick={() => setSel(n.id)} onDoubleClick={() => onOpen(n.id)}>
            <FileIcon node={n} size={20} />
            <span className="flex-1 truncate">{n.name}</span>
            <span className="text-[11px] opacity-60 truncate max-w-[180px]">{pathString(nodes, n.parentId ?? '')}</span>
            <span className="text-[11px] opacity-60 w-[120px] text-right truncate">{finderDate(n.modifiedAt)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          className="btn lg mr-auto"
          onClick={() =>
            void importFromComputer(DOCUMENTS).then((added) => {
              const f = added.find((n) => n.kind === 'file' && filter(n));
              if (f) onOpen(f.id);
            })
          }
        >
          From Your Computer…
        </button>
        <button className="btn lg" onClick={onCancel}>Cancel</button>
        <button className="btn lg primary" disabled={!sel} onClick={() => sel && onOpen(sel)}>Open</button>
      </div>
    </Sheet>
  );
}

export function ConfirmSheet({ title, message, buttons, onPick }: { title: string; message: string; buttons: { label: string; value: string; primary?: boolean }[]; onPick: (v: string) => void }) {
  return (
    <Sheet width={340}>
      <div className="font-bold text-[13px]">{title}</div>
      <div className="text-[12px] muted mt-1">{message}</div>
      <div className="flex justify-end gap-2 mt-4">
        {buttons.map((b) => (
          <button key={b.value} className={`btn lg ${b.primary ? 'primary' : ''}`} onClick={() => onPick(b.value)}>{b.label}</button>
        ))}
      </div>
    </Sheet>
  );
}
