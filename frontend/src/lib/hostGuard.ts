/**
 * Keeps the host browser from reacting to input meant for the simulated desktop:
 * trackpad swipes (history back/forward), pinch-zoom, accidental back navigation,
 * and — in full screen — reserved shortcuts such as Ctrl+Tab, Ctrl+W, Ctrl+T and Alt+Tab.
 */

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
const kb = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/** True when an ancestor of `el` can still scroll horizontally in the direction of `dx`. */
function canScrollX(el: Element | null, dx: number): boolean {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth) {
      if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
    }
  }
  return false;
}

export function installHostGuards(): () => void {
  const onWheel = (e: WheelEvent) => {
    // pinch on a trackpad arrives as Ctrl+wheel and would zoom the whole page
    if (e.ctrlKey) return e.preventDefault();
    // a sideways two-finger swipe would navigate the browser back/forward unless something can scroll
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !canScrollX(e.target as Element, e.deltaX)) e.preventDefault();
  };
  const block = (e: Event) => e.preventDefault(); // Safari pinch gestures
  const onPop = () => history.pushState({ gg: 1 }, '', location.href); // swipe-back / Back button stays on the desktop
  const onUnload = (e: BeforeUnloadEvent) => {
    if (!import.meta.env.PROD || document.fullscreenElement) return;
    e.preventDefault(); // Ctrl+W / Ctrl+R by mistake asks before closing the tab
  };
  // Keyboard Lock only works in full screen, however it was entered (F11 included on some browsers)
  const onFullscreen = () => {
    if (document.fullscreenElement) void kb()?.lock?.().catch(() => undefined);
    else kb()?.unlock?.();
  };

  history.pushState({ gg: 1 }, '', location.href);
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, block);
  window.addEventListener('popstate', onPop);
  window.addEventListener('beforeunload', onUnload);
  document.addEventListener('fullscreenchange', onFullscreen);
  return () => {
    window.removeEventListener('wheel', onWheel, { capture: true });
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(t, block);
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('beforeunload', onUnload);
    document.removeEventListener('fullscreenchange', onFullscreen);
  };
}

/** One-time nudge: reserved shortcuts only reach the desktop in full screen with keyboard capture. */
export function keyboardCaptureSupported(): boolean {
  return typeof kb()?.lock === 'function';
}
