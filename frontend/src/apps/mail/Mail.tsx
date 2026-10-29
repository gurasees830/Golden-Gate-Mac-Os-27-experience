import { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, Send, FileText, Trash2, Archive, Flag, ShieldAlert, SquarePen, Reply, Forward, MailOpen, X } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindow } from '../../shell/windowContext';
import { useMail, type Mailbox, type MailMessage } from '../../stores/data';
import { useSettings } from '../../stores/settings';
import { SearchField, EmptyState, Avatar } from '../../components/ui';
import { uid } from '../../lib/persist';
import { notify } from '../../stores/notifications';
import { relativeDay } from '../../lib/format';
import { pt } from '../../lib/screen';
import { useSystem } from '../../stores/system';

const BOXES: { id: Mailbox | 'flagged'; label: string; icon: React.ReactNode }[] = [
  { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} /> },
  { id: 'flagged', label: 'Flagged', icon: <Flag size={16} /> },
  { id: 'drafts', label: 'Drafts', icon: <FileText size={16} /> },
  { id: 'sent', label: 'Sent', icon: <Send size={16} /> },
  { id: 'junk', label: 'Junk', icon: <ShieldAlert size={16} /> },
  { id: 'trash', label: 'Trash', icon: <Trash2 size={16} /> },
  { id: 'archive', label: 'Archive', icon: <Archive size={16} /> },
];

