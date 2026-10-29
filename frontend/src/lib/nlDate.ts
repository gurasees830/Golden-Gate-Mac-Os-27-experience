/**
 * Small natural-language event parser for Calendar quick entry, e.g.
 * "Lunch with Sam tomorrow at 1pm for 2 hours", "Gym friday 7:30am",
 * "Holiday on Dec 25 all day".
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface ParsedEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export function parseEvent(input: string, now: Date): ParsedEvent {
  let text = ` ${input.trim()} `;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dateSet = false;
  let hour: number | null = null;
  let minute = 0;
  let durationMin = 60;
  let allDay = false;

  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], ' ');
    return m;
  };

  if (take(/\s(all[- ]day)\s/i)) allDay = true;
  if (take(/\s(today|tonight)\s/i)) dateSet = true;
  else if (take(/\sday after (tomorrow|tmrw)\s/i)) {
    day.setDate(day.getDate() + 2);
    dateSet = true;
  } else if (take(/\s(tomorrow|tmrw)\s/i)) {
    day.setDate(day.getDate() + 1);
    dateSet = true;
  }
  if (!dateSet) {
    const m = take(new RegExp(`\\s(?:on\\s+|next\\s+|this\\s+)?(${WEEKDAYS.join('|')}|${WEEKDAYS.map((w) => w.slice(0, 3)).join('|')})\\s`, 'i'));
    if (m) {
      const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[1].toLowerCase().slice(0, 3)));
      let diff = (idx - day.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      day.setDate(day.getDate() + diff);
      dateSet = true;
    }
  }
  if (!dateSet) {
    const m = take(new RegExp(`\\s(?:on\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*|(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?)\\s`, 'i'));
    if (m) {
      const d = Number(m[1] ?? m[4]);
      const mon = MONTHS.indexOf((m[2] ?? m[3]).toLowerCase().slice(0, 3));
      day.setMonth(mon, d);
      if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) day.setFullYear(day.getFullYear() + 1);
      dateSet = true;
    }
  }
  if (!dateSet) {
    const m = take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})\s/);
    if (m) {
      day.setMonth(Number(m[1]) - 1, Number(m[2]));
      dateSet = true;
    }
  }
  const t = take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\s/i) ?? take(/\s(?:at\s+|@\s*)(\d{1,2})(?::(\d{2}))?\s/i) ?? take(/\s(\d{1,2}):(\d{2})\s/);
  if (t) {
    hour = Number(t[1]);
    minute = Number(t[2] ?? 0);
    const ap = t[3]?.toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && hour < 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
    if (!ap && hour < 8 && t[0].includes('at')) hour += 12; // "at 3" → 3 pm
  } else if (/\snoon\s/i.test(text)) {
    take(/\s(?:at\s+)?noon\s/i);
    hour = 12;
  } else if (/\stonight\s/i.test(input)) hour = 19;
  const dur = take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\s/i);
  if (dur) durationMin = Math.round(Number(dur[1]) * (dur[2].toLowerCase().startsWith('h') ? 60 : 1));

  if (hour == null && !allDay) {
    if (dateSet) allDay = true;
    else {
      hour = now.getHours() + 1;
      minute = 0;
    }
  }
  const start = new Date(day);
  if (!allDay) start.setHours(hour!, minute, 0, 0);
  const end = allDay ? new Date(start.getTime() + 86400000 - 60000) : new Date(start.getTime() + durationMin * 60000);
  const title = text.replace(/\s+(at|on|for)\s*$/i, '').replace(/\s{2,}/g, ' ').trim() || 'New Event';
  return { title: title[0].toUpperCase() + title.slice(1), start, end, allDay };
}
