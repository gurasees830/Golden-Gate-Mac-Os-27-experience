import { useEffect } from 'react';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { notify, useNotifications } from '../stores/notifications';
import { useClockData } from '../stores/clockData';
import { useCalendar, useMail, useMessages, useReminders } from '../stores/data';
import { systemNow } from '../lib/clock';
import { pt, deskSize } from '../lib/screen';
import { lockScreen, showDesktopToggle, sleep } from './actions';
import { playAlert } from '../lib/sound';
import { pad } from '../lib/format';
import { isInstalled } from '../stores/apps';

/** Background services: alarms, timers, event/reminder alerts, screen saver, hot corners, badges. */
export function useSystemTicker(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    window.addEventListener('pointermove', bump, { passive: true });
    window.addEventListener('keydown', bump);
    window.addEventListener('pointerdown', bump);

    const tick = () => {
      const now = systemNow();
      const nowMs = Date.now();
      const sys = useSystem.getState();
      const s = useSettings.getState();

      // Clock alarms
      const cd = useClockData.getState();
      const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;
      let alarmsChanged = false;
      const alarms = cd.alarms.map((a) => {
        if (!a.enabled || a.lastFired === stamp) return a;
        if (a.hour === now.getHours() && a.minute === now.getMinutes() && (a.days.length === 0 || a.days.includes(now.getDay()))) {
          alarmsChanged = true;
          notify({ appId: 'clock', title: a.label || 'Alarm', body: `${pad(a.hour)}:${pad(a.minute)}` });
          playAlert('Ripple');
          return { ...a, lastFired: stamp, enabled: a.days.length ? a.enabled : false };
        }
        return a;
      });
      if (alarmsChanged) cd.set({ alarms });
      // Timers
      let timersChanged = false;
      const timers = cd.timers.map((t) => {
        if (t.endsAt && t.endsAt <= nowMs && !t.done) {
          timersChanged = true;
          notify({ appId: 'clock', title: 'Timer Done', body: t.label || 'Your timer has finished.' });
          playAlert('Ripple');
          return { ...t, endsAt: null, remaining: 0, done: true };
        }
        return t;
      });
      if (timersChanged) cd.set({ timers });

      // Calendar alerts
      const cal = useCalendar.getState();
      let evChanged = false;
      const events = cal.events.map((e) => {
        if (e.alert == null || e.alerted) return e;
        if (e.start - e.alert * 60000 <= now.getTime() && e.end > now.getTime() - 60000) {
          evChanged = true;
          notify({ appId: 'calendar', title: e.title, body: e.alert === 0 ? 'Starting now' : `In ${e.alert} minutes`, open: { appId: 'calendar', args: { date: e.start, eventId: e.id } } });
          return { ...e, alerted: true };
        }
        return e;
      });
      if (evChanged) cal.set({ events });

      // Reminders due
      const rem = useReminders.getState();
      let rChanged = false;
      const items = rem.items.map((r) => {
        if (r.completed || r.notified || !r.due || !r.dueHasTime) return r;
        if (r.due <= now.getTime()) {
          rChanged = true;
          notify({ appId: 'reminders', title: r.title, body: 'Reminder', open: { appId: 'reminders', args: { reminderId: r.id } } });
          return { ...r, notified: true };
        }
        return r;
      });
      if (rChanged) rem.set({ items });

      // Focus expiry
      if (s.focus.active && s.focus.until && s.focus.until < nowMs) s.patch('focus', { active: null, until: null });

      // Badges
      const notif = useNotifications.getState();
      notif.setBadge('mail', useMail.getState().messages.filter((m) => m.mailbox === 'inbox' && !m.read).length);
      notif.setBadge('messages', useMessages.getState().conversations.reduce((a, c) => a + c.unread, 0));
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
      notif.setBadge('reminders', rem.items.filter((r) => !r.completed && r.due != null && r.due <= todayEnd).length);
      void isInstalled;

      // Screen saver
      if (sys.power === 'desktop' && !sys.screensaver && s.lockScreen.screensaverAfterMin > 0 && nowMs - lastActivity > s.lockScreen.screensaverAfterMin * 60000) {
        useSystem.getState().set({ screensaver: true });
      }
    };
    const t = window.setInterval(tick, 1000);

    // Hot corners
    let cornerTimer: number | null = null;
    let lastCorner: string | null = null;
    const onMove = (e: PointerEvent) => {
      const p = pt(e);
      const d = deskSize();
      const m = 2;
      const corner = p.x <= m && p.y <= m ? 'tl' : p.x >= d.w - m - 1 && p.y <= m ? 'tr' : p.x <= m && p.y >= d.h - m - 1 ? 'bl' : p.x >= d.w - m - 1 && p.y >= d.h - m - 1 ? 'br' : null;
      if (corner === lastCorner) return;
      lastCorner = corner;
      if (cornerTimer) window.clearTimeout(cornerTimer);
      if (!corner) return;
      cornerTimer = window.setTimeout(() => {
        const action = useSettings.getState().desktop.hotCorners[corner as 'tl' | 'tr' | 'bl' | 'br'];
        const sys = useSystem.getState();
        if (sys.power !== 'desktop') return;
        switch (action) {
          case 'launchpad':
            sys.set({ launchpad: !sys.launchpad });
            break;
          case 'notifications':
            sys.set({ notificationCenter: !sys.notificationCenter, controlCenter: false });
            break;
          case 'controlcenter':
            sys.set({ controlCenter: !sys.controlCenter, notificationCenter: false });
            break;
          case 'desktop':
            showDesktopToggle();
            break;
          case 'lock':
            lockScreen();
            break;
          case 'screensaver':
            sys.set({ screensaver: true });
            break;
          case 'sleep':
            sleep();
            break;
        }
      }, 280);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('pointerdown', bump);
    };
  }, [active]);
}
