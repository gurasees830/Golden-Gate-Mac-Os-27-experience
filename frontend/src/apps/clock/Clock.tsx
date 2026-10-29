import { useEffect, useState } from 'react';
import { Plus, Trash2, Play, Pause, X } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useClockData, type Alarm, type Timer } from '../../stores/clockData';
import { useClock, timeIn } from '../../lib/clock';
import { Segmented, Toggle, ProgressRing, EmptyState } from '../../components/ui';
import { uid } from '../../lib/persist';
import { pad } from '../../lib/format';
import { useSettings } from '../../stores/settings';

const ALL_ZONES = ['America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Honolulu'];

function Analog({ d, size = 110 }: { d: Date; size?: number }) {
  const night = d.getHours() < 6 || d.getHours() >= 19;
  const fg = night ? '#fff' : '#1c1c1e';
  const h = d.getHours() % 12;
  const m = d.getMinutes();
  const s = d.getSeconds();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill={night ? '#1c1c1e' : '#fff'} stroke="rgba(128,128,128,.25)" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i + 1) * 30 * Math.PI) / 180;
        return <text key={`n${i}`} x={50 + Math.sin(a) * 37} y={50 - Math.cos(a) * 37 + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill={fg} fontFamily="Inter Variable, system-ui">{i + 1}</text>;
      })}
      <line x1="50" y1="50" x2="50" y2="27" stroke={fg} strokeWidth="3.4" strokeLinecap="round" transform={`rotate(${(h + m / 60) * 30} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="15" stroke={fg} strokeWidth="2.2" strokeLinecap="round" transform={`rotate(${(m + s / 60) * 6} 50 50)`} />
      <line x1="50" y1="58" x2="50" y2="12" stroke="#ff9500" strokeWidth="1" transform={`rotate(${s * 6} 50 50)`} />
      <circle cx="50" cy="50" r="2.4" fill="#ff9500" />
    </svg>
  );
}

function fmtDur(ms: number, cs = false) {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const c = Math.floor((t % 1000) / 10);
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}${cs ? `.${pad(c)}` : ''}`;
}

export default function ClockApp({ win }: AppProps) {
  const [tab, setTab] = useState<'world' | 'alarms' | 'stopwatch' | 'timers'>((win.args?.tab as 'world') ?? 'world');
  useMenus([{ title: 'View', items: [{ label: 'World Clock', shortcut: 'mod+1', action: () => setTab('world') }, { label: 'Alarms', shortcut: 'mod+2', action: () => setTab('alarms') }, { label: 'Stopwatch', shortcut: 'mod+3', action: () => setTab('stopwatch') }, { label: 'Timers', shortcut: 'mod+4', action: () => setTab('timers') }] }], []);
  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar className="chrome hairline-b" showTitle={false}>
        <div className="absolute left-1/2 -translate-x-1/2" data-no-drag>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'world', label: 'World Clock' }, { value: 'alarms', label: 'Alarms' }, { value: 'stopwatch', label: 'Stopwatch' }, { value: 'timers', label: 'Timers' }]} />
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 scroll">
        {tab === 'world' && <World />}
        {tab === 'alarms' && <Alarms />}
        {tab === 'stopwatch' && <Stopwatch />}
        {tab === 'timers' && <Timers />}
      </div>
    </div>
  );
}

