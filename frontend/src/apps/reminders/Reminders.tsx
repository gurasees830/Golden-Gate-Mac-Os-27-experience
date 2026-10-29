import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Flag, CalendarDays, Inbox, CheckCircle2, List, Trash2, Info } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useReminders, type Reminder } from '../../stores/data';
import { SearchField, EmptyState } from '../../components/ui';
import { uid } from '../../lib/persist';
import { systemNow } from '../../lib/clock';
import { promptDialog, useSystem } from '../../stores/system';
import { pt } from '../../lib/screen';
import { pad } from '../../lib/format';

type Smart = 'today' | 'scheduled' | 'all' | 'flagged' | 'completed';
const SMART: { id: Smart; label: string; color: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', color: '#007aff', icon: <CalendarDays size={15} /> },
  { id: 'scheduled', label: 'Scheduled', color: '#ff3b30', icon: <CalendarDays size={15} /> },
  { id: 'all', label: 'All', color: '#3a3a3c', icon: <Inbox size={15} /> },
  { id: 'flagged', label: 'Flagged', color: '#ff9500', icon: <Flag size={15} /> },
  { id: 'completed', label: 'Completed', color: '#8e8e93', icon: <CheckCircle2 size={15} /> },
];
const LIST_COLORS = ['#007aff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff2d55', '#a2845e'];

const endOfToday = () => {
  const n = systemNow();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59).getTime();
};

