import { createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { kvStorage } from './db';

/** Shared persist options: every store is saved to IndexedDB under its own key. */
export function idb<T>(name: string, extra?: Partial<PersistOptions<T, Partial<T>>>): PersistOptions<T, Partial<T>> {
  return {
    name,
    storage: createJSONStorage(() => kvStorage),
    ...extra,
  } as PersistOptions<T, Partial<T>>;
}

type Hydratable = { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } };
const hydratables: Hydratable[] = [];

export function registerHydration(store: Hydratable) {
  hydratables.push(store);
}

export function waitForHydration(): Promise<void> {
  return Promise.all(
    hydratables.map(
      (s) =>
        new Promise<void>((resolve) => {
          if (s.persist.hasHydrated()) return resolve();
          const unsub = s.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
          // never block boot for more than 4 s
          setTimeout(resolve, 4000);
        }),
    ),
  ).then(() => undefined);
}

let idCounter = 0;
export function uid(prefix = ''): string {
  idCounter = (idCounter + 1) % 1e6;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${rnd}`;
}
