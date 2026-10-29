import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, MessageCircle, Mail as MailIcon, Video, Users, Share, Phone } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useContacts, contactName, type Contact } from '../../stores/data';
import { SearchField, Avatar, EmptyState } from '../../components/ui';
import { uid } from '../../lib/persist';
import { confirmDialog, promptDialog, useSystem } from '../../stores/system';
import { openApp } from '../../shell/actions';
import { copyText, saveToHost } from '../../lib/download';
import { pt } from '../../lib/screen';

const COLORS = ['#ff9f0a', '#ff375f', '#bf5af2', '#5e5ce6', '#0a84ff', '#30d158', '#64d2ff', '#a2845e'];

function vcard(c: Contact) {
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${c.last};${c.first};;;`, `FN:${contactName(c)}`, c.company && `ORG:${c.company}`, ...c.phones.map((p) => `TEL;TYPE=${p.label}:${p.value}`), ...c.emails.map((e) => `EMAIL;TYPE=${e.label}:${e.value}`), c.address && `ADR;TYPE=home:;;${c.address.replace(/\n/g, ' ')};;;;`, c.birthday && `BDAY:${c.birthday}`, c.notes && `NOTE:${c.notes.replace(/\n/g, '\\n')}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}

export default function Contacts({ win }: AppProps) {
  const { contacts, groups, upsert, remove, set } = useContacts();
  const [group, setGroup] = useState<string>('all');
  const [sel, setSel] = useState<string | null>((win.args?.contactId as string) ?? contacts[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);

  useEffect(() => {
    if (win.args?.contactId) setSel(win.args.contactId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const list = useMemo(
    () =>
      contacts
        .filter((c) => group === 'all' || c.groupIds.includes(group))
        .filter((c) => !q || `${contactName(c)} ${c.company} ${c.emails.map((e) => e.value).join(' ')} ${c.phones.map((p) => p.value).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : (a.last || a.first).localeCompare(b.last || b.first))),
    [contacts, group, q],
  );
  const cur = contacts.find((c) => c.id === sel);

  const add = () => {
    const c: Contact = { id: uid('c'), first: '', last: '', company: '', phones: [{ label: 'mobile', value: '' }], emails: [{ label: 'home', value: '' }], address: '', birthday: '', notes: '', color: COLORS[contacts.length % COLORS.length], groupIds: group === 'all' ? [] : [group] };
    setEditing(c);
    setSel(c.id);
  };
  const del = async (c = cur) => {
    if (!c || c.isMe) return;
    if (!(await confirmDialog(`Delete ${contactName(c)}?`, 'This contact will be removed.', 'Delete', { icon: 'warning' }))) return;
    remove(c.id);
    setSel(null);
  };
  const newGroup = async () => {
    const name = await promptDialog('New Group', 'Group name:', 'New Group');
    if (!name) return;
    const g = { id: uid('g'), name };
    set({ groups: [...groups, g] });
    setGroup(g.id);
  };

  useMenus([{ title: 'File', items: [{ label: 'New Contact', shortcut: 'mod+n', action: add }, { label: 'New Group', shortcut: 'mod+shift+n', action: () => void newGroup() }, { separator: true }, { label: 'Export vCard…', disabled: !cur, action: () => cur && void saveToHost(new Blob([vcard(cur)], { type: 'text/vcard' }), `${contactName(cur)}.vcf`) }] }, { title: 'Card', items: [{ label: 'Edit Card', shortcut: 'mod+l', disabled: !cur, action: () => cur && setEditing({ ...cur }) }, { label: 'Delete Card', disabled: !cur || cur.isMe, action: () => void del() }] }], [cur?.id, group]);

  const letters = new Map<string, Contact[]>();
  for (const c of list) {
    const k = c.isMe ? '★' : (c.last || c.first || c.company || '#')[0]?.toUpperCase() ?? '#';
    letters.set(k, [...(letters.get(k) ?? []), c]);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[180px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="scroll flex-1 px-[10px]">
          <div className="sb-heading">On My Mac</div>
          <div className={`sb-item accent ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}><span className="sb-ico"><Users size={15} /></span>All Contacts</div>
          {groups.map((g) => (
            <div key={g.id} className={`sb-item accent ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)} onContextMenu={(e) => { const p = pt(e); useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [{ label: 'Delete Group', action: () => { set({ groups: groups.filter((x) => x.id !== g.id), contacts: contacts.map((c) => ({ ...c, groupIds: c.groupIds.filter((i) => i !== g.id) })) }); setGroup('all'); } }]); }}>
              <span className="sb-ico"><Users size={15} /></span><span className="truncate">{g.name}</span>
            </div>
          ))}
        </div>
        <button className="btn ghost m-2 !justify-start" onClick={() => void newGroup()}><Plus size={13} /> New Group</button>
      </div>
      <div className="w-[240px] flex-none hairline-r flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="!px-2">
          <SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search contacts" />
        </TitleBar>
        <div className="scroll flex-1 px-2">
          {[...letters.entries()].map(([l, cs]) => (
            <div key={l}>
              <div className="text-[11px] font-semibold muted px-2 pt-2 pb-1 hairline-b">{l}</div>
              {cs.map((c) => (
                <div key={c.id} className={`list-row ${sel === c.id ? 'selected' : ''}`} style={{ height: 28 }} onClick={() => { setSel(c.id); setEditing(null); }}>
                  <span className="truncate"><b>{c.first}</b> {c.last}{!c.first && !c.last ? c.company || 'No Name' : ''}{c.isMe && <span className="opacity-60 text-[11px]"> (me)</span>}</span>
                </div>
              ))}
            </div>
          ))}
          {list.length === 0 && <div className="text-center muted text-[12px] mt-6">No Contacts</div>}
        </div>
        <div className="h-[34px] hairline-t flex items-center px-2 gap-1">
          <button className="tb-btn" aria-label="Add contact" onClick={add}><Plus size={15} /></button>
          <span className="text-[11px] muted ml-auto pr-2">{list.length} cards</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="!justify-end !px-3">
          {cur && !editing && (
            <div className="tb-group" data-no-drag>
              <button className="tb-btn" aria-label="Share" onClick={() => void copyText(vcard(cur), 'vCard copied.')}><Share size={15} /></button>
            </div>
          )}
        </TitleBar>
        {editing ? (
          <Editor c={editing} groups={groups} onChange={setEditing} onCancel={() => { setEditing(null); if (!contacts.some((c) => c.id === editing.id)) setSel(contacts[0]?.id ?? null); }} onSave={() => { upsert(editing); setEditing(null); }} />
        ) : cur ? (
          <div className="flex-1 scroll px-10 py-6">
            <div className="flex items-center gap-5 mb-5">
              <Avatar name={contactName(cur)} color={cur.color} size={84} />
              <div>
                <div className="text-[24px] font-bold">{contactName(cur)}</div>
                {cur.company && <div className="muted">{cur.company}</div>}
              </div>
            </div>
            <div className="flex gap-3 mb-6">
              {[
                { label: 'message', icon: <MessageCircle size={16} />, run: () => openApp('messages', { contactId: cur.id }) },
                { label: 'call', icon: <Phone size={16} />, run: () => openApp('facetime', { contactId: cur.id, audio: true }) },
                { label: 'video', icon: <Video size={16} />, run: () => openApp('facetime', { contactId: cur.id }) },
                { label: 'mail', icon: <MailIcon size={16} />, run: () => openApp('mail', { compose: true, to: cur.emails[0]?.value ?? '' }), disabled: !cur.emails[0]?.value },
              ].map((a) => (
                <button key={a.label} disabled={a.disabled} className="flex flex-col items-center gap-1 border-0 bg-transparent disabled:opacity-40" onClick={a.run}>
                  <span className="w-[38px] h-[38px] rounded-full grid place-items-center text-white" style={{ background: 'var(--accent)' }}>{a.icon}</span>
                  <span className="text-[11px]" style={{ color: 'var(--accent)' }}>{a.label}</span>
                </button>
              ))}
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-[13px] selectable">
              {cur.phones.filter((p) => p.value).map((p, i) => (<Fragment key={`p${i}`}><dt className="text-right pr-4 muted text-[12px]">{p.label}</dt><dd>{p.value}</dd></Fragment>))}
              {cur.emails.filter((e) => e.value).map((e, i) => (<Fragment key={`e${i}`}><dt className="text-right pr-4 muted text-[12px]">{e.label}</dt><dd className="link" onClick={() => openApp('mail', { compose: true, to: e.value })}>{e.value}</dd></Fragment>))}
              {cur.address && (<><dt className="text-right pr-4 muted text-[12px]">address</dt><dd className="whitespace-pre-wrap">{cur.address}</dd></>)}
              {cur.birthday && (<><dt className="text-right pr-4 muted text-[12px]">birthday</dt><dd>{new Date(cur.birthday).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></>)}
              {cur.notes && (<><dt className="text-right pr-4 muted text-[12px]">note</dt><dd className="whitespace-pre-wrap">{cur.notes}</dd></>)}
            </dl>
            <div className="flex gap-2 mt-8">
              <button className="btn" onClick={() => setEditing({ ...cur })}>Edit</button>
              {!cur.isMe && <button className="btn" onClick={() => void del()}><Trash2 size={13} /> Delete</button>}
            </div>
          </div>
        ) : (
          <EmptyState title="No Card Selected" action={<button className="btn" onClick={add}>New Contact</button>} />
        )}
      </div>
    </div>
  );
}

function Editor({ c, groups, onChange, onCancel, onSave }: { c: Contact; groups: { id: string; name: string }[]; onChange: (c: Contact) => void; onCancel: () => void; onSave: () => void }) {
  const multi = (key: 'phones' | 'emails', labels: string[]) => (
    <div className="flex flex-col gap-2">
      {c[key].map((p, i) => (
        <div key={i} className="flex gap-2">
          <select className="popup !w-[100px]" value={p.label} onChange={(e) => onChange({ ...c, [key]: c[key].map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}>
            {labels.map((l) => <option key={l}>{l}</option>)}
          </select>
          <input className="field" type={key === 'emails' ? 'email' : 'tel'} placeholder={key === 'emails' ? 'Email' : 'Phone'} value={p.value} onChange={(e) => onChange({ ...c, [key]: c[key].map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
          <button className="btn ghost" aria-label="Remove" onClick={() => onChange({ ...c, [key]: c[key].filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
        </div>
      ))}
      <button className="btn ghost self-start text-[12px]" onClick={() => onChange({ ...c, [key]: [...c[key], { label: labels[0], value: '' }] })}><Plus size={12} /> add {key === 'phones' ? 'phone' : 'email'}</button>
    </div>
  );
  return (
    <div className="flex-1 scroll px-10 py-6 flex flex-col gap-3 max-w-[560px]">
      <div className="flex items-center gap-4">
        <Avatar name={`${c.first} ${c.last}`} color={c.color} size={70} />
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-2">
            <input autoFocus className="field" placeholder="First" value={c.first} onChange={(e) => onChange({ ...c, first: e.target.value })} />
            <input className="field" placeholder="Last" value={c.last} onChange={(e) => onChange({ ...c, last: e.target.value })} />
          </div>
          <input className="field" placeholder="Company" value={c.company} onChange={(e) => onChange({ ...c, company: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-1">{COLORS.map((col) => <button key={col} aria-label={col} className="w-[16px] h-[16px] rounded-full border-0" style={{ background: col, boxShadow: c.color === col ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)' : undefined }} onClick={() => onChange({ ...c, color: col })} />)}</div>
      {multi('phones', ['mobile', 'home', 'work', 'other'])}
      {multi('emails', ['home', 'work', 'other'])}
      <textarea className="field" rows={2} placeholder="Address" value={c.address} onChange={(e) => onChange({ ...c, address: e.target.value })} />
      <label className="flex items-center gap-2 text-[12.5px]">Birthday <input type="date" className="field !w-[170px]" value={c.birthday} onChange={(e) => onChange({ ...c, birthday: e.target.value })} /></label>
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[12.5px]">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-1"><input type="checkbox" className="check" checked={c.groupIds.includes(g.id)} onChange={(e) => onChange({ ...c, groupIds: e.target.checked ? [...c.groupIds, g.id] : c.groupIds.filter((x) => x !== g.id) })} />{g.name}</label>
          ))}
        </div>
      )}
      <textarea className="field" rows={3} placeholder="Notes" value={c.notes} onChange={(e) => onChange({ ...c, notes: e.target.value })} />
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={onSave}>Done</button>
      </div>
    </div>
  );
}
