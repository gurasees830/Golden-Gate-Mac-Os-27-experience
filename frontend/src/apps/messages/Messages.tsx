import { useEffect, useMemo, useRef, useState } from 'react';
import { SquarePen, Info, Smile, ArrowUp, Pin, Trash2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindow } from '../../shell/windowContext';
import { useMessages, useContacts, contactName, useNotes, useReminders, BOT_ID, type Conversation, type ChatMessage } from '../../stores/data';
import { SearchField, Avatar, EmptyState } from '../../components/ui';
import { uid } from '../../lib/persist';
import { notify } from '../../stores/notifications';
import { useSystem } from '../../stores/system';
import { pt } from '../../lib/screen';
import { openApp } from '../../shell/actions';
import { evaluate, formatNumber, looksLikeMath } from '../../lib/calc';
import { systemNow } from '../../lib/clock';
import { allApps } from '../../lib/appRegistry';
import { replaceInTextarea } from '../../lib/textReplace';

const JOKES = [
  'Why did the developer go broke? Because he used up all his cache.',
  'I told my computer I needed a break, and it said “No problem — I’ll go to sleep.”',
  'Why do Java developers wear glasses? Because they don’t C#.',
  'There are 10 kinds of people: those who understand binary and those who don’t.',
  'The fog in San Francisco is so thick, even the bridge needs a flashlight.',
];

