import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, Calculator, Globe, Settings as Gear, FileText, Users, CalendarDays, CheckCircle2, Mail } from 'lucide-react';
import { useSystem } from '../stores/system';
import { useSettings } from '../stores/settings';
import { useFs, pathString } from '../stores/fs';
import { useApps, isInstalled } from '../stores/apps';
import { useNotes, noteTitle, useContacts, contactName, useCalendar, useReminders, useMail } from '../stores/data';
import { allApps, storeMatch } from '../lib/appRegistry';
import { AppIcon } from '../icons/AppIcon';
import { FileIcon } from '../icons/FileIcon';
import { evaluate, formatNumber, looksLikeMath } from '../lib/calc';
import { PANES } from '../apps/settingsPanes';
import { openApp, openFile, openSettings } from './actions';
import { copyText } from '../lib/download';

interface Result {
  key: string;
  category: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  run: () => void;
  preview?: ReactNode;
}

function score(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 40;
  // initials match ("ss" → System Settings)
  const initials = n.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(q)) return 50;
  return 0;
}

export function Spotlight() {
  const open = useSystem((s) => s.spotlight);
  const set = useSystem((s) => s.set);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cats = useSettings((s) => s.spotlight);
  const nodes = useFs((s) => s.nodes);
  const appsState = useApps();
  const notes = useNotes((s) => s.notes);
  const contacts = useContacts((s) => s.contacts);
  const events = useCalendar((s) => s.events);
  const reminders = useReminders((s) => s.items);
  const mail = useMail((s) => s.messages);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out: Result[] = [];
    const close = () => set({ spotlight: false });
    if (cats.calculator && looksLikeMath(query.replace(/^calc\s+/, '')) ) {
      try {
        const v = evaluate(query.replace(/^calc\s+/, ''));
        const txt = formatNumber(v);
        out.push({ key: 'calc', category: 'Calculator', title: `= ${txt}`, subtitle: `${q} — press Return to copy`, icon: <Calculator size={22} />, run: () => void copyText(txt, `Copied ${txt}`) });
      } catch {
        /* not a valid expression */
      }
    }
    if (cats.apps) {
      allApps()
        .filter((a) => !a.hidden && isInstalled(a.id, appsState))
        .map((a) => ({ a, s: score(a.name, query) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 6)
        .forEach(({ a }) =>
          out.push({ key: `app:${a.id}`, category: 'Applications', title: a.name, subtitle: 'Application', icon: <AppIcon id={a.id} size={26} />, run: () => { close(); openApp(a.id); }, preview: <AppPreview id={a.id} /> }),
        );
    }
    if (cats.settings) {
      PANES.filter((p) => score(p.label, query) > 0 || p.keywords.includes(query))
        .slice(0, 4)
        .forEach((p) =>
          out.push({ key: `pane:${p.id}`, category: 'System Settings', title: p.label, subtitle: 'System Settings', icon: <div className="w-[24px] h-[24px] rounded-[6px] grid place-items-center text-white" style={{ background: p.color }}><Gear size={14} /></div>, run: () => { close(); openSettings(p.id); } }),
        );
    }
    if (cats.files || cats.folders) {
      Object.values(nodes)
        .filter((n) => !n.trashed && n.parentId !== null && ((n.kind === 'file' && cats.files) || (n.kind === 'folder' && cats.folders)))
        .map((n) => ({ n, s: score(n.name, query) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || y.n.modifiedAt - x.n.modifiedAt)
        .slice(0, 8)
        .forEach(({ n }) =>
          out.push({
            key: `fs:${n.id}`,
            category: n.kind === 'folder' ? 'Folders' : 'Documents',
            title: n.name,
            subtitle: pathString(nodes, n.parentId!),
            icon: <FileIcon node={n} size={26} />,
            run: () => { close(); openFile(n.id); },
            preview: <FilePreview id={n.id} />,
          }),
        );
    }
    if (cats.notes)
      notes
        .filter((n) => !n.deletedAt)
        .map((n) => ({ n, t: noteTitle(n.html) }))
        .filter(({ n, t }) => t.title.toLowerCase().includes(query) || n.html.toLowerCase().includes(query))
        .slice(0, 4)
        .forEach(({ n, t }) => out.push({ key: `note:${n.id}`, category: 'Notes', title: t.title, subtitle: t.preview || 'No additional text', icon: <FileText size={20} className="text-[#ffc400]" />, run: () => { close(); openApp('notes', { noteId: n.id }); } }));
    if (cats.contacts)
      contacts
        .filter((c) => contactName(c).toLowerCase().includes(query) || c.emails.some((e) => e.value.includes(query)))
        .slice(0, 4)
        .forEach((c) => out.push({ key: `contact:${c.id}`, category: 'Contacts', title: contactName(c), subtitle: c.emails[0]?.value ?? c.phones[0]?.value ?? 'Contact', icon: <Users size={20} className="text-[#a2845e]" />, run: () => { close(); openApp('contacts', { contactId: c.id }); } }));
    if (cats.events)
      events
        .filter((e) => e.title.toLowerCase().includes(query))
        .slice(0, 4)
        .forEach((e) => out.push({ key: `ev:${e.id}`, category: 'Events', title: e.title, subtitle: new Date(e.start).toLocaleString(), icon: <CalendarDays size={20} className="text-[#ff3b30]" />, run: () => { close(); openApp('calendar', { date: e.start, eventId: e.id }); } }));
    if (cats.reminders)
      reminders
        .filter((r) => r.title.toLowerCase().includes(query))
        .slice(0, 4)
        .forEach((r) => out.push({ key: `rem:${r.id}`, category: 'Reminders', title: r.title, subtitle: r.completed ? 'Completed' : 'Reminder', icon: <CheckCircle2 size={20} className="text-[#007aff]" />, run: () => { close(); openApp('reminders', { reminderId: r.id }); } }));
    if (cats.mail)
      mail
        .filter((m) => m.mailbox !== 'trash' && (m.subject.toLowerCase().includes(query) || m.from.name.toLowerCase().includes(query)))
        .slice(0, 3)
        .forEach((m) => out.push({ key: `mail:${m.id}`, category: 'Mail', title: m.subject || '(No Subject)', subtitle: m.from.name, icon: <Mail size={20} className="text-[#1670ef]" />, run: () => { close(); openApp('mail', { messageId: m.id }); } }));
    if (cats.store)
      allApps()
        .filter((a) => a.store && !isInstalled(a.id, appsState) && storeMatch(a, query) > 0)
        .sort((x, y) => storeMatch(y, query) - storeMatch(x, query))
        .slice(0, 6)
        .forEach((a) => out.push({ key: `store:${a.id}`, category: 'App Store', title: a.name, subtitle: `Get on the App Store · ${a.store!.subtitle}`, icon: <AppIcon id={a.id} size={26} />, run: () => { close(); openApp('appstore', { appId: a.id }); } }));
    out.push({
      key: 'web',
      category: 'Web',
      title: `Search the web for “${q.trim()}”`,
      subtitle: 'Opens Safari',
      icon: <Globe size={20} className="text-[#007aff]" />,
      run: () => { close(); openApp('safari', { url: `golden-gate://search?q=${encodeURIComponent(q.trim())}` }); },
    });
    return out;
  }, [q, cats, nodes, appsState, notes, contacts, events, reminders, mail, set]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;
  const current = results[sel];
  const grouped: { category: string; items: { r: Result; i: number }[] }[] = [];
  results.forEach((r, i) => {
    let g = grouped.find((x) => x.category === r.category);
    if (!g) grouped.push((g = { category: r.category, items: [] }));
    g.items.push({ r, i });
  });

  return (
    <div className="absolute inset-0 z-[9300]" onPointerDown={() => set({ spotlight: false })}>
      <div
        className="absolute left-1/2 top-[18%] -translate-x-1/2 w-[680px] max-w-[92vw] rounded-[26px] glass-strong liquid anim-pop overflow-hidden"
        style={{ color: 'var(--text)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 h-[58px]">
          <Search size={22} className="opacity-60 flex-none" />
          <input
            ref={inputRef}
            aria-label="Spotlight Search"
            className="flex-1 bg-transparent border-0 outline-none text-[22px] font-light"
            placeholder="Spotlight Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                current?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                set({ spotlight: false });
              }
            }}
          />
        </div>
        {results.length > 0 && (
          <div className="flex hairline-t" style={{ height: 380 }}>
            <div className="w-[300px] scroll py-1 hairline-r flex-none">
              {grouped.map((g) => (
                <div key={g.category}>
                  <div className="text-[11px] font-semibold px-4 pt-2 pb-1" style={{ color: 'var(--text-2)' }}>
                    {g.category}
                  </div>
                  {g.items.map(({ r, i }) => (
                    <div
                      key={r.key}
                      className="mx-[6px] px-[10px] h-[34px] rounded-[9px] flex items-center gap-[10px]"
                      style={{ background: i === sel ? 'var(--accent)' : undefined, color: i === sel ? '#fff' : undefined }}
                      onPointerEnter={() => setSel(i)}
                      onClick={() => r.run()}
                    >
                      <div className="w-[26px] flex-none grid place-items-center">{r.icon}</div>
                      <div className="truncate text-[13px]">{r.title}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0 p-5 flex flex-col items-center justify-center text-center gap-2">
              {current?.preview ?? (
                <>
                  <div className="scale-[1.6] mb-3">{current?.icon}</div>
                  <div className="text-[16px] font-semibold">{current?.title}</div>
                  <div className="text-[12px] muted break-all">{current?.subtitle}</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppPreview({ id }: { id: string }) {
  const def = allApps().find((a) => a.id === id);
  return (
    <>
      <AppIcon id={id} size={96} />
      <div className="text-[17px] font-semibold mt-1">{def?.name}</div>
      <div className="text-[12px] muted">{def?.category} · Application</div>
      {def?.store?.subtitle && <div className="text-[12px] muted max-w-[260px]">{def.store.subtitle}</div>}
    </>
  );
}

function FilePreview({ id }: { id: string }) {
  const n = useFs((s) => s.nodes[id]);
  const nodes = useFs((s) => s.nodes);
  if (!n) return null;
  return (
    <>
      <FileIcon node={n} size={110} />
      <div className="text-[15px] font-semibold mt-1 break-all">{n.name}</div>
      <div className="text-[11.5px] muted">{pathString(nodes, n.id)}</div>
      <div className="text-[11.5px] muted">Modified {new Date(n.modifiedAt).toLocaleString()}</div>
    </>
  );
}
