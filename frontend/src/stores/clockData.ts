import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idb, registerHydration } from '../lib/persist';

export interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  days: number[]; // 0=Sun … 6=Sat; empty = once
  enabled: boolean;
  lastFired?: string; // yyyy-mm-dd hh:mm
}
export interface Timer {
  id: string;
  label: string;
  duration: number; // ms
  endsAt: number | null; // running
  remaining: number; // when paused
  done?: boolean;
}

interface ClockState {
  cities: string[]; // IANA zones
  alarms: Alarm[];
  timers: Timer[];
  stopwatch: { startedAt: number | null; elapsed: number; laps: number[] };
  set: (p: Partial<ClockState>) => void;
}

export const useClockData = create<ClockState>()(
  persist(
    (set) => ({
      cities: ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'],
      alarms: [],
      timers: [],
      stopwatch: { startedAt: null, elapsed: 0, laps: [] },
      set: (p) => set(p),
    }),
    idb<ClockState>('app.clock'),
  ),
);
registerHydration(useClockData);
