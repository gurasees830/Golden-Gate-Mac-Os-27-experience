import { useEffect, useState } from 'react';
import { useSettings } from '../stores/settings';

/**
 * Simulated system clock. Respects Date & Time settings (manual offset and an
 * optional time zone override). The returned Date's *local* getters reflect the
 * simulated wall-clock time.
 */
export function systemNow(): Date {
  const { dateTime } = useSettings.getState();
  const real = Date.now() + (dateTime.auto ? 0 : dateTime.offsetMs);
  if (!dateTime.timeZone || dateTime.timeZone === 'auto') return new Date(real);
  try {
    return new Date(new Date(real).toLocaleString('en-US', { timeZone: dateTime.timeZone }));
  } catch {
    return new Date(real);
  }
}

export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(systemNow);
  const auto = useSettings((s) => s.dateTime.auto);
  const offset = useSettings((s) => s.dateTime.offsetMs);
  const tz = useSettings((s) => s.dateTime.timeZone);
  useEffect(() => {
    setNow(systemNow());
    let t: number;
    const tick = () => {
      setNow(systemNow());
      const ms = intervalMs >= 60000 ? 60000 - (Date.now() % 60000) : intervalMs - (Date.now() % intervalMs);
      t = window.setTimeout(tick, ms + 5);
    };
    t = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    return () => window.clearTimeout(t);
  }, [intervalMs, auto, offset, tz]);
  return now;
}

export function zoneName(): string {
  const tz = useSettings.getState().dateTime.timeZone;
  if (tz && tz !== 'auto') return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function timeIn(zone: string, base = Date.now()): Date {
  try {
    return new Date(new Date(base).toLocaleString('en-US', { timeZone: zone }));
  } catch {
    return new Date(base);
  }
}

export function fmtTime(d: Date, opts: { seconds?: boolean; h24?: boolean } = {}): string {
  const s = useSettings.getState();
  const h24 = opts.h24 ?? s.menubar.clock.use24h;
  return d.toLocaleTimeString(s.region.locale, { hour: 'numeric', minute: '2-digit', second: opts.seconds ? '2-digit' : undefined, hour12: !h24 });
}