export default function Mail({ win }: AppProps) {
  const { messages, upsert, set } = useMail();
  const acct = useSettings((s) => s.user.accountName);
  const fullName = useSettings((s) => s.user.fullName);
  const me = `${acct}@golden-gate.local`;
  const { focused } = useWindow();
  const [box, setBox] = useState<Mailbox | 'flagged'>('inbox');
  const [sel, setSel] = useState<string | null>((win.args?.messageId as string) ?? null);
  const [q, setQ] = useState('');
  const [compose, setCompose] = useState<MailMessage | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = win.args?.messageId as string | undefined;
    if (id) {
      const m = messages.find((x) => x.id === id);
      if (m) {
        setBox(m.mailbox);
        setSel(id);
      }
    }
    if (win.args?.compose) newMessage(String(win.args.to ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const list = useMemo(
    () =>
      messages
        .filter((m) => (box === 'flagged' ? m.flagged && m.mailbox !== 'trash' : m.mailbox === box))
        .filter((m) => !q || `${m.subject} ${m.from.name} ${m.from.email} ${m.body} ${m.to}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.date - a.date),
    [messages, box, q],
  );
  const msg = messages.find((m) => m.id === sel);

  useEffect(() => {
    if (msg && !msg.read) upsert({ ...msg, read: true });
  }, [msg, upsert]);

  const newMessage = (to = '', subject = '', body = '') => setCompose({ id: uid('mail'), mailbox: 'drafts', from: { name: fullName, email: me }, to, cc: '', subject, body, date: Date.now(), read: true, flagged: false });
  const reply = (fwd = false) => {
    if (!msg) return;
    const quoted = `\n\nOn ${new Date(msg.date).toLocaleString()}, ${msg.from.name} <${msg.from.email}> wrote:\n> ${msg.body.split('\n').join('\n> ')}`;
    newMessage(fwd ? '' : msg.from.email, `${fwd ? 'Fwd' : 'Re'}: ${msg.subject.replace(/^(Re|Fwd): /i, '')}`, quoted);
  };
  const del = (m = msg) => {
    if (!m) return;
    if (m.mailbox === 'trash') set({ messages: messages.filter((x) => x.id !== m.id) });
    else upsert({ ...m, mailbox: 'trash' });
    setSel(null);
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New Message', shortcut: 'mod+n', action: () => newMessage() }] },
      { title: 'Edit', items: [{ label: 'Find', shortcut: 'mod+f', action: () => searchRef.current?.focus() }] },
      { title: 'Message', items: [{ label: 'Reply', shortcut: 'mod+r', disabled: !msg, action: () => reply() }, { label: 'Forward', shortcut: 'mod+shift+f', disabled: !msg, action: () => reply(true) }, { separator: true }, { label: msg?.read ? 'Mark as Unread' : 'Mark as Read', shortcut: 'mod+shift+u', disabled: !msg, action: () => msg && upsert({ ...msg, read: !msg.read }) }, { label: msg?.flagged ? 'Unflag' : 'Flag', shortcut: 'mod+shift+l', disabled: !msg, action: () => msg && upsert({ ...msg, flagged: !msg.flagged }) }, { label: 'Archive', shortcut: 'mod+ctrl+a', disabled: !msg, action: () => msg && (upsert({ ...msg, mailbox: 'archive' }), setSel(null)) }, { label: 'Move to Junk', disabled: !msg, action: () => msg && (upsert({ ...msg, mailbox: 'junk' }), setSel(null)) }, { label: 'Delete', shortcut: 'mod+backspace', disabled: !msg, action: () => del() }] },
      { title: 'Mailbox', items: [{ label: 'Erase Deleted Items…', action: () => set({ messages: messages.filter((m) => m.mailbox !== 'trash') }) }] },
    ],
    [msg?.id, msg?.read, msg?.flagged, messages.length],
  );

  const count = (b: Mailbox | 'flagged') => (b === 'inbox' ? messages.filter((m) => m.mailbox === 'inbox' && !m.read).length : b === 'drafts' ? messages.filter((m) => m.mailbox === 'drafts').length : 0);

  return (
    <div className="flex h-full min-h-0 relative">
      <div className="w-[190px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="scroll flex-1 px-[10px]">
          <div className="sb-heading">Favorites</div>
          {BOXES.map((b) => (
            <div key={b.id} className={`sb-item accent ${box === b.id ? 'active' : ''}`} onClick={() => { setBox(b.id); setSel(null); }}>
              <span className="sb-ico">{b.icon}</span>
              <span className="flex-1">{b.label}</span>
              {count(b.id) > 0 && <span className="text-[11px] opacity-70">{count(b.id)}</span>}
            </div>
          ))}
          <div className="sb-heading">Account</div>
          <div className="text-[11.5px] muted px-2 leading-snug">{me}<br />Local delivery only</div>
        </div>
      </div>
      <div className="w-[300px] flex-none hairline-r flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="hairline-b !px-3 !gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[13px]">{BOXES.find((b) => b.id === box)?.label}</div>
            <div className="text-[11px] muted">{list.length} messages{box === 'inbox' && count('inbox') ? `, ${count('inbox')} unread` : ''}</div>
          </div>
          <button className="tb-btn" data-no-drag aria-label="New message" onClick={() => newMessage()}><SquarePen size={16} /></button>
        </TitleBar>
        <div className="p-2 hairline-b"><SearchField ref={searchRef} width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search mail" /></div>
        <div className="scroll flex-1">
          {list.length === 0 && <EmptyState title="No Messages" />}
          {list.map((m) => {
            const active = m.id === sel;
            return (
              <div
                key={m.id}
                className="px-4 py-[9px] hairline-b relative cursor-default"
                style={{ background: active ? (focused ? 'var(--accent)' : 'var(--press)') : undefined, color: active && focused ? '#fff' : undefined }}
                onClick={() => (m.mailbox === 'drafts' ? setCompose(m) : setSel(m.id))}
                onContextMenu={(e) => {
                  const p = pt(e);
                  useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
                    { label: m.read ? 'Mark as Unread' : 'Mark as Read', action: () => upsert({ ...m, read: !m.read }) },
                    { label: m.flagged ? 'Unflag' : 'Flag', action: () => upsert({ ...m, flagged: !m.flagged }) },
                    { label: 'Move to', submenu: (['inbox', 'archive', 'junk', 'trash'] as Mailbox[]).map((b) => ({ label: b[0].toUpperCase() + b.slice(1), action: () => upsert({ ...m, mailbox: b }) })) },
                    { separator: true },
                    { label: 'Delete', action: () => del(m) },
                  ]);
                }}
              >
                {!m.read && <span className="absolute left-[6px] top-[14px] w-[7px] h-[7px] rounded-full" style={{ background: active && focused ? '#fff' : 'var(--accent)' }} />}
                <div className="flex justify-between gap-2">
                  <span className="font-semibold truncate text-[13px]">{m.mailbox === 'sent' || m.mailbox === 'drafts' ? `To: ${m.to || '—'}` : m.from.name}</span>
                  <span className="text-[11px] opacity-60 flex-none">{relativeDay(new Date(m.date), new Date()) === 'Today' ? new Date(m.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : relativeDay(new Date(m.date), new Date())}</span>
                </div>
                <div className="text-[12.5px] truncate flex items-center gap-1">{m.flagged && <Flag size={10} fill="#ff9500" color="#ff9500" />}{m.subject || '(No Subject)'}</div>
                <div className="text-[12px] opacity-60 line-clamp-2 leading-snug">{m.body.replace(/\n+/g, ' ')}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="hairline-b !justify-end !gap-1">
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Archive" disabled={!msg} onClick={() => msg && (upsert({ ...msg, mailbox: 'archive' }), setSel(null))}><Archive size={15} /></button>
            <button className="tb-btn" aria-label="Delete" disabled={!msg} onClick={() => del()}><Trash2 size={15} /></button>
            <button className="tb-btn" aria-label="Junk" disabled={!msg} onClick={() => msg && (upsert({ ...msg, mailbox: 'junk' }), setSel(null))}><ShieldAlert size={15} /></button>
          </div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Reply" disabled={!msg} onClick={() => reply()}><Reply size={15} /></button>
            <button className="tb-btn" aria-label="Forward" disabled={!msg} onClick={() => reply(true)}><Forward size={15} /></button>
            <button className="tb-btn" aria-label="Flag" disabled={!msg} onClick={() => msg && upsert({ ...msg, flagged: !msg.flagged })}><Flag size={15} fill={msg?.flagged ? '#ff9500' : 'none'} color={msg?.flagged ? '#ff9500' : 'currentColor'} /></button>
            <button className="tb-btn" aria-label="Mark unread" disabled={!msg} onClick={() => msg && upsert({ ...msg, read: false })}><MailOpen size={15} /></button>
          </div>
        </TitleBar>
        {msg ? (
          <div className="flex-1 scroll px-7 py-5">
            <div className="flex gap-3 items-start pb-4 hairline-b">
              <Avatar name={msg.from.name} color="#8e8e93" size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{msg.from.name} <span className="font-normal muted text-[12px]">&lt;{msg.from.email}&gt;</span></div>
                <div className="font-semibold text-[15px] mt-1">{msg.subject || '(No Subject)'}</div>
                <div className="text-[12px] muted">To: {msg.to}{msg.cc ? ` · Cc: ${msg.cc}` : ''}</div>
              </div>
              <div className="text-[12px] muted">{new Date(msg.date).toLocaleString()}</div>
            </div>
            <div className="pt-4 text-[14px] leading-relaxed whitespace-pre-wrap selectable">{msg.body}</div>
          </div>
        ) : (
          <EmptyState title="No Message Selected" />
        )}
      </div>
      {compose && (
        <Composer
          draft={compose}
          me={me}
          onClose={(save) => {
            if (save && (compose.subject || compose.body || compose.to)) upsert({ ...compose, mailbox: 'drafts', date: Date.now() });
            setCompose(null);
          }}
          onChange={setCompose}
          onSend={(m) => {
            const sent = { ...m, mailbox: 'sent' as Mailbox, date: Date.now() };
            set({ messages: [sent, ...useMail.getState().messages.filter((x) => x.id !== m.id)] });
            const recipients = `${m.to},${m.cc}`.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
            if (recipients.includes(me.toLowerCase())) {
              setTimeout(() => {
                upsert({ ...m, id: uid('mail'), mailbox: 'inbox', read: false, date: Date.now() });
                notify({ appId: 'mail', title: m.from.name, body: m.subject || '(No Subject)', open: { appId: 'mail' } });
              }, 1200);
            }
            const external = recipients.filter((r) => !r.endsWith('@golden-gate.local'));
            if (external.length) useSystem.getState().showToast(`Saved to Sent. ${external.join(', ')} is outside the simulator, so it wasn’t delivered.`);
            setCompose(null);
          }}
        />
      )}
    </div>
  );
}

function Composer({ draft, me, onChange, onClose, onSend }: { draft: MailMessage; me: string; onChange: (m: MailMessage) => void; onClose: (save: boolean) => void; onSend: (m: MailMessage) => void }) {
  // autosave drafts while typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.to || draft.subject || draft.body) useMail.getState().upsert({ ...draft, mailbox: 'drafts', date: Date.now() });
    }, 800);
    return () => clearTimeout(t);
  }, [draft]);
  return (
    <div className="absolute inset-0 z-30 grid place-items-center" style={{ background: 'rgba(0,0,0,.15)' }}>
      <div className="w-[620px] max-w-[94%] h-[460px] max-h-[94%] rounded-[16px] flex flex-col overflow-hidden anim-pop" style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-window)' }}>
        <div className="h-[44px] flex items-center px-3 gap-2 chrome hairline-b">
          <button className="tb-btn" aria-label="Close" onClick={() => onClose(true)}><X size={15} /></button>
          <div className="flex-1 text-center font-semibold">{draft.subject || 'New Message'}</div>
          <button className="btn primary" disabled={!draft.to.trim()} onClick={() => onSend(draft)}><Send size={13} /> Send</button>
        </div>
        {(['to', 'cc', 'subject'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 px-4 h-[34px] hairline-b text-[13px]">
            <span className="muted w-[56px] capitalize">{k === 'cc' ? 'Cc' : k}:</span>
            <input autoFocus={k === 'to'} className="flex-1 bg-transparent border-0 outline-none" value={draft[k]} onChange={(e) => onChange({ ...draft, [k]: e.target.value })} placeholder={k === 'to' ? me : ''} />
          </label>
        ))}
        <div className="flex items-center gap-2 px-4 h-[30px] hairline-b text-[12px] muted">From: {draft.from.name} &lt;{me}&gt;</div>
        <textarea className="flex-1 p-4 border-0 outline-none resize-none text-[14px] leading-relaxed bg-transparent" value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })} aria-label="Message body" />
        <div className="px-4 py-2 text-[11px] muted hairline-t">Drafts save automatically. Mail stays inside this simulator; only addresses ending in @golden-gate.local receive it.</div>
      </div>
    </div>
  );
}
