import { describe, it, expect } from 'vitest';
import { parseEvent } from '../lib/nlDate';

const now = new Date(2026, 9, 29, 10, 0); // Thu 29 Oct 2026, 10:00

describe('Calendar quick-add parser', () => {
  it('parses relative day, time and duration', () => {
    const e = parseEvent('Lunch with Sam tomorrow at 1pm for 2 hours', now);
    expect(e.title).toBe('Lunch with Sam');
    expect(e.start).toEqual(new Date(2026, 9, 30, 13, 0));
    expect(e.end).toEqual(new Date(2026, 9, 30, 15, 0));
    expect(e.allDay).toBe(false);
  });
  it('parses "day after tomorrow"', () => {
    const e = parseEvent('Dentist day after tomorrow 9am', now);
    expect(e.start.getDate()).toBe(31);
    expect(e.start.getHours()).toBe(9);
    expect(e.title).toBe('Dentist');
  });
  it('parses weekdays as the next occurrence', () => {
    const e = parseEvent('Gym monday 7:30am', now);
    expect(e.start).toEqual(new Date(2026, 10, 2, 7, 30));
  });
  it('parses month names and all-day events', () => {
    const e = parseEvent('Holiday on Dec 25 all day', now);
    expect(e.allDay).toBe(true);
    expect(e.start.getMonth()).toBe(11);
    expect(e.start.getDate()).toBe(25);
    expect(e.title).toBe('Holiday');
  });
});
