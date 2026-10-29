import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Sparkles } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useCalendar, type CalEvent } from '../../stores/data';
import { useSettings } from '../../stores/settings';
import { useClock, systemNow } from '../../lib/clock';
import { Segmented, Checkbox } from '../../components/ui';
import { uid } from '../../lib/persist';
import { parseEvent } from '../../lib/nlDate';
import { pad } from '../../lib/format';

type View = 'day' | 'week' | 'month' | 'year';
const HOUR_H = 48;

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CalendarApp({ win }: AppProps) {
  const { events, calendars, upsert, remove, set } = useCalendar();
  const fdow = useSettings((s) => s.region.firstDayOfWeek);
  const locale = useSettings((s) => s.region.locale);
  const now = useClock(30000);
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState<Date>(win.args?.date ? new Date(win.args.date as number) : sod(systemNow()));
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [quick, setQuick] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (win.args?.date) setCursor(sod(new Date(win.args.date as number)));
    if (win.args?.eventId) {
      const e = events.find((x) => x.id === win.args!.eventId);
      if (e) setEditing(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  useEffect(() => {
    if ((view === 'week' || view === 'day') && scroller.current) scroller.current.scrollTop = HOUR_H * 7.5;
  }, [view]);

  const visibleCals = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
  const visible = events.filter((e) => visibleCals.has(e.calendar));
  const colorOf = (id: string) => calendars.find((c) => c.id === id)?.color ?? '#007aff';

  const weekStart = useMemo(() => {
    const d = sod(cursor);
    const diff = (d.getDay() - fdow + 7) % 7;
    return addDays(d, -diff);
  }, [cursor, fdow]);

  const step = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else setCursor(new Date(cursor.getFullYear() + dir, 0, 1));
  };

  const newEvent = (start?: Date, allDay = false) => {
    const s = start ?? new Date(sod(cursor).getTime() + (now.getHours() + 1) * 3600000);
    setEditing({ id: uid('ev'), title: 'New Event', start: s.getTime(), end: s.getTime() + (allDay ? 86400000 - 60000 : 3600000), allDay, calendar: calendars[0].id, notes: '', location: '', alert: allDay ? null : 15 });
  };

  const quickAdd = () => {
    if (!quick.trim()) return;
    const p = parseEvent(quick, systemNow());
    const ev: CalEvent = { id: uid('ev'), title: p.title, start: p.start.getTime(), end: p.end.getTime(), allDay: p.allDay, calendar: calendars[0].id, notes: '', location: '', alert: p.allDay ? null : 15 };
    upsert(ev);
    setCursor(sod(p.start));
    setQuick('');
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New Event', shortcut: 'mod+n', action: () => newEvent() }, { label: 'New Calendar', action: () => set({ calendars: [...calendars, { id: uid('cal'), name: 'Calendar', color: ['#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e'][calendars.length % 4], visible: true }] }) }] },
      { title: 'View', items: [{ label: 'Day', shortcut: 'mod+1', checked: view === 'day', action: () => setView('day') }, { label: 'Week', shortcut: 'mod+2', checked: view === 'week', action: () => setView('week') }, { label: 'Month', shortcut: 'mod+3', checked: view === 'month', action: () => setView('month') }, { label: 'Year', shortcut: 'mod+4', checked: view === 'year', action: () => setView('year') }, { separator: true }, { label: 'Go to Today', shortcut: 'mod+t', action: () => setCursor(sod(systemNow())) }, { label: 'Previous', shortcut: 'mod+arrowleft', action: () => step(-1) }, { label: 'Next', shortcut: 'mod+arrowright', action: () => step(1) }] },
    ],
    [view, cursor, calendars],
  );

  const title =
    view === 'day'
      ? cursor.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'year'
        ? String(cursor.getFullYear())
        : cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const dayEvents = (d: Date) => visible.filter((e) => new Date(e.start) < addDays(d, 1) && new Date(e.end) > d).sort((a, b) => a.start - b.start);

  return (
    <div className="flex h-full min-h-0 relative">
      <div className="w-[220px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3">
          <MiniMonth cursor={cursor} onPick={(d) => { setCursor(d); if (view === 'month' || view === 'year') setView('day'); }} fdow={fdow} events={visible} />
        </div>
        <div className="px-3 mt-4 flex-1 scroll">
          <div className="sb-heading !px-0">On My Mac</div>
          {calendars.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-[3px] text-[13px]">
              <input type="checkbox" className="check" style={{ background: c.visible ? c.color : undefined }} checked={c.visible} onChange={(e) => set({ calendars: calendars.map((x) => (x.id === c.id ? { ...x, visible: e.target.checked } : x)) })} aria-label={c.name} />
              <input className="bg-transparent border-0 outline-none flex-1 min-w-0" value={c.name} onChange={(e) => set({ calendars: calendars.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="chrome hairline-b !gap-2" style={{ paddingLeft: 12 }}>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="New event" onClick={() => newEvent()}><Plus size={16} /></button>
          </div>
          <form className="search-field !w-[260px]" data-no-drag onSubmit={(e) => { e.preventDefault(); quickAdd(); }}>
            <Sparkles size={13} className="flex-none text-[var(--accent)]" />
            <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add: “Lunch tomorrow at 1pm”" aria-label="Quick add event" />
          </form>
          <div className="flex-1" />
          <div data-no-drag>
            <Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
          </div>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
            <button className="tb-btn !px-3 text-[12.5px]" onClick={() => setCursor(sod(systemNow()))}>Today</button>
            <button className="tb-btn" aria-label="Next" onClick={() => step(1)}><ChevronRight size={16} /></button>
          </div>
        </TitleBar>
        <div className="px-5 pt-3 pb-2 text-[24px] font-bold">{title}</div>

        {view === 'month' && (
          <div className="flex-1 min-h-0 flex flex-col px-2 pb-2">
            <div className="grid grid-cols-7 text-[11px] font-semibold muted text-right px-1">
              {Array.from({ length: 7 }, (_, i) => <div key={i} className="pr-2 pb-1">{addDays(weekStart, i).toLocaleDateString(locale, { weekday: 'short' })}</div>)}
            </div>
            <div className="flex-1 grid grid-cols-7 grid-rows-6 hairline-t hairline-l">
              {(() => {
                const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
                const start = addDays(first, -((first.getDay() - fdow + 7) % 7));
                return Array.from({ length: 42 }, (_, i) => {
                  const d = addDays(start, i);
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const isToday = sameDay(d, now);
                  const evs = dayEvents(d);
                  return (
                    <div key={i} className="hairline-r hairline-b p-1 min-h-0 overflow-hidden" onDoubleClick={() => newEvent(new Date(d.getTime() + 9 * 3600000))}>
                      <div className="flex justify-end">
                        <span className="text-[12px] w-[22px] h-[22px] grid place-items-center rounded-full" style={{ background: isToday ? '#ff3b30' : undefined, color: isToday ? '#fff' : inMonth ? undefined : 'var(--text-3)', fontWeight: isToday ? 700 : 500 }}>{d.getDate()}</span>
                      </div>
                      {evs.slice(0, 3).map((e) => (
                        <div key={e.id} className="text-[11px] truncate rounded-[4px] px-1 mt-[2px] cursor-default" style={{ background: e.allDay ? colorOf(e.calendar) : `color-mix(in srgb, ${colorOf(e.calendar)} 16%, transparent)`, color: e.allDay ? '#fff' : undefined }} onClick={() => setEditing(e)}>
                          {!e.allDay && <span className="w-[6px] h-[6px] rounded-full inline-block mr-1" style={{ background: colorOf(e.calendar) }} />}
                          {e.title}
                        </div>
                      ))}
                      {evs.length > 3 && <div className="text-[10.5px] muted pl-1">{evs.length - 3} more</div>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {(view === 'week' || view === 'day') && (
          <TimeGrid days={view === 'day' ? [sod(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))} events={visible} colorOf={colorOf} now={now} locale={locale} scroller={scroller} onEdit={setEditing} onCreate={(d) => newEvent(d)} onMove={(e, start) => upsert({ ...e, start, end: start + (e.end - e.start), alerted: false })} />
        )}

        {view === 'year' && (
          <div className="flex-1 scroll grid grid-cols-4 gap-6 p-5">
            {Array.from({ length: 12 }, (_, m) => (
              <button key={m} className="border-0 bg-transparent text-left p-0" onClick={() => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView('month'); }}>
                <div className="text-[#ff3b30] font-semibold text-[13px] mb-1">{new Date(2000, m, 1).toLocaleDateString(locale, { month: 'long' })}</div>
                <MiniMonth cursor={new Date(cursor.getFullYear(), m, 1)} fdow={fdow} events={visible} compact onPick={(d) => { setCursor(d); setView('day'); }} />
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <EventEditor
          ev={editing}
          calendars={calendars}
          onClose={() => setEditing(null)}
          onSave={(e) => { upsert({ ...e, alerted: false }); setEditing(null); }}
          onDelete={() => { remove(editing.id); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MiniMonth({ cursor, onPick, fdow, events, compact }: { cursor: Date; onPick: (d: Date) => void; fdow: number; events: CalEvent[]; compact?: boolean }) {
  const [month, setMonth] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);
  const now = systemNow();
  const start = addDays(month, -((month.getDay() - fdow + 7) % 7));
  return (
    <div className="text-[11px]">
      {!compact && (
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-[12px]">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <span className="flex">
            <button className="tb-btn !min-w-[22px] !h-[22px]" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={13} /></button>
            <button className="tb-btn !min-w-[22px] !h-[22px]" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={13} /></button>
          </span>
        </div>
      )}
      <div className="grid grid-cols-7 text-center gap-y-[2px]">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="muted font-semibold">{addDays(start, i).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>)}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i);
          const inM = d.getMonth() === month.getMonth();
          const today = sameDay(d, now);
          const sel = sameDay(d, cursor) && !compact;
          const has = events.some((e) => sameDay(new Date(e.start), d));
          return (
            <div key={i} className="grid place-items-center" onClick={(e) => { e.stopPropagation(); onPick(d); }}>
              <span className="w-[20px] h-[20px] grid place-items-center rounded-full relative" style={{ background: today ? '#ff3b30' : sel ? 'var(--press)' : undefined, color: today ? '#fff' : inM ? undefined : 'var(--text-3)', fontWeight: today ? 700 : undefined }}>
                {d.getDate()}
                {has && !today && <span className="absolute bottom-[1px] w-[3px] h-[3px] rounded-full bg-[var(--text-2)]" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ days, events, colorOf, now, locale, scroller, onEdit, onCreate, onMove }: { days: Date[]; events: CalEvent[]; colorOf: (id: string) => string; now: Date; locale: string; scroller: React.RefObject<HTMLDivElement | null>; onEdit: (e: CalEvent) => void; onCreate: (d: Date) => void; onMove: (e: CalEvent, start: number) => void }) {
  const h24 = useSettings((s) => s.menubar.clock.use24h);
  const allDay = (d: Date) => events.filter((e) => e.allDay && new Date(e.start) < addDays(d, 1) && new Date(e.end) > d);
  const timed = (d: Date) => events.filter((e) => !e.allDay && sameDay(new Date(e.start), d));
  const dragRef = useRef<{ ev: CalEvent; y0: number; moved: boolean } | null>(null);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex hairline-b pl-[54px] pr-[11px]">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex-1 min-w-0 px-1 pb-1">
            <div className="text-[12px] text-center" style={{ color: sameDay(d, now) ? '#ff3b30' : undefined, fontWeight: sameDay(d, now) ? 700 : 500 }}>
              {d.toLocaleDateString(locale, { weekday: 'short' })} {d.getDate()}
            </div>
            {allDay(d).map((e) => (
              <div key={e.id} className="text-[11px] truncate rounded-[4px] px-1 mt-[2px] text-white" style={{ background: colorOf(e.calendar) }} onClick={() => onEdit(e)}>{e.title}</div>
            ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="flex-1 scroll relative">
        <div className="flex relative" style={{ height: HOUR_H * 24 }}>
          <div className="w-[54px] flex-none relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 text-[10.5px] muted -translate-y-1/2" style={{ top: h * HOUR_H }}>
                {h === 0 ? '' : h24 ? `${pad(h)}:00` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="flex-1 min-w-0 relative hairline-l"
              onDoubleClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const scale = r.height / (e.currentTarget as HTMLElement).offsetHeight || 1;
                const y = (e.clientY - r.top) / scale;
                const mins = Math.floor((y / HOUR_H) * 4) * 15;
                onCreate(new Date(d.getTime() + mins * 60000));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute inset-x-0 hairline-t" style={{ top: h * HOUR_H, opacity: 0.7 }} />)}
              {timed(d).map((e) => {
                const s = new Date(e.start);
                const top = (s.getHours() + s.getMinutes() / 60) * HOUR_H;
                const height = Math.max(20, ((e.end - e.start) / 3600000) * HOUR_H);
                const c = colorOf(e.calendar);
                return (
                  <div
                    key={e.id}
                    className="absolute left-[3px] right-[3px] rounded-[6px] px-[6px] py-[3px] overflow-hidden text-[11.5px] cursor-default"
                    style={{ top, height, background: `color-mix(in srgb, ${c} 22%, var(--bg))`, borderLeft: `3px solid ${c}` }}
                    onPointerDown={(pe) => {
                      pe.stopPropagation();
                      dragRef.current = { ev: e, y0: pe.clientY, moved: false };
                      const el = pe.currentTarget as HTMLElement;
                      const scale = el.getBoundingClientRect().height / el.offsetHeight || 1;
                      const move = (me: PointerEvent) => {
                        const dr = dragRef.current!;
                        const dy = (me.clientY - dr.y0) / scale;
                        if (Math.abs(dy) > 4) dr.moved = true;
                        el.style.transform = `translateY(${Math.round(dy / (HOUR_H / 4)) * (HOUR_H / 4)}px)`;
                      };
                      const up = (ue: PointerEvent) => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                        const dr = dragRef.current!;
                        el.style.transform = '';
                        if (dr.moved) {
                          const dy = (ue.clientY - dr.y0) / scale;
                          const mins = Math.round(dy / (HOUR_H / 4)) * 15;
                          onMove(e, e.start + mins * 60000);
                        } else onEdit(e);
                        dragRef.current = null;
                      };
                      window.addEventListener('pointermove', move);
                      window.addEventListener('pointerup', up);
                    }}
                  >
                    <div className="font-semibold truncate" style={{ color: `color-mix(in srgb, ${c} 75%, var(--text))` }}>{e.title}</div>
                    <div className="opacity-70">{s.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: !h24 })}</div>
                    {e.location && <div className="opacity-70 truncate">{e.location}</div>}
                  </div>
                );
              })}
              {sameDay(d, now) && (
                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (now.getHours() + now.getMinutes() / 60) * HOUR_H }}>
                  <div className="h-[2px] bg-[#ff3b30]" />
                  <div className="absolute -left-[5px] -top-[4px] w-[10px] h-[10px] rounded-full bg-[#ff3b30]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventEditor({ ev, calendars, onClose, onSave, onDelete }: { ev: CalEvent; calendars: { id: string; name: string; color: string }[]; onClose: () => void; onSave: (e: CalEvent) => void; onDelete: () => void }) {
  const [e, setE] = useState(ev);
  const exists = useCalendar((s) => s.events.some((x) => x.id === ev.id));
  return (
    <div className="absolute inset-0 z-40 grid place-items-center" style={{ background: 'rgba(0,0,0,.1)' }} onPointerDown={onClose}>
      <div className="w-[340px] rounded-[18px] p-4 glass-strong liquid anim-pop flex flex-col gap-3" style={{ background: 'var(--menu-bg)', color: 'var(--text)' }} onPointerDown={(x) => x.stopPropagation()}>
        <input autoFocus className="bg-transparent border-0 outline-none text-[17px] font-bold" value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} onFocus={(x) => x.target.select()} aria-label="Event title" />
        <input className="field" placeholder="Add Location" value={e.location} onChange={(x) => setE({ ...e, location: x.target.value })} />
        <Checkbox checked={e.allDay} onChange={(v) => setE({ ...e, allDay: v })} label="All-day" />
        <label className="flex items-center gap-2 text-[12px]">
          <span className="w-[44px]">starts</span>
          <input type={e.allDay ? 'date' : 'datetime-local'} className="field" value={e.allDay ? toInput(e.start).slice(0, 10) : toInput(e.start)} onChange={(x) => { const t = new Date(x.target.value).getTime(); if (!Number.isNaN(t)) setE({ ...e, start: t, end: Math.max(t + (e.allDay ? 86400000 - 60000 : 900000), e.end + (t - e.start)) }); }} />
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <span className="w-[44px]">ends</span>
          <input type={e.allDay ? 'date' : 'datetime-local'} className="field" value={e.allDay ? toInput(e.end).slice(0, 10) : toInput(e.end)} onChange={(x) => { const t = new Date(x.target.value).getTime(); if (!Number.isNaN(t) && t > e.start) setE({ ...e, end: e.allDay ? t + 86400000 - 60000 : t }); }} />
        </label>
        <div className="flex gap-2">
          <select className="popup flex-1" value={e.calendar} onChange={(x) => setE({ ...e, calendar: x.target.value })} aria-label="Calendar">
            {calendars.map((c) => <option key={c.id} value={c.id}>● {c.name}</option>)}
          </select>
          <select className="popup flex-1" value={e.alert ?? 'none'} onChange={(x) => setE({ ...e, alert: x.target.value === 'none' ? null : Number(x.target.value) })} aria-label="Alert">
            <option value="none">No alert</option>
            <option value="0">At time of event</option>
            <option value="5">5 minutes before</option>
            <option value="15">15 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="1440">1 day before</option>
          </select>
        </div>
        <textarea className="field" rows={3} placeholder="Add Notes" value={e.notes} onChange={(x) => setE({ ...e, notes: x.target.value })} />
        <div className="flex gap-2">
          {exists && <button className="btn" onClick={onDelete} aria-label="Delete event"><Trash2 size={13} /> Delete</button>}
          <div className="flex-1" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(e)}>{exists ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}