export default function Reminders({ win }: AppProps) {
  const { lists, items, set, upsert, remove } = useReminders();
  const [view, setView] = useState<string>('reminders');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<string | null>((win.args?.reminderId as string) ?? null);
  const [showDone, setShowDone] = useState(false);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = win.args?.reminderId as string | undefined;
    if (id) {
      const r = items.find((x) => x.id === id);
      if (r) {
        setView(r.listId);
        setDetail(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const filter = (r: Reminder, v: string) => {
    switch (v) {
      case 'today':
        return !r.completed && r.due != null && r.due <= endOfToday();
      case 'scheduled':
        return !r.completed && r.due != null;
      case 'all':
        return !r.completed;
      case 'flagged':
        return !r.completed && r.flagged;
      case 'completed':
        return r.completed;
      default:
        return r.listId === v && (showDone || !r.completed);
    }
  };
  const shown = useMemo(
    () =>
      items
        .filter((r) => (q ? r.title.toLowerCase().includes(q.toLowerCase()) || r.notes.toLowerCase().includes(q.toLowerCase()) : filter(r, view)))
        .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.due ?? Infinity) - (b.due ?? Infinity) || b.priority - a.priority || a.createdAt - b.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, view, q, showDone],
  );
  const smart = SMART.find((s) => s.id === view);
  const list = lists.find((l) => l.id === view);
  const color = smart?.color ?? list?.color ?? '#007aff';
  const title = q ? `Results for “${q}”` : smart?.label ?? list?.name ?? '';

  const add = (title = 'New Reminder') => {
    const listId = list ? list.id : 'reminders';
    const r: Reminder = { id: uid('r'), listId, title, notes: '', due: view === 'today' ? endOfToday() - 59000 : null, dueHasTime: false, priority: 0, flagged: view === 'flagged', completed: false, createdAt: Date.now() };
    upsert(r);
    return r;
  };

  const newList = async () => {
    const name = await promptDialog('New List', 'List name:', 'New List');
    if (!name) return;
    const id = uid('l');
    set({ lists: [...lists, { id, name, color: LIST_COLORS[lists.length % LIST_COLORS.length] }] });
    setView(id);
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New Reminder', shortcut: 'mod+n', action: () => newRef.current?.focus() }, { label: 'New List', shortcut: 'mod+shift+n', action: () => void newList() }] },
      { title: 'View', items: [{ label: showDone ? 'Hide Completed' : 'Show Completed', shortcut: 'mod+shift+h', action: () => setShowDone(!showDone) }] },
    ],
    [showDone, view, lists.length],
  );

  const det = items.find((r) => r.id === detail);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[230px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2">
          <SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search reminders" />
        </div>
        <div className="grid grid-cols-2 gap-2 px-3">
          {SMART.map((s) => (
            <button key={s.id} className="rounded-[10px] p-2 border-0 text-left" style={{ background: view === s.id && !q ? s.color : 'var(--glass-strong)', color: view === s.id && !q ? '#fff' : 'var(--text)', boxShadow: 'inset 0 0 0 .5px var(--separator)' }} onClick={() => { setView(s.id); setQ(''); }}>
              <div className="flex justify-between items-start">
                <span className="w-[26px] h-[26px] rounded-full grid place-items-center text-white" style={{ background: view === s.id && !q ? 'rgba(255,255,255,.25)' : s.color }}>{s.icon}</span>
                <span className="text-[19px] font-bold">{items.filter((r) => filter(r, s.id)).length}</span>
              </div>
              <div className="text-[12px] font-semibold mt-1">{s.label}</div>
            </button>
          ))}
        </div>
        <div className="sb-heading px-4">My Lists</div>
        <div className="scroll flex-1 px-[10px]">
          {lists.map((l) => (
            <div
              key={l.id}
              className={`sb-item ${view === l.id && !q ? 'active' : ''}`}
              onClick={() => { setView(l.id); setQ(''); }}
              onContextMenu={(e) => {
                const p = pt(e);
                useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
                  { label: 'Rename…', action: async () => { const n = await promptDialog('Rename List', 'Name:', l.name); if (n) set({ lists: lists.map((x) => (x.id === l.id ? { ...x, name: n } : x)) }); } },
                  { label: 'Color', submenu: LIST_COLORS.map((c) => ({ label: c, icon: <span style={{ width: 10, height: 10, borderRadius: 5, background: c, display: 'inline-block' }} />, action: () => set({ lists: lists.map((x) => (x.id === l.id ? { ...x, color: c } : x)) }) })) },
                  { separator: true },
                  { label: 'Delete List', disabled: l.id === 'reminders', action: () => { set({ lists: lists.filter((x) => x.id !== l.id), items: items.filter((r) => r.listId !== l.id) }); setView('reminders'); } },
                ]);
              }}
            >
              <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-white" style={{ background: l.color }}><List size={12} /></span>
              <span className="flex-1 truncate">{l.name}</span>
              <span className="text-[11px] opacity-60">{items.filter((r) => r.listId === l.id && !r.completed).length}</span>
            </div>
          ))}
        </div>
        <button className="btn ghost m-2 !justify-start" onClick={() => void newList()}><Plus size={14} /> Add List</button>
      </div>

      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="!px-5">
          <div className="flex-1" />
          {list && <button className="btn ghost text-[12px]" data-no-drag onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide Completed' : 'Show Completed'}</button>}
          <button className="tb-btn" aria-label="Add reminder" data-no-drag onClick={() => newRef.current?.focus()}><Plus size={18} /></button>
        </TitleBar>
        <div className="px-6 flex items-baseline justify-between">
          <div className="text-[28px] font-bold" style={{ color }}>{title}</div>
          <div className="text-[28px] font-bold" style={{ color }}>{shown.filter((r) => !r.completed).length}</div>
        </div>
        <div className="flex-1 scroll px-6 pb-4">
          {shown.length === 0 && !list && <EmptyState title={view === 'completed' ? 'No Completed Reminders' : 'No Reminders'} />}
          {shown.map((r) => (
            <ReminderRow key={r.id} r={r} color={lists.find((l) => l.id === r.listId)?.color ?? color} onChange={upsert} onDetail={() => setDetail(r.id)} onDelete={() => remove(r.id)} showList={!list} listName={lists.find((l) => l.id === r.listId)?.name} />
          ))}
          {(list || view === 'today' || view === 'all' || view === 'flagged') && !q && (
            <div className="flex items-center gap-3 py-[7px]">
              <span className="w-[20px] h-[20px] rounded-full flex-none" style={{ boxShadow: 'inset 0 0 0 1.5px var(--text-3)' }} />
              <input
                ref={newRef}
                className="flex-1 bg-transparent border-0 outline-none text-[13px]"
                placeholder="New Reminder"
                onKeyDown={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (e.key === 'Enter' && v) {
                    add(v);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {det && (
        <div className="w-[270px] flex-none hairline-l app-surface flex flex-col p-4 gap-3" style={{ background: 'var(--chrome-solid)' }}>
          <div className="flex justify-between items-center">
            <div className="font-bold">Details</div>
            <button className="btn" onClick={() => setDetail(null)}>Done</button>
          </div>
          <input className="field" value={det.title} onChange={(e) => upsert({ ...det, title: e.target.value })} aria-label="Title" />
          <textarea className="field" rows={3} placeholder="Notes" value={det.notes} onChange={(e) => upsert({ ...det, notes: e.target.value })} />
          <label className="flex items-center justify-between text-[12.5px]">
            Date
            <input type="date" className="field !w-[150px]" value={det.due ? new Date(det.due).toLocaleDateString('en-CA') : ''} onChange={(e) => {
              if (!e.target.value) return upsert({ ...det, due: null, dueHasTime: false, notified: false });
              const [y, m, d] = e.target.value.split('-').map(Number);
              const prev = det.due ? new Date(det.due) : null;
              upsert({ ...det, due: new Date(y, m - 1, d, prev && det.dueHasTime ? prev.getHours() : 9, prev && det.dueHasTime ? prev.getMinutes() : 0).getTime(), notified: false });
            }} />
          </label>
          <label className="flex items-center justify-between text-[12.5px]">
            Time
            <input type="time" className="field !w-[150px]" disabled={!det.due} value={det.due && det.dueHasTime ? `${pad(new Date(det.due).getHours())}:${pad(new Date(det.due).getMinutes())}` : ''} onChange={(e) => {
              if (!det.due) return;
              if (!e.target.value) return upsert({ ...det, dueHasTime: false });
              const [h, mi] = e.target.value.split(':').map(Number);
              const d = new Date(det.due);
              d.setHours(h, mi, 0, 0);
              upsert({ ...det, due: d.getTime(), dueHasTime: true, notified: false });
            }} />
          </label>
          <label className="flex items-center justify-between text-[12.5px]">
            Priority
            <select className="popup" value={det.priority} onChange={(e) => upsert({ ...det, priority: Number(e.target.value) as 0 | 1 | 2 | 3 })}>
              <option value={0}>None</option><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
            </select>
          </label>
          <label className="flex items-center justify-between text-[12.5px]">
            List
            <select className="popup" value={det.listId} onChange={(e) => upsert({ ...det, listId: e.target.value })}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between text-[12.5px]">
            Flagged
            <input type="checkbox" className="check" checked={det.flagged} onChange={(e) => upsert({ ...det, flagged: e.target.checked })} />
          </label>
          <div className="text-[11px] muted">Reminders with a date and time notify you when due.</div>
          <button className="btn mt-auto" style={{ color: '#ff3b30' }} onClick={() => { remove(det.id); setDetail(null); }}><Trash2 size={13} /> Delete Reminder</button>
        </div>
      )}
    </div>
  );
}

function ReminderRow({ r, color, onChange, onDetail, onDelete, showList, listName }: { r: Reminder; color: string; onChange: (r: Reminder) => void; onDetail: () => void; onDelete: () => void; showList: boolean; listName?: string }) {
  const overdue = !r.completed && r.due != null && r.due < systemNow().getTime();
  return (
    <div
      className="group flex items-start gap-3 py-[7px] hairline-b"
      onContextMenu={(e) => {
        const p = pt(e);
        useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
          { label: 'Show Info', action: onDetail },
          { label: r.flagged ? 'Unflag' : 'Flag', action: () => onChange({ ...r, flagged: !r.flagged }) },
          { label: 'Due Today', action: () => onChange({ ...r, due: endOfToday() - 59000, dueHasTime: false }) },
          { separator: true },
          { label: 'Delete', action: onDelete },
        ]);
      }}
    >
      <button
        aria-label={r.completed ? 'Mark incomplete' : 'Complete'}
        className="w-[20px] h-[20px] rounded-full flex-none border-0 p-0 mt-[1px] grid place-items-center"
        style={{ boxShadow: r.completed ? 'none' : `inset 0 0 0 1.5px ${r.priority ? color : 'var(--text-3)'}`, background: r.completed ? color : 'transparent' }}
        onClick={() => onChange({ ...r, completed: !r.completed, completedAt: !r.completed ? Date.now() : undefined })}
      >
        {r.completed && <span className="w-[8px] h-[8px] rounded-full bg-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <input
          className="w-full bg-transparent border-0 outline-none text-[13px]"
          style={{ color: r.completed ? 'var(--text-3)' : undefined }}
          value={(r.priority ? '!'.repeat(r.priority) + ' ' : '') + r.title}
          onChange={(e) => onChange({ ...r, title: e.target.value.replace(/^!{1,3}\s/, '') })}
          aria-label="Reminder title"
        />
        {r.notes && <div className="text-[11.5px] muted truncate">{r.notes}</div>}
        <div className="flex gap-2 text-[11.5px]">
          {r.due && <span style={{ color: overdue ? '#ff3b30' : 'var(--text-2)' }}>{new Date(r.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{r.dueHasTime ? `, ${new Date(r.due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>}
          {showList && listName && <span className="muted">{listName}</span>}
        </div>
      </div>
      {r.flagged && <Flag size={13} className="text-[#ff9500] mt-[3px]" fill="#ff9500" />}
      <button className="tb-btn opacity-0 group-hover:opacity-100" aria-label="Show info" onClick={onDetail}><Info size={14} /></button>
    </div>
  );
}
