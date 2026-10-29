import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idb, registerHydration, uid } from '../lib/persist';

/* ------------------------------------------------------------------ Notes */
export interface Note {
  id: string;
  folderId: string;
  html: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  deletedAt?: number;
}
interface NotesState {
  notes: Note[];
  folders: { id: string; name: string }[];
  set: (p: Partial<NotesState>) => void;
  upsert: (n: Note) => void;
}
const WELCOME_NOTE = `<h1>Welcome to Notes</h1><div>Notes are saved automatically in this browser as you type.</div><div><br></div><ul><li>Use the toolbar to add headings, lists and checklists</li><li>Create folders in the sidebar</li><li>Search across every note with ⌘F</li></ul><div><br></div><ul class="checklist"><li data-checked="true">Open Notes</li><li data-checked="false">Write your first note</li></ul>`;
export const useNotes = create<NotesState>()(
  persist(
    (set) => ({
      notes: [{ id: 'note-welcome', folderId: 'notes', html: WELCOME_NOTE, createdAt: Date.now(), updatedAt: Date.now(), pinned: true }],
      folders: [{ id: 'notes', name: 'Notes' }],
      set: (p) => set(p),
      upsert: (n) => set((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] })),
    }),
    idb<NotesState>('app.notes'),
  ),
);
registerHydration(useNotes);

export function noteTitle(html: string): { title: string; preview: string } {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (!div) return { title: 'New Note', preview: '' };
  div.innerHTML = html.replace(/<(div|p|h1|h2|h3|li|br)[^>]*>/gi, '\n<$1>');
  const lines = (div.textContent || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return { title: lines[0] || 'New Note', preview: lines.slice(1).join(' ').slice(0, 120) };
}

/* ------------------------------------------------------------------ Calendar */
export interface CalEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  calendar: string;
  notes: string;
  location: string;
  alert: number | null; // minutes before
  alerted?: boolean;
}
export interface CalDef {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}
interface CalendarState {
  events: CalEvent[];
  calendars: CalDef[];
  set: (p: Partial<CalendarState>) => void;
  upsert: (e: CalEvent) => void;
  remove: (id: string) => void;
}
export const useCalendar = create<CalendarState>()(
  persist(
    (set) => ({
      events: [],
      calendars: [
        { id: 'home', name: 'Home', color: '#007aff', visible: true },
        { id: 'work', name: 'Work', color: '#ff9500', visible: true },
        { id: 'family', name: 'Family', color: '#34c759', visible: true },
        { id: 'personal', name: 'Personal', color: '#af52de', visible: true },
      ],
      set: (p) => set(p),
      upsert: (e) => set((s) => ({ events: s.events.some((x) => x.id === e.id) ? s.events.map((x) => (x.id === e.id ? e : x)) : [...s.events, e] })),
      remove: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
    }),
    idb<CalendarState>('app.calendar'),
  ),
);
registerHydration(useCalendar);

/* ------------------------------------------------------------------ Reminders */
export interface Reminder {
  id: string;
  listId: string;
  title: string;
  notes: string;
  due: number | null;
  dueHasTime: boolean;
  priority: 0 | 1 | 2 | 3;
  flagged: boolean;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  notified?: boolean;
}
interface RemindersState {
  lists: { id: string; name: string; color: string }[];
  items: Reminder[];
  set: (p: Partial<RemindersState>) => void;
  upsert: (r: Reminder) => void;
  remove: (id: string) => void;
}
export const useReminders = create<RemindersState>()(
  persist(
    (set) => ({
      lists: [
        { id: 'reminders', name: 'Reminders', color: '#007aff' },
        { id: 'work', name: 'Work', color: '#ff9500' },
      ],
      items: [
        { id: uid('r'), listId: 'reminders', title: 'Try installing an app from the App Store', notes: '', due: null, dueHasTime: false, priority: 0, flagged: true, completed: false, createdAt: Date.now() },
        { id: uid('r'), listId: 'reminders', title: 'Change the wallpaper in System Settings', notes: '', due: null, dueHasTime: false, priority: 0, flagged: false, completed: false, createdAt: Date.now() },
      ],
      set: (p) => set(p),
      upsert: (r) => set((s) => ({ items: s.items.some((x) => x.id === r.id) ? s.items.map((x) => (x.id === r.id ? r : x)) : [...s.items, r] })),
      remove: (id) => set((s) => ({ items: s.items.filter((r) => r.id !== id) })),
    }),
    idb<RemindersState>('app.reminders'),
  ),
);
registerHydration(useReminders);

