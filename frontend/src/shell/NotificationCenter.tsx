import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useNotifications } from '../stores/notifications';
import { useSystem } from '../stores/system';
import { useSettings } from '../stores/settings';
import { useCalendar, useReminders } from '../stores/data';
import { appName } from '../lib/appRegistry';
import { AppIcon } from '../icons/AppIcon';
import { useClock, timeIn } from '../lib/clock';
import { openApp } from './actions';
import type { AppNotification } from '../types';
import { isInstalled } from '../stores/apps';

function ago(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

function Card({ n, onOpen, onClose, compact }: { n: AppNotification; onOpen: () => void; onClose: () => void; compact?: boolean }) {
  const previews = useSettings((s) => s.notifications.previews);
  return (
    <div className="group relative rounded-[20px] p-[11px] flex gap-[10px] glass-strong liquid cursor-default" style={{ color: 'var(--text)' }} onClick={onOpen}>
      <div className="flex-none pt-[1px]">
        <AppIcon id={n.appId} size={36} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="font-semibold text-[13px] truncate flex-1">{n.title}</div>
          <div className="text-[11px] muted flex-none">{ago(n.time)}</div>
        </div>
        {n.body && previews !== 'never' && <div className={`text-[12.5px] leading-snug ${compact ? 'truncate' : 'line-clamp-3'}`} style={{ color: 'var(--text)' }}>{n.body}</div>}
      </div>
      <button
        aria-label="Dismiss"
        className="absolute -left-[6px] -top-[6px] w-[20px] h-[20px] rounded-full border-0 grid place-items-center opacity-0 group-hover:opacity-100 glass-strong"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X size={11} strokeWidth={3} />
      </button>
    </div>
  );
}

export function Banners() {
  const banners = useNotifications((s) => s.banners);
  const items = useNotifications((s) => s.items);
  const dismissBanner = useNotifications((s) => s.dismissBanner);
  const ncOpen = useSystem((s) => s.notificationCenter);
  if (ncOpen) return null;
  const shown = banners.map((id) => items.find((n) => n.id === id)).filter(Boolean) as AppNotification[];
  return (
    <div className="absolute right-[10px] top-[38px] z-[9150] w-[350px] flex flex-col gap-2">
      {shown.map((n) => (
        <div key={n.id} className="anim-pop" style={{ animationDuration: '.3s' }}>
          <Card
            n={n}
            compact
            onOpen={() => {
              dismissBanner(n.id);
              openApp(n.open?.appId ?? n.appId, n.open?.args);
            }}
            onClose={() => dismissBanner(n.id)}
          />
        </div>
      ))}
    </div>
  );
}

function Widget({ children, title, onClick, className = '' }: { children: React.ReactNode; title?: string; onClick?: () => void; className?: string }) {
  return (
    <div className={`rounded-[22px] p-[14px] glass-strong liquid cursor-default ${className}`} style={{ color: 'var(--text)' }} onClick={onClick}>
      {title && <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-2)' }}>{title}</div>}
      {children}
    </div>
  );
}

function CalendarWidget() {
  const now = useClock(60000);
  const events = useCalendar((s) => s.events);
  const cals = useCalendar((s) => s.calendars);
  const upcoming = events
    .filter((e) => e.end >= now.getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 3);
  return (
    <Widget onClick={() => openApp('calendar')}>
      <div className="flex gap-3">
        <div className="flex-none">
          <div className="text-[11px] font-bold text-[#ff3b30] uppercase">{now.toLocaleDateString(undefined, { weekday: 'long' })}</div>
          <div className="text-[34px] font-light leading-none mt-1">{now.getDate()}</div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
          {upcoming.length === 0 && <div className="text-[12px] muted mt-1">No upcoming events</div>}
          {upcoming.map((e) => (
            <div key={e.id} className="flex gap-2 text-[12px]">
              <div className="w-[3px] rounded-full flex-none" style={{ background: cals.find((c) => c.id === e.calendar)?.color }} />
              <div className="min-w-0">
                <div className="font-semibold truncate">{e.title}</div>
                <div className="muted text-[11px]">{e.allDay ? 'All day' : new Date(e.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Widget>
  );
}

function RemindersWidget() {
  const items = useReminders((s) => s.items);
  const upsert = useReminders((s) => s.upsert);
  const open = items.filter((r) => !r.completed).slice(0, 4);
  return (
    <Widget title="Reminders" onClick={() => openApp('reminders')}>
      {open.length === 0 && <div className="text-[12px] muted">All done</div>}
      {open.map((r) => (
        <div key={r.id} className="flex items-center gap-2 py-[3px] text-[12.5px]">
          <button
            aria-label={`Complete ${r.title}`}
            className="w-[15px] h-[15px] rounded-full flex-none border-[1.5px] border-[var(--text-3)] bg-transparent p-0"
            onClick={(e) => {
              e.stopPropagation();
              upsert({ ...r, completed: true, completedAt: Date.now() });
            }}
          />
          <span className="truncate">{r.title}</span>
        </div>
      ))}
    </Widget>
  );
}

function ClockWidget() {
  const now = useClock(1000);
  const zones = ['America/Los_Angeles', 'Asia/Kolkata', 'Europe/London', 'Asia/Tokyo'];
  return (
    <Widget onClick={() => openApp('clock')}>
      <div className="grid grid-cols-4 gap-1">
        {zones.map((z) => {
          const t = timeIn(z, now.getTime());
          const h = t.getHours() % 12;
          const m = t.getMinutes();
          const night = t.getHours() < 6 || t.getHours() >= 19;
          return (
            <div key={z} className="flex flex-col items-center gap-1">
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="25" fill={night ? '#1c1c1e' : '#fff'} stroke="rgba(0,0,0,.1)" />
                {Array.from({ length: 12 }, (_, i) => (
                  <line key={i} x1="26" y1="4" x2="26" y2="7" stroke={night ? '#fff' : '#000'} strokeOpacity=".5" strokeWidth="1.2" transform={`rotate(${i * 30} 26 26)`} />
                ))}
                <line x1="26" y1="26" x2="26" y2="14" stroke={night ? '#fff' : '#000'} strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${(h + m / 60) * 30} 26 26)`} />
                <line x1="26" y1="26" x2="26" y2="8" stroke={night ? '#fff' : '#000'} strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${m * 6} 26 26)`} />
                <line x1="26" y1="30" x2="26" y2="7" stroke="#ff9500" strokeWidth=".8" transform={`rotate(${t.getSeconds() * 6} 26 26)`} />
              </svg>
              <div className="text-[10.5px] font-medium truncate max-w-full">{z.split('/')[1].replace('_', ' ')}</div>
            </div>
          );
        })}
      </div>
    </Widget>
  );
}

export function NotificationCenter() {
  const open = useSystem((s) => s.notificationCenter);
  const items = useNotifications((s) => s.items);
  const dismiss = useNotifications((s) => s.dismiss);
  const clearApp = useNotifications((s) => s.clearApp);
  const clearAll = useNotifications((s) => s.clearAll);
  const [expanded, setExpanded] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, AppNotification[]>();
    for (const n of items) {
      const arr = m.get(n.appId) ?? [];
      arr.push(n);
      m.set(n.appId, arr);
    }
    return [...m.entries()];
  }, [items]);
  if (!open) return null;
  return (
    <div className="absolute right-[8px] top-[34px] bottom-[8px] z-[9200] w-[364px] flex flex-col gap-[10px] overflow-y-auto scroll pb-4 anim-pop" onPointerDown={(e) => e.stopPropagation()}>
      {groups.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="text-[13px] font-semibold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
            Notifications
          </div>
          <button className="btn pill glass-strong" style={{ height: 22, fontSize: 11.5 }} onClick={clearAll}>
            Clear All
          </button>
        </div>
      )}
      {groups.map(([appId, list]) => {
        const isExp = expanded === appId || list.length === 1;
        return (
          <div key={appId} className="flex flex-col gap-[6px]">
            {list.length > 1 && isExp && (
              <div className="flex items-center justify-between px-1 text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
                <span className="text-[12px] font-semibold">{appName(appId)}</span>
                <span className="flex gap-1">
                  <button className="btn pill glass-strong" style={{ height: 20, fontSize: 11 }} onClick={() => setExpanded(null)}>
                    Show Less
                  </button>
                  <button className="btn pill glass-strong" style={{ height: 20, width: 20, padding: 0 }} aria-label="Clear" onClick={() => clearApp(appId)}>
                    <X size={11} />
                  </button>
                </span>
              </div>
            )}
            {(isExp ? list : list.slice(0, 1)).map((n) => (
              <div key={n.id} onClick={() => !isExp && setExpanded(appId)} className="relative">
                <Card
                  n={n}
                  onOpen={() => {
                    if (!isExp) {
                      setExpanded(appId);
                      return;
                    }
                    useSystem.getState().set({ notificationCenter: false });
                    openApp(n.open?.appId ?? n.appId, n.open?.args);
                  }}
                  onClose={() => dismiss(n.id)}
                />
                {!isExp && list.length > 1 && <div className="mx-3 h-[10px] -mt-[4px] rounded-b-[14px] glass-strong opacity-80" />}
              </div>
            ))}
          </div>
        );
      })}
      <CalendarWidget />
      <div className="grid grid-cols-1 gap-[10px]">
        <RemindersWidget />
        <ClockWidget />
        {isInstalled('weather') && <WeatherMini />}
      </div>
      <div className="text-center text-[11px] text-white/80" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
        Widgets update live from your apps.
      </div>
    </div>
  );
}

function WeatherMini() {
  return (
    <Widget onClick={() => openApp('weather')} className="!p-0 overflow-hidden">
      <div className="p-[14px] text-white" style={{ background: 'linear-gradient(#3a8ee6,#1f5fbf)' }}>
        <div className="text-[12px] font-semibold">Weather</div>
        <div className="text-[12px] opacity-85">Open Weather to see forecasts for your saved cities.</div>
      </div>
    </Widget>
  );
}