function World() {
  const now = useClock(1000);
  const { cities, set } = useClockData();
  const [adding, setAdding] = useState(false);
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const h24 = useSettings((s) => s.menubar.clock.use24h);
  return (
    <div className="p-5">
      <div className="flex justify-end mb-3">
        {adding ? (
          <select autoFocus className="popup" defaultValue="" onChange={(e) => { if (e.target.value) set({ cities: [...cities, e.target.value] }); setAdding(false); }} onBlur={() => setAdding(false)}>
            <option value="" disabled>Choose a city…</option>
            {ALL_ZONES.filter((z) => !cities.includes(z)).map((z) => <option key={z} value={z}>{z.split('/')[1].replace(/_/g, ' ')}</option>)}
          </select>
        ) : (
          <button className="btn" onClick={() => setAdding(true)}><Plus size={13} /> Add City</button>
        )}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {cities.map((z) => {
          const t = timeIn(z, now.getTime());
          const diffH = Math.round((t.getTime() - timeIn(local, now.getTime()).getTime()) / 3600000);
          const dayDiff = t.getDate() !== timeIn(local, now.getTime()).getDate() ? (diffH > 0 ? 'Tomorrow' : 'Yesterday') : 'Today';
          return (
            <div key={z} className="group card p-4 flex flex-col items-center gap-2 relative">
              <button className="absolute right-2 top-2 tb-btn opacity-0 group-hover:opacity-100" aria-label={`Remove ${z}`} onClick={() => set({ cities: cities.filter((c) => c !== z) })}><X size={13} /></button>
              <Analog d={t} />
              <div className="font-semibold">{z.split('/')[1].replace(/_/g, ' ')}</div>
              <div className="text-[11.5px] muted">{dayDiff}, {diffH === 0 ? 'same time' : `${diffH > 0 ? '+' : ''}${diffH} hrs`}</div>
              <div className="text-[18px] font-light tabular-nums">{t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !h24 })}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Alarms() {
  const { alarms, set } = useClockData();
  const [edit, setEdit] = useState<Alarm | null>(null);
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const save = (a: Alarm) => {
    set({ alarms: alarms.some((x) => x.id === a.id) ? alarms.map((x) => (x.id === a.id ? a : x)) : [...alarms, a].sort((x, y) => x.hour * 60 + x.minute - (y.hour * 60 + y.minute)) });
    setEdit(null);
  };
  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[12px] muted">Alarms ring with a notification and sound while Golden Gate is open.</div>
        <button className="btn" onClick={() => setEdit({ id: uid('al'), hour: 7, minute: 0, label: 'Alarm', days: [], enabled: true })}><Plus size={13} /> Add Alarm</button>
      </div>
      {alarms.length === 0 && !edit && <EmptyState title="No Alarms" />}
      {edit && (
        <div className="card p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input type="time" className="field !w-[130px] !text-[18px] !h-[34px]" value={`${pad(edit.hour)}:${pad(edit.minute)}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setEdit({ ...edit, hour: h, minute: m }); }} />
            <input className="field flex-1" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Label" />
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-[12px] mr-2">Repeat</span>
            {days.map((d, i) => (
              <button key={i} className="w-[26px] h-[26px] rounded-full border-0 text-[11px] font-semibold" style={{ background: edit.days.includes(i) ? 'var(--accent)' : 'var(--field)', color: edit.days.includes(i) ? '#fff' : 'inherit' }} onClick={() => setEdit({ ...edit, days: edit.days.includes(i) ? edit.days.filter((x) => x !== i) : [...edit.days, i] })}>{d}</button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" onClick={() => save(edit)}>Save</button>
          </div>
        </div>
      )}
      {alarms.map((a) => (
        <div key={a.id} className="flex items-center py-3 hairline-b gap-3">
          <div className="flex-1 cursor-default" onClick={() => setEdit(a)} style={{ opacity: a.enabled ? 1 : 0.45 }}>
            <div className="text-[34px] font-light tabular-nums leading-none">{pad(a.hour)}:{pad(a.minute)}</div>
            <div className="text-[12px] muted mt-1">{a.label}{a.days.length ? `, ${a.days.length === 7 ? 'every day' : a.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' ')}` : ''}</div>
          </div>
          <button className="tb-btn" aria-label="Delete alarm" onClick={() => set({ alarms: alarms.filter((x) => x.id !== a.id) })}><Trash2 size={14} /></button>
          <Toggle on={a.enabled} onChange={(v) => set({ alarms: alarms.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)) })} />
        </div>
      ))}
    </div>
  );
}

function Stopwatch() {
  const { stopwatch: sw, set } = useClockData();
  const [, force] = useState(0);
  useEffect(() => {
    if (!sw.startedAt) return;
    let raf = 0;
    const loop = () => {
      force((x) => x + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sw.startedAt]);
  const elapsed = sw.elapsed + (sw.startedAt ? Date.now() - sw.startedAt : 0);
  const lapTimes = sw.laps.map((l, i) => l - (sw.laps[i - 1] ?? 0));
  const best = lapTimes.length > 1 ? Math.min(...lapTimes) : -1;
  const worst = lapTimes.length > 1 ? Math.max(...lapTimes) : -1;
  return (
    <div className="flex flex-col items-center p-6 gap-5">
      <div className="text-[72px] font-extralight tabular-nums tracking-tight">{fmtDur(elapsed, true)}</div>
      <div className="flex gap-10">
        <button className="w-[72px] h-[72px] rounded-full border-0 text-[14px]" style={{ background: 'var(--field)' }} onClick={() => (sw.startedAt ? set({ stopwatch: { ...sw, laps: [...sw.laps, elapsed] } }) : set({ stopwatch: { startedAt: null, elapsed: 0, laps: [] } }))}>
          {sw.startedAt || !elapsed ? 'Lap' : 'Reset'}
        </button>
        <button className="w-[72px] h-[72px] rounded-full border-0 text-[14px] font-medium" style={{ background: sw.startedAt ? 'rgba(255,59,48,.2)' : 'rgba(52,199,89,.22)', color: sw.startedAt ? '#ff453a' : '#30d158' }} onClick={() => set({ stopwatch: sw.startedAt ? { ...sw, startedAt: null, elapsed } : { ...sw, startedAt: Date.now() } })}>
          {sw.startedAt ? 'Stop' : 'Start'}
        </button>
      </div>
      <div className="w-full max-w-[420px]">
        {[...lapTimes].reverse().map((t, ri) => {
          const i = lapTimes.length - 1 - ri;
          return (
            <div key={i} className="flex justify-between py-2 hairline-b text-[14px] tabular-nums" style={{ color: t === best ? '#30d158' : t === worst ? '#ff453a' : undefined }}>
              <span>Lap {i + 1}</span>
              <span>{fmtDur(t, true)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Timers() {
  const { timers, set } = useClockData();
  const [h, setH] = useState(0);
  const [m, setM] = useState(5);
  const [s, setS] = useState(0);
  const [label, setLabel] = useState('');
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const start = (ms: number, lbl = label) => {
    if (ms <= 0) return;
    const t: Timer = { id: uid('t'), label: lbl || fmtDur(ms), duration: ms, endsAt: Date.now() + ms, remaining: ms };
    set({ timers: [t, ...timers] });
  };
  const upd = (id: string, p: Partial<Timer>) => set({ timers: useClockData.getState().timers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        {[['h', h, setH, 23], ['m', m, setM, 59], ['s', s, setS, 59]].map(([k, v, fn, max]) => (
          <label key={k as string} className="flex items-center gap-1 text-[12px]">
            <input type="number" min={0} max={max as number} className="field !w-[64px] !text-[18px] !h-[34px] text-center" value={v as number} onChange={(e) => (fn as (n: number) => void)(Math.max(0, Math.min(max as number, Number(e.target.value) || 0)))} />
            {k === 'h' ? 'hours' : k === 'm' ? 'min' : 'sec'}
          </label>
        ))}
        <input className="field !w-[140px]" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn primary" onClick={() => start((h * 3600 + m * 60 + s) * 1000)}>Start</button>
        <div className="w-full flex gap-2 flex-wrap">
          {[1, 3, 5, 10, 15, 30, 60].map((min) => (
            <button key={min} className="btn pill" onClick={() => start(min * 60000, `${min} min`)}>{min < 60 ? `${min} min` : '1 hr'}</button>
          ))}
        </div>
      </div>
      {timers.length === 0 && <EmptyState title="No Timers" subtitle="Timers keep running and notify you even if you close this window." />}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {timers.map((t) => {
          const rem = t.endsAt ? t.endsAt - Date.now() : t.remaining;
          return (
            <div key={t.id} className="card p-4 flex items-center gap-3">
              <div className="relative">
                <ProgressRing value={t.done ? 1 : 1 - rem / t.duration} size={56} stroke={4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[22px] font-light tabular-nums">{t.done ? 'Done' : fmtDur(rem)}</div>
                <div className="text-[11.5px] muted truncate">{t.label}</div>
              </div>
              {!t.done && (
                <button className="tb-btn" aria-label={t.endsAt ? 'Pause' : 'Resume'} onClick={() => (t.endsAt ? upd(t.id, { endsAt: null, remaining: rem }) : upd(t.id, { endsAt: Date.now() + t.remaining }))}>
                  {t.endsAt ? <Pause size={15} /> : <Play size={15} />}
                </button>
              )}
              <button className="tb-btn" aria-label="Cancel timer" onClick={() => set({ timers: timers.filter((x) => x.id !== t.id) })}><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