/* ------------------------------------------------------------------ Contacts */
export interface Contact {
  id: string;
  first: string;
  last: string;
  company: string;
  phones: { label: string; value: string }[];
  emails: { label: string; value: string }[];
  address: string;
  birthday: string;
  notes: string;
  color: string;
  groupIds: string[];
  isMe?: boolean;
  isBot?: boolean;
}
interface ContactsState {
  contacts: Contact[];
  groups: { id: string; name: string }[];
  set: (p: Partial<ContactsState>) => void;
  upsert: (c: Contact) => void;
  remove: (id: string) => void;
}
export const BOT_ID = 'contact-assistant';
export const useContacts = create<ContactsState>()(
  persist(
    (set) => ({
      contacts: [
        { id: 'contact-me', first: 'Guest', last: '', company: '', phones: [], emails: [{ label: 'home', value: 'guest@golden-gate.local' }], address: '', birthday: '', notes: 'This is your card.', color: '#ff9f0a', groupIds: [], isMe: true },
        { id: BOT_ID, first: 'Golden Gate', last: 'Assistant', company: 'Golden Gate Simulator', phones: [], emails: [{ label: 'work', value: 'assistant@golden-gate.local' }], address: '', birthday: '', notes: 'A built-in bot you can message. It runs entirely in your browser.', color: '#5e5ce6', groupIds: [], isBot: true },
      ],
      groups: [],
      set: (p) => set(p),
      upsert: (c) => set((s) => ({ contacts: s.contacts.some((x) => x.id === c.id) ? s.contacts.map((x) => (x.id === c.id ? c : x)) : [...s.contacts, c] })),
      remove: (id) => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),
    }),
    idb<ContactsState>('app.contacts'),
  ),
);
registerHydration(useContacts);

export function contactName(c: Contact) {
  return [c.first, c.last].filter(Boolean).join(' ') || c.company || 'No Name';
}

/* ------------------------------------------------------------------ Mail */
export type Mailbox = 'inbox' | 'drafts' | 'sent' | 'junk' | 'trash' | 'archive';
export interface MailMessage {
  id: string;
  mailbox: Mailbox;
  from: { name: string; email: string };
  to: string;
  cc: string;
  subject: string;
  body: string;
  date: number;
  read: boolean;
  flagged: boolean;
}
interface MailState {
  messages: MailMessage[];
  set: (p: Partial<MailState>) => void;
  upsert: (m: MailMessage) => void;
}
const now = Date.now();
export const useMail = create<MailState>()(
  persist(
    (set) => ({
      messages: [
        {
          id: 'mail-welcome',
          mailbox: 'inbox',
          from: { name: 'Golden Gate', email: 'welcome@golden-gate.local' },
          to: 'guest@golden-gate.local',
          cc: '',
          subject: 'Welcome to Mail',
          body: 'Hi there,\n\nThis Mail app is a local simulator. Messages you send are stored in your browser only — nothing is sent over the internet.\n\nTry it: compose a message to your own address (guest@golden-gate.local) and it will arrive in your Inbox.\n\n— Golden Gate',
          date: now - 3600000,
          read: false,
          flagged: false,
        },
        {
          id: 'mail-tips',
          mailbox: 'inbox',
          from: { name: 'Golden Gate Tips', email: 'tips@golden-gate.local' },
          to: 'guest@golden-gate.local',
          cc: '',
          subject: 'Five things to try today',
          body: '1. Press Ctrl+Space to open Spotlight and type “calc 12*7”.\n2. Drag a window to the screen edge to tile it.\n3. Open System Settings → Wallpaper and choose the dynamic Golden Gate wallpaper.\n4. Install Weather from the App Store.\n5. Open Terminal and type `help`.',
          date: now - 7200000,
          read: false,
          flagged: true,
        },
      ],
      set: (p) => set(p),
      upsert: (m) => set((s) => ({ messages: s.messages.some((x) => x.id === m.id) ? s.messages.map((x) => (x.id === m.id ? m : x)) : [m, ...s.messages] })),
    }),
    idb<MailState>('app.mail'),
  ),
);
registerHydration(useMail);

/* ------------------------------------------------------------------ Messages */
export interface ChatMessage {
  id: string;
  from: 'me' | 'them';
  text: string;
  time: number;
  reaction?: string;
}
export interface Conversation {
  id: string;
  name: string;
  contactId?: string;
  messages: ChatMessage[];
  unread: number;
  pinned: boolean;
}
interface MessagesState {
  conversations: Conversation[];
  set: (p: Partial<MessagesState>) => void;
  update: (id: string, fn: (c: Conversation) => Conversation) => void;
}
export const useMessages = create<MessagesState>()(
  persist(
    (set) => ({
      conversations: [
        {
          id: 'conv-assistant',
          name: 'Golden Gate Assistant',
          contactId: BOT_ID,
          pinned: true,
          unread: 1,
          messages: [{ id: 'm0', from: 'them', text: 'Hi! I’m a built-in bot that runs in your browser. Type “help” to see what I can do.', time: now - 600000 }],
        },
      ],
      set: (p) => set(p),
      update: (id, fn) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) })),
    }),
    idb<MessagesState>('app.messages'),
  ),
);
registerHydration(useMessages);
