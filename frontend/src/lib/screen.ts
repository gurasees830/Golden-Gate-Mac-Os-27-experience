import { useSettings } from '../stores/settings';

/** UI scale from Displays settings ("Larger Text" ↔ "More Space"). */
export function uiScale(): number {
  return useSettings.getState().display.scale || 1;
}

/** Convert viewport pointer coordinates to desktop coordinates. */
export function pt(e: { clientX: number; clientY: number }) {
  const s = uiScale();
  return { x: e.clientX / s, y: e.clientY / s };
}

export function deskSize() {
  const s = uiScale();
  return { w: window.innerWidth / s, h: window.innerHeight / s };
}

export function rectToDesk(r: DOMRect) {
  const s = uiScale();
  return { x: r.left / s, y: r.top / s, w: r.width / s, h: r.height / s };
}

/** Dock item elements, used as minimize/launch animation targets. */
export const dockEls = new Map<string, HTMLElement>();

export function dockTarget(key: string, fallbackKey?: string) {
  // a tile that was just removed from the Dock is still in the map for a moment, but detached
  const live = (k?: string) => { const e = k ? dockEls.get(k) : undefined; return e?.isConnected ? e : undefined; };
  const el = live(key) ?? live(fallbackKey);
  if (!el) {
    const d = deskSize();
    return { x: d.w / 2, y: d.h - 30 };
  }
  const r = rectToDesk(el.getBoundingClientRect());
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