function botReply(text: string): string {
  const t = text.trim().toLowerCase();
  if (/^(hi|hello|hey|namaste|sat sri akal)\b/.test(t)) return `Hello! 👋 I’m the Golden Gate Assistant. Try “help”.`;
  if (t === 'help' || t === '?') return 'I can:\n• tell the time or date\n• do math (e.g. “12*7+3”)\n• “remind me to …” → adds a reminder\n• “note …” → creates a note\n• “open Notes” → opens an app\n• “joke”, “flip a coin”, “roll a die”';
  if (/\btime\b/.test(t)) return `It’s ${systemNow().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  if (/\b(date|today)\b/.test(t)) return `Today is ${systemNow().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
  if (/joke/.test(t)) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (/flip|coin/.test(t)) return Math.random() < 0.5 ? 'Heads.' : 'Tails.';
  if (/roll|dice|die\b/.test(t)) return `You rolled a ${1 + Math.floor(Math.random() * 6)}. 🎲`;
  const remind = text.match(/remind me to (.+)/i);
  if (remind) {
    useReminders.getState().upsert({ id: uid('r'), listId: 'reminders', title: remind[1].replace(/[.!]$/, ''), notes: 'Added from Messages', due: null, dueHasTime: false, priority: 0, flagged: false, completed: false, createdAt: Date.now() });
    return `Added “${remind[1]}” to Reminders. ✅`;
  }
  const note = text.match(/^note[:\s]+(.+)/i);
  if (note) {
    useNotes.getState().upsert({ id: uid('note'), folderId: 'notes', html: `<div>${note[1].replace(/</g, '&lt;')}</div>`, createdAt: Date.now(), updatedAt: Date.now(), pinned: false });
    return 'Saved to Notes. 📝';
  }
  const open = t.match(/^open (.+)/);
  if (open) {
    const app = allApps().find((a) => a.name.toLowerCase() === open[1].trim());
    if (app) {
      openApp(app.id);
      return `Opening ${app.name}…`;
    }
    return `I couldn’t find an app called “${open[1]}”.`;
  }
  if (looksLikeMath(t)) {
    try {
      return `= ${formatNumber(evaluate(t))}`;
    } catch {
      /* fall through */
    }
  }
  if (/thank/.test(t)) return 'You’re welcome! 😊';
  return 'I’m a simple local bot, so I didn’t understand that. Type “help” to see what I can do.';
}

const TAPBACKS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

export default function Messages({ win }: AppProps) {
  const { conversations, set, update } = useMessages();
  const contacts = useContacts((s) => s.contacts);
  const { focused } = useWindow();
  const [sel, setSel] = useState<string | null>(conversations[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const conv = conversations.find((c) => c.id === sel);

  useEffect(() => {
    if (conv && conv.unread && focused) update(conv.id, (c) => ({ ...c, unread: 0 }));
  }, [conv, focused, update]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e9 });
  }, [conv?.messages.length, sel, typing]);
  useEffect(() => {
    const cid = win.args?.contactId as string | undefined;
    if (!cid) return;
    const existing = conversations.find((c) => c.contactId === cid);
    if (existing) setSel(existing.id);
    else {
      const ct = contacts.find((c) => c.id === cid);
      if (ct) startConversation(contactName(ct), cid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const startConversation = (name: string, contactId?: string) => {
    const c: Conversation = { id: uid('conv'), name, contactId, messages: [], unread: 0, pinned: false };
    set({ conversations: [c, ...useMessages.getState().conversations] });
    setSel(c.id);
    setComposeTo(null);
    setTimeout(() => input.current?.focus(), 30);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !conv) return;
    const m: ChatMessage = { id: uid('m'), from: 'me', text, time: Date.now() };
    update(conv.id, (c) => ({ ...c, messages: [...c.messages, m] }));
    setDraft('');
    if (conv.contactId === BOT_ID) {
      const cid = conv.id;
      setTimeout(() => setTyping(cid), 300);
      setTimeout(() => {
        setTyping(null);
        const reply: ChatMessage = { id: uid('m'), from: 'them', text: botReply(text), time: Date.now() };
        const isFocused = isWindowFocused(win.id) && useMessages.getState().conversations.find((c) => c.id === cid) && sel === cid;
        update(cid, (c) => ({ ...c, messages: [...c.messages, reply], unread: isFocused ? 0 : c.unread + 1 }));
        if (!isFocused) notify({ appId: 'messages', title: conv.name, body: reply.text, open: { appId: 'messages' } });
      }, 1100 + Math.random() * 700);
    }
  };

  const list = useMemo(
    () =>
      conversations
        .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.messages.some((m) => m.text.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.messages[b.messages.length - 1]?.time ?? 0) - (a.messages[a.messages.length - 1]?.time ?? 0)),
    [conversations, q],
  );

  useMenus([{ title: 'File', items: [{ label: 'New Message', shortcut: 'mod+n', action: () => setComposeTo('') }, { separator: true }, { label: 'Delete Conversation…', disabled: !conv, action: () => conv && (set({ conversations: conversations.filter((c) => c.id !== conv.id) }), setSel(null)) }] }], [conv?.id, conversations.length]);

  const contactOf = (c: Conversation) => contacts.find((x) => x.id === c.contactId);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[270px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false}>
          <div className="ml-auto" data-no-drag>
            <button className="tb-btn" aria-label="New message" onClick={() => setComposeTo('')}><SquarePen size={16} /></button>
          </div>
        </TitleBar>
        <div className="px-3 pb-2"><SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search messages" /></div>
        <div className="scroll flex-1 px-2">
          {list.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const ct = contactOf(c);
            const active = c.id === sel;
            return (
              <div
                key={c.id}
                className="flex items-center gap-[10px] p-2 rounded-[10px] mb-[2px]"
                style={{ background: active ? (focused ? 'var(--accent)' : 'var(--press)') : undefined, color: active && focused ? '#fff' : undefined }}
                onClick={() => { setSel(c.id); setComposeTo(null); }}
                onContextMenu={(e) => {
                  const p = pt(e);
                  useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
                    { label: c.pinned ? 'Unpin' : 'Pin', icon: <Pin size={12} />, action: () => update(c.id, (x) => ({ ...x, pinned: !x.pinned })) },
                    { label: 'Mark as Unread', action: () => update(c.id, (x) => ({ ...x, unread: Math.max(1, x.unread) })) },
                    { separator: true },
                    { label: 'Delete Conversation', icon: <Trash2 size={12} />, action: () => { set({ conversations: conversations.filter((x) => x.id !== c.id) }); if (sel === c.id) setSel(null); } },
                  ]);
                }}
              >
                <div className="relative">
                  {c.unread > 0 && <span className="absolute -left-[9px] top-1/2 -translate-y-1/2 w-[8px] h-[8px] rounded-full bg-[var(--accent)]" style={{ background: active && focused ? '#fff' : undefined }} />}
                  <Avatar name={c.name} color={ct?.color ?? '#8e8e93'} size={40} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold truncate">{c.name}</span>
                    <span className="text-[11px] opacity-60 flex-none">{last ? new Date(last.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                  </div>
                  <div className="text-[12px] opacity-65 line-clamp-2 leading-snug">{last?.text ?? 'No messages'}</div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div className="text-[12px] muted text-center mt-6">No Conversations</div>}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="hairline-b !px-4">
          {composeTo !== null ? (
            <div className="flex items-center gap-2 flex-1" data-no-drag>
              <span className="muted">To:</span>
              <input autoFocus list="gg-contacts" className="flex-1 bg-transparent border-0 outline-none" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && composeTo.trim()) { const ct = contacts.find((c) => contactName(c).toLowerCase() === composeTo.trim().toLowerCase()); startConversation(ct ? contactName(ct) : composeTo.trim(), ct?.id); } }} placeholder="Name of a contact, or anything for a note-to-self thread" />
              <datalist id="gg-contacts">{contacts.filter((c) => !c.isMe).map((c) => <option key={c.id} value={contactName(c)} />)}</datalist>
            </div>
          ) : conv ? (
            <div className="flex-1 flex flex-col items-center">
              <div className="font-semibold text-[13px]">{conv.name}</div>
              <div className="text-[11px] muted">{conv.contactId === BOT_ID ? 'Built-in assistant' : 'Local conversation'}</div>
            </div>
          ) : <div className="flex-1" />}
          {conv && composeTo === null && <button className="tb-btn" data-no-drag aria-label="Contact info" onClick={() => conv.contactId && openApp('contacts', { contactId: conv.contactId })}><Info size={16} /></button>}
        </TitleBar>
        {!conv && composeTo === null ? (
          <EmptyState title="No Conversation Selected" />
        ) : (
          <>
            <div ref={scroller} className="flex-1 scroll px-5 py-4 flex flex-col gap-[3px]">
              {conv?.messages.map((m, i) => {
                const prev = conv.messages[i - 1];
                const showTime = !prev || m.time - prev.time > 15 * 60000;
                const me = m.from === 'me';
                return (
                  <div key={m.id}>
                    {showTime && <div className="text-center text-[11px] muted my-3">{new Date(m.time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
                    <div className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="relative max-w-[70%] px-[12px] py-[7px] text-[13.5px] leading-snug selectable whitespace-pre-wrap break-words"
                        style={{ background: me ? 'var(--accent)' : 'var(--bg-3)', color: me ? '#fff' : 'var(--text)', borderRadius: 18 }}
                        onDoubleClick={(e) => {
                          const p = pt(e);
                          useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, TAPBACKS.map((r) => ({ label: r, checked: m.reaction === r, action: () => update(conv.id, (c) => ({ ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, reaction: x.reaction === r ? undefined : r } : x)) })) })));
                        }}
                      >
                        {m.text}
                        {m.reaction && <span className="absolute -top-3 text-[14px] rounded-full px-[5px] glass-strong" style={{ [me ? 'left' : 'right']: -8 }}>{m.reaction}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {typing === conv?.id && (
                <div className="flex"><div className="px-4 py-3 rounded-[18px] flex gap-1" style={{ background: 'var(--bg-3)' }}>{[0, 1, 2].map((d) => <span key={d} className="w-[7px] h-[7px] rounded-full bg-[var(--text-3)]" style={{ animation: `gg-blink 1.2s ${d * 0.2}s infinite` }} />)}</div></div>
              )}
              {conv && conv.messages.length > 0 && conv.messages[conv.messages.length - 1].from === 'me' && conv.contactId !== BOT_ID && <div className="text-right text-[10.5px] muted">Saved locally</div>}
            </div>
            <div className="p-3 flex items-end gap-2">
              <div className="flex-1 flex items-end rounded-[18px] px-3 py-[6px]" style={{ boxShadow: 'inset 0 0 0 1px var(--separator)' }}>
                <textarea
                  ref={input}
                  rows={1}
                  aria-label="Message"
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[13.5px] max-h-[120px]"
                  placeholder={conv?.contactId === BOT_ID ? 'Message the assistant' : 'Message (stays on this device)'}
                  value={draft}
                  disabled={!conv}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const ie = e.nativeEvent as InputEvent;
                    if (ie.data && /[\s.,!?]/.test(ie.data) && replaceInTextarea(e.target)) setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <Smile size={17} className="opacity-50 flex-none ml-2 mb-[1px]" />
              </div>
              <button className="w-[30px] h-[30px] rounded-full border-0 grid place-items-center text-white flex-none" style={{ background: draft.trim() ? 'var(--accent)' : 'var(--text-3)' }} aria-label="Send" onClick={send}><ArrowUp size={16} strokeWidth={3} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useWindows } from '../../stores/windows';
function isWindowFocused(id: string) {
  const ws = useWindows.getState().windows.filter((w) => !w.minimized);
  if (!ws.length) return false;
  return ws.reduce((a, b) => (a.z > b.z ? a : b)).id === id;
}
