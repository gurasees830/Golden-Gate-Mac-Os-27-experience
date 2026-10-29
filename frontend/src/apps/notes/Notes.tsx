import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { SquarePen, Trash2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListChecks, Heading1, Heading2, Pin, FolderPlus, Folder, Clock3, Type } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindow } from '../../shell/windowContext';
import { useNotes, noteTitle, type Note } from '../../stores/data';
import { SearchField, EmptyState } from '../../components/ui';
import { uid } from '../../lib/persist';
import { relativeDay } from '../../lib/format';
import { confirmDialog, promptDialog, useSystem } from '../../stores/system';
import { replaceInEditable } from '../../lib/textReplace';
import { pt } from '../../lib/screen';

const DELETED = '__deleted';

function clean(html: string) {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'p', 'div', 'br', 'ul', 'ol', 'li', 'span', 'a', 'blockquote', 'pre', 'code'], ALLOWED_ATTR: ['class', 'data-checked', 'href'] });
}

export default function Notes({ win }: AppProps) {
  const { notes, folders, set, upsert } = useNotes();
  const { focused } = useWindow();
  const [folder, setFolder] = useState('notes');
  const [selId, setSelId] = useState<string | null>((win.args?.noteId as string) ?? null);
  const [q, setQ] = useState('');
  const editor = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = win.args?.noteId as string | undefined;
    if (id) {
      const n = notes.find((x) => x.id === id);
      if (n) {
        setFolder(n.deletedAt ? DELETED : n.folderId);
        setSelId(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const list = useMemo(() => {
    const query = q.toLowerCase();
    return notes
      .filter((n) => (folder === DELETED ? !!n.deletedAt : !n.deletedAt && (folder === 'all' || n.folderId === folder)))
      .filter((n) => !query || n.html.toLowerCase().replace(/<[^>]+>/g, ' ').includes(query))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, folder, q]);

  const current = notes.find((n) => n.id === selId) ?? null;

  useEffect(() => {
    if (!selId && list.length) setSelId(list[0].id);
  }, [list, selId]);

  // load note into editor when selection changes
  useEffect(() => {
    if (editor.current && current) {
      if (editor.current.innerHTML !== current.html) editor.current.innerHTML = clean(current.html);
    } else if (editor.current) editor.current.innerHTML = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  const save = () => {
    if (!current || !editor.current) return;
    const html = clean(editor.current.innerHTML);
    if (html === current.html) return;
    upsert({ ...current, html, updatedAt: Date.now() });
  };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, 400);
  };
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const newNote = () => {
    const f = folder === DELETED || folder === 'all' ? 'notes' : folder;
    const n: Note = { id: uid('note'), folderId: f, html: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false };
    upsert(n);
    setFolder(f);
    setSelId(n.id);
    setTimeout(() => editor.current?.focus(), 30);
  };
  const deleteNote = async (n: Note | null = current) => {
    if (!n) return;
    if (n.deletedAt) {
      if (!(await confirmDialog('Delete this note permanently?', "You can't undo this action.", 'Delete', { icon: 'warning' }))) return;
      set({ notes: notes.filter((x) => x.id !== n.id) });
    } else upsert({ ...n, deletedAt: Date.now() });
    setSelId(null);
  };

  const exec = (cmd: string, val?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, val);
    scheduleSave();
  };
  const checklist = () => {
    editor.current?.focus();
    document.execCommand('insertUnorderedList');
    const sel = window.getSelection();
    const li = sel?.anchorNode && (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as HTMLElement) : sel.anchorNode.parentElement)?.closest('ul');
    if (li) {
      li.classList.toggle('checklist');
      li.querySelectorAll('li').forEach((x) => x.setAttribute('data-checked', x.getAttribute('data-checked') ?? 'false'));
    }
    scheduleSave();
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New Note', shortcut: 'mod+n', action: newNote }, { label: 'New Folder', shortcut: 'mod+shift+n', action: () => void newFolder() }, { separator: true }, { label: current?.pinned ? 'Unpin Note' : 'Pin Note', disabled: !current, action: () => current && upsert({ ...current, pinned: !current.pinned }) }, { label: 'Delete', shortcut: 'mod+backspace', disabled: !current, action: () => void deleteNote() }] },
      { title: 'Edit', items: [{ label: 'Undo', shortcut: 'mod+z', action: () => exec('undo') }, { label: 'Redo', shortcut: 'mod+shift+z', action: () => exec('redo') }, { separator: true }, { label: 'Find', shortcut: 'mod+f', action: () => searchRef.current?.focus() }] },
      {
        title: 'Format',
        items: [
          { label: 'Title', shortcut: 'mod+shift+t', action: () => exec('formatBlock', 'h1') },
          { label: 'Heading', shortcut: 'mod+shift+h', action: () => exec('formatBlock', 'h2') },
          { label: 'Body', shortcut: 'mod+shift+b', action: () => exec('formatBlock', 'div') },
          { label: 'Checklist', shortcut: 'mod+shift+l', action: checklist },
          { separator: true },
          { label: 'Bold', shortcut: 'mod+b', action: () => exec('bold') },
          { label: 'Italic', shortcut: 'mod+i', action: () => exec('italic') },
          { label: 'Underline', shortcut: 'mod+u', action: () => exec('underline') },
          { label: 'Strikethrough', action: () => exec('strikeThrough') },
        ],
      },
    ],
    [current?.id, current?.pinned, folder, notes.length],
  );

  const newFolder = async () => {
    const name = await promptDialog('New Folder', 'Name:', 'New Folder');
    if (!name) return;
    const id = uid('nf');
    set({ folders: [...folders, { id, name }] });
    setFolder(id);
  };

  const counts = (id: string) => notes.filter((n) => (id === DELETED ? n.deletedAt : !n.deletedAt && (id === 'all' || n.folderId === id))).length;
  const groups = useMemo(() => {
    const now = new Date();
    const g = new Map<string, Note[]>();
    for (const n of list) {
      const k = n.pinned ? 'Pinned' : (() => {
        const r = relativeDay(new Date(n.updatedAt), now);
        if (r === 'Today' || r === 'Yesterday') return r;
        const days = (now.getTime() - n.updatedAt) / 86400000;
        return days < 7 ? 'Previous 7 Days' : days < 30 ? 'Previous 30 Days' : new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      })();
      g.set(k, [...(g.get(k) ?? []), n]);
    }
    return [...g.entries()];
  }, [list]);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[200px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="scroll flex-1 px-[10px]">
          <div className="sb-heading">On My Mac</div>
          {[{ id: 'all', name: 'All On My Mac' }, ...folders].map((f) => (
            <div
              key={f.id}
              className={`sb-item accent ${folder === f.id ? 'active' : ''}`}
              onClick={() => { setFolder(f.id); setSelId(null); }}
              onContextMenu={(e) => {
                if (f.id === 'notes' || f.id === 'all') return;
                const p = pt(e);
                useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
                  { label: 'Rename Folder…', action: async () => { const n = await promptDialog('Rename Folder', 'Name:', f.name); if (n) set({ folders: folders.map((x) => (x.id === f.id ? { ...x, name: n } : x)) }); } },
                  { label: 'Delete Folder', action: () => { set({ folders: folders.filter((x) => x.id !== f.id), notes: notes.map((n) => (n.folderId === f.id ? { ...n, folderId: 'notes', deletedAt: Date.now() } : n)) }); setFolder('notes'); } },
                ]);
              }}
            >
              <span className="sb-ico" style={{ color: '#e8a800' }}><Folder size={16} /></span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-[11px] opacity-60">{counts(f.id)}</span>
            </div>
          ))}
          <div className={`sb-item accent ${folder === DELETED ? 'active' : ''}`} onClick={() => { setFolder(DELETED); setSelId(null); }}>
            <span className="sb-ico" style={{ color: '#e8a800' }}><Trash2 size={16} /></span>
            <span className="flex-1">Recently Deleted</span>
            <span className="text-[11px] opacity-60">{counts(DELETED)}</span>
          </div>
        </div>
        <button className="btn ghost m-2 !justify-start" onClick={() => void newFolder()}>
          <FolderPlus size={14} /> New Folder
        </button>
      </div>

      <div className="w-[250px] flex-none hairline-r flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="chrome hairline-b !px-3 !gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[13px] truncate">{folder === DELETED ? 'Recently Deleted' : folder === 'all' ? 'All On My Mac' : folders.find((f) => f.id === folder)?.name}</div>
            <div className="text-[11px] muted">{list.length} notes</div>
          </div>
          <button className="tb-btn" aria-label="Delete note" disabled={!current} onClick={() => void deleteNote()}>
            <Trash2 size={16} />
          </button>
        </TitleBar>
        <div className="p-2 hairline-b">
          <SearchField ref={searchRef} width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search notes" />
        </div>
        <div className="scroll flex-1 px-2 py-1">
          {list.length === 0 && <EmptyState title={q ? 'No Results' : 'No Notes'} />}
          {groups.map(([label, ns]) => (
            <div key={label}>
              <div className="text-[11px] font-bold px-2 pt-3 pb-1 muted flex items-center gap-1">{label === 'Pinned' && <Pin size={10} />}{label}</div>
              {ns.map((n) => {
                const t = noteTitle(n.html);
                const active = n.id === selId;
                return (
                  <div
                    key={n.id}
                    className="px-3 py-2 rounded-[8px] mb-[2px]"
                    style={{ background: active ? (focused ? '#ffd52e' : 'var(--press)') : undefined, color: active && focused ? '#000' : undefined }}
                    onClick={() => setSelId(n.id)}
                    onContextMenu={(e) => {
                      const p = pt(e);
                      useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
                        { label: n.pinned ? 'Unpin Note' : 'Pin Note', action: () => upsert({ ...n, pinned: !n.pinned }) },
                        ...(n.deletedAt ? [{ label: 'Recover', action: () => upsert({ ...n, deletedAt: undefined }) }] : []),
                        { label: 'Move to', submenu: folders.map((f) => ({ label: f.name, action: () => upsert({ ...n, folderId: f.id, deletedAt: undefined }) })) },
                        { separator: true },
                        { label: n.deletedAt ? 'Delete Permanently' : 'Delete', action: () => void deleteNote(n) },
                      ]);
                    }}
                  >
                    <div className="font-semibold text-[13px] truncate">{t.title}</div>
                    <div className="text-[12px] truncate" style={{ opacity: 0.65 }}>
                      <span className="mr-2">{new Date(n.updatedAt).toLocaleDateString() === new Date().toLocaleDateString() ? new Date(n.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date(n.updatedAt).toLocaleDateString()}</span>
                      {t.preview || 'No additional text'}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="hairline-b !px-3 !gap-2">
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="New note" onClick={newNote}><SquarePen size={16} /></button>
          </div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Title" onClick={() => exec('formatBlock', 'h1')}><Heading1 size={16} /></button>
            <button className="tb-btn" aria-label="Heading" onClick={() => exec('formatBlock', 'h2')}><Heading2 size={16} /></button>
            <button className="tb-btn" aria-label="Body" onClick={() => exec('formatBlock', 'div')}><Type size={15} /></button>
          </div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Bold" onClick={() => exec('bold')}><Bold size={15} /></button>
            <button className="tb-btn" aria-label="Italic" onClick={() => exec('italic')}><Italic size={15} /></button>
            <button className="tb-btn" aria-label="Underline" onClick={() => exec('underline')}><Underline size={15} /></button>
            <button className="tb-btn" aria-label="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough size={15} /></button>
          </div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Checklist" onClick={checklist}><ListChecks size={16} /></button>
            <button className="tb-btn" aria-label="Bulleted list" onClick={() => exec('insertUnorderedList')}><List size={16} /></button>
            <button className="tb-btn" aria-label="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={16} /></button>
          </div>
          <div className="flex-1" />
          {current && <span className="text-[11px] muted flex items-center gap-1"><Clock3 size={11} /> {new Date(current.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        </TitleBar>
        {current ? (
          <div className="flex-1 scroll">
            <div
              ref={editor}
              className="notes-editor selectable outline-none px-10 py-6 min-h-full text-[14px] leading-[1.55]"
              contentEditable={!current.deletedAt}
              suppressContentEditableWarning
              spellCheck
              onInput={(e) => {
                const ie = e.nativeEvent as InputEvent;
                if (ie.data && /[\s.,!?;:]/.test(ie.data)) replaceInEditable();
                scheduleSave();
              }}
              onBlur={save}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
              }}
              onClick={(e) => {
                const li = (e.target as HTMLElement).closest('ul.checklist > li') as HTMLElement | null;
                if (li) {
                  const r = li.getBoundingClientRect();
                  const scale = r.width / li.offsetWidth || 1;
                  if ((e.clientX - r.left) / scale < 4) {
                    li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
                    scheduleSave();
                  }
                }
              }}
            />
          </div>
        ) : (
          <EmptyState title="No Note Selected" action={<button className="btn" onClick={newNote}>New Note</button>} />
        )}
      </div>
    </div>
  );
}
