import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idb, registerHydration, uid } from '../lib/persist';
import type { AppId, AppNotification } from '../types';
import { notifPref, useSettings } from './settings';
import { playAlert } from '../lib/sound';

interface NotificationsState {
  items: AppNotification[];
  banners: string[]; // ids currently shown as banners
  badges: Record<AppId, number>;
  dismiss: (id: string) => void;
  dismissBanner: (id: string) => void;
  clearApp: (appId: AppId) => void;
  clearAll: () => void;
  markAllRead: () => void;
  setBadge: (appId: AppId, n: number) => void;
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      banners: [],
      badges: {},
      dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id), banners: s.banners.filter((b) => b !== id) })),
      dismissBanner: (id) => set((s) => ({ banners: s.banners.filter((b) => b !== id) })),
      clearApp: (appId) => set((s) => ({ items: s.items.filter((n) => n.appId !== appId) })),
      clearAll: () => set({ items: [], banners: [] }),
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      setBadge: (appId, n) => set((s) => (s.badges[appId] === n ? s : { badges: { ...s.badges, [appId]: n } })),
    }),
    idb<NotificationsState>('notifications', {
      partialize: (s) => ({ items: s.items.slice(0, 60), badges: s.badges }) as NotificationsState,
    }),
  ),
);
registerHydration(useNotifications);

/** Reusable notification service used by every app. */
export function notify(n: { appId: AppId; title: string; body?: string; open?: AppNotification['open']; silent?: boolean }) {
  const pref = notifPref(n.appId);
  if (!pref.allow) return null;
  const s = useSettings.getState();
  const focusOn = !!s.focus.active && (!s.focus.until || s.focus.until > Date.now());
  const item: AppNotification = { id: uid('n'), appId: n.appId, title: n.title, body: n.body, time: Date.now(), read: false, open: n.open };
  useNotifications.setState((st) => ({
    items: [item, ...st.items].slice(0, 100),
    banners: !focusOn && pref.style !== 'none' ? [...st.banners, item.id].slice(-4) : st.banners,
  }));
  if (!focusOn && pref.sound && !n.silent) playAlert();
  if (pref.style === 'banners') {
    setTimeout(() => useNotifications.getState().dismissBanner(item.id), 6000);
  }
  return item.id;
}
