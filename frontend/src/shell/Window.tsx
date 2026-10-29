import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { usePresence } from 'framer-motion';
import { gsap } from 'gsap';
import type { WindowState } from '../types';
import { getApp } from '../lib/appRegistry';
import { MENUBAR_H, hasCloseGuard, useWindows, workArea } from '../stores/windows';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { WindowContext, TitleBar, type WindowCtx } from './windowContext';
import { deskSize, dockEls, dockTarget, pt } from '../lib/screen';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * macOS-style genie, built only from compositor-friendly 3D transforms (no clip-path, no snapshots).
 * Pivoting on the top edge, the window's lower edge first tips away and narrows while it bends toward
 * the Dock tile (perspective tilt + skew), then the whole window is drawn down into the tile.
 * `dx` is the horizontal distance from the window's centre to the tile, `dy` from its top edge.
 */
function genieTimeline(el: HTMLElement, dx: number, dy: number, h: number) {
  const bend = (Math.atan2(dx * 0.45, h) * 180) / Math.PI; // the bottom edge leans toward the tile
  const tl = gsap.timeline({ defaults: { force3D: true } });
  tl.set(el, { transformOrigin: '50% 0%', transformPerspective: 1400 })
    .to(el, { skewX: Math.max(-35, Math.min(35, bend)), rotationX: 34, scaleX: 0.8, x: dx * 0.12, duration: 0.2, ease: 'sine.in' }, 0)
    .to(el, { x: dx, y: dy, skewX: 0, rotationX: 62, scaleX: 0.08, scaleY: 0.04, opacity: 0.25, duration: 0.32, ease: 'power3.in' }, 0.12);
  return tl;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const tilePreviewBus = { set: (_r: { x: number; y: number; w: number; h: number } | null) => {} };

function WindowImpl({ win, focused }: { win: WindowState; focused: boolean }) {
  const def = getApp(win.appId)!;
  const ref = useRef<HTMLDivElement>(null);
  const [isPresent, safeToRemove] = usePresence();
  const reduceMotion = useSettings((s) => s.accessibility.reduceMotion || s.battery.lowPower);
  const effect = useSettings((s) => s.dock.minimizeEffect);
  const toApp = useSettings((s) => s.dock.minimizeToApp);
  const tiling = useSettings((s) => s.desktop.tiling);
  const { focus, close, minimize, restore, toggleMaximize, toggleFullscreen, setBounds, tile } = useWindows.getState();
  const [hiddenAfterMin, setHiddenAfterMin] = useState(false);
  // Blur on/off is toggled straight on the element (and remembered for re-renders) so starting an
  // animation doesn't cost a React render.
  const animRef = useRef(false);
  const blur = (off: boolean) => {
    animRef.current = off;
    ref.current?.classList.toggle('animating', off);
  };
  const firstRender = useRef(true);

  /**
   * Window animations run on GSAP and touch only transform + opacity, so they stay on the compositor.
   * (No clip-path or blur is animated; the glass blur is switched off while a window moves.)
   */
  const tween = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const play = (build: (el: HTMLDivElement) => gsap.core.Tween | gsap.core.Timeline, done?: () => void, blurOff = true) => {
    const el = ref.current;
    if (!el) return;
    tween.current?.kill();
    if (blurOff) blur(true);
    const t = build(el);
    tween.current = t;
    t.eventCallback('onComplete', () => {
      done?.(); // first, so a minimised window is hidden before its transform is cleared
      gsap.set(el, { clearProps: 'transform,opacity,transformOrigin' });
      blur(false);
    });
  };
  const ease = { out: 'power3.out', in: 'power2.in' };

  // open: rise and settle, like a macOS window appearing
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion) return;
    gsap.set(el, { opacity: 0, scale: 0.86, transformOrigin: '50% 50%' });
    blur(true);
    // Give the browser two frames to paint the new window's pixels while it is still invisible,
    // so that one-off cost lands before the zoom starts instead of stalling it half-way.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => play((e) => gsap.to(e, { opacity: 1, scale: 1, duration: 0.26, ease: 'expo.out', force3D: true })));
    });
    return () => {
      cancelAnimationFrame(raf);
      tween.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close: shrink and fade, then let AnimatePresence remove the window.
  // The traffic-light button starts this tween in the click itself, before React re-renders, so the
  // window reacts on the very next frame; keyboard/menu closes start it before the next paint.
  const exit = useRef<{ started: boolean; done: boolean; remove?: () => void }>({ started: false, done: false });
  const startExit = (then?: () => void) => {
    const el = ref.current;
    if (!el || exit.current.started) return;
    exit.current.started = true;
    tween.current?.kill();
    el.classList.add('animating'); // direct: the element's props are frozen once it leaves the tree
    el.style.pointerEvents = 'none';
    gsap.to(el, {
      opacity: 0,
      scale: 0.86,
      duration: 0.18,
      ease: 'power2.out',
      force3D: true,
      onComplete: () => {
        exit.current.done = true;
        exit.current.remove?.();
        then?.();
      },
    });
  };
  useLayoutEffect(() => {
    if (isPresent) return;
    exit.current.remove = safeToRemove;
    // AnimatePresence ignores a removal signalled in the same commit as the exit, so wait a frame
    if (reduceMotion || exit.current.done) {
      requestAnimationFrame(() => safeToRemove?.());
      return;
    }
    startExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // minimise into the Dock / restore from it.
  // The yellow button starts the animation in the click and only tells the store (which adds the
  // Dock tile and moves focus) once the window has landed, so nothing re-renders mid-flight.
  const minAnim = useRef<'none' | 'started' | 'done'>('none');
  const startMinimize = (then?: () => void) => {
    const el = ref.current;
    if (!el || minAnim.current === 'started') return;
    minAnim.current = 'started';
    const b = win.bounds;
    // before the tile exists, aim where it will appear: just left of the Downloads stack
    let t = dockTarget(toApp ? win.appId : `min:${win.id}`, toApp ? undefined : 'downloads');
    if (!toApp && !dockEls.get(`min:${win.id}`)?.isConnected) t = { ...t, x: t.x - useSettings.getState().dock.size };
    const dx = t.x - (b.x + b.w / 2);
    const dy = t.y - (effect === 'genie' ? b.y : b.y + b.h);
    el.style.pointerEvents = 'none';
    play(
      (e) =>
        effect === 'genie'
          ? genieTimeline(e, dx, dy, b.h)
          : gsap.timeline({ defaults: { force3D: true } }).set(e, { transformOrigin: '50% 100%' }).to(e, { x: dx, y: dy, scale: 0.06, opacity: 0, duration: 0.3, ease: 'power2.in' }),
      () => {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = '';
        minAnim.current = 'done';
        setHiddenAfterMin(true);
        then?.();
      },
    );
  };

  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (win.minimized) {
      if (minAnim.current !== 'none') return; // the button already animated it
      if (reduceMotion) return setHiddenAfterMin(true);
      startMinimize();
      return;
    }
    minAnim.current = 'none';
    el.style.visibility = 'visible';
    setHiddenAfterMin(false);
    if (reduceMotion) return;
    const b = win.bounds;
    const t = dockTarget(toApp ? win.appId : `min:${win.id}`, win.appId);
    const dx = t.x - (b.x + b.w / 2);
    const dy = t.y - (effect === 'genie' ? b.y : b.y + b.h);
    tween.current?.kill();
    blur(true);
    const tl = effect === 'genie' ? genieTimeline(el, dx, dy, b.h) : gsap.timeline().set(el, { transformOrigin: '50% 100%' }).to(el, { x: dx, y: dy, scale: 0.06, opacity: 0, duration: 0.3, ease: 'power2.in', force3D: true });
    tl.progress(1).timeScale(1.12).reverse();
    tl.eventCallback('onReverseComplete', () => {
      gsap.set(el, { clearProps: 'transform,opacity,transformOrigin' });
      blur(false);
    });
    tween.current = tl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.minimized]);

  // Zoom, tiling and full-screen changes glide to the new frame (drags and resizes don't).
  const interacting = useRef(false);
  const lastBounds = useRef(win.bounds);
  const animUntil = useRef(0);
  const [, bump] = useState(0);
  if (lastBounds.current !== win.bounds) {
    lastBounds.current = win.bounds;
    if (!interacting.current && !reduceMotion) {
      animUntil.current = performance.now() + 380;
      setTimeout(() => bump((n) => n + 1), 400);
    }
  }
  const animBounds = performance.now() < animUntil.current;
  const endInteraction = () => setTimeout(() => (interacting.current = false), 60);

  const drag = useRef<{ sx: number; sy: number; bx: number; by: number; w: number; h: number; moved: boolean; snap: null | 'left' | 'right' | 'fill' } | null>(null);

  const startDrag = useCallback(
    (e: RPE) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button,input,textarea,select,a,[data-no-drag],[contenteditable="true"]')) return;
      if (win.fullscreen) return;
      const p = pt(e);
      let { x, y, w, h } = win.bounds;
      drag.current = { sx: p.x, sy: p.y, bx: x, by: y, w, h, moved: false, snap: null };
      interacting.current = true;
      const el = ref.current!;
      const onMove = (ev: PointerEvent) => {
        const d = drag.current!;
        const q = pt(ev);
        let nx = d.bx + (q.x - d.sx);
        let ny = d.by + (q.y - d.sy);
        if (!d.moved && Math.hypot(q.x - d.sx, q.y - d.sy) < 3) return;
        if (!d.moved) {
          d.moved = true;
          // dragging a zoomed/tiled window restores its previous size under the cursor
          const cur = useWindows.getState().windows.find((x0) => x0.id === win.id);
          if (cur && (cur.maximized || cur.prevBounds) && cur.prevBounds && (cur.maximized || Math.abs(cur.bounds.w - cur.prevBounds.w) > 2)) {
            const pw = cur.prevBounds.w;
            const ratio = (d.sx - d.bx) / d.w;
            d.bx = q.x - pw * ratio;
            d.by = d.by;
            d.w = pw;
            d.h = cur.prevBounds.h;
            el.style.width = `${pw}px`;
            el.style.height = `${cur.prevBounds.h}px`;
            d.sx = q.x;
            nx = d.bx;
          }
        }
        const ds = deskSize();
        nx = Math.max(-d.w + 90, Math.min(ds.w - 90, nx));
        ny = Math.max(MENUBAR_H, Math.min(ds.h - 50, ny));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
        x = nx;
        y = ny;
        w = d.w;
        h = d.h;
        if (tiling) {
          const a = workArea();
          let snap: typeof d.snap = null;
          if (q.x <= 3) snap = 'left';
          else if (q.x >= ds.w - 4) snap = 'right';
          else if (q.y <= MENUBAR_H + 1) snap = 'fill';
          if (snap !== d.snap) {
            d.snap = snap;
            tilePreviewBus.set(
              snap === 'left'
                ? { x: a.x + 6, y: a.y + 6, w: a.w / 2 - 9, h: a.h - 12 }
                : snap === 'right'
                  ? { x: a.x + a.w / 2 + 3, y: a.y + 6, w: a.w / 2 - 9, h: a.h - 12 }
                  : snap === 'fill'
                    ? { x: a.x + 6, y: a.y + 6, w: a.w - 12, h: a.h - 12 }
                    : null,
            );
          }
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const d = drag.current;
        drag.current = null;
        tilePreviewBus.set(null);
        if (!d?.moved) {
          interacting.current = false;
          return;
        }
        if (d.snap) {
          interacting.current = false;
          tile(win.id, d.snap);
        } else {
          endInteraction();
          const cur = useWindows.getState().windows.find((x0) => x0.id === win.id);
          useWindows.setState((s) => ({
            windows: s.windows.map((ww) => (ww.id === win.id ? { ...ww, bounds: { x, y, w, h }, maximized: false, prevBounds: cur?.maximized ? undefined : ww.prevBounds && Math.abs(ww.prevBounds.w - w) < 2 ? undefined : ww.prevBounds } : ww)),
          }));
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [win.bounds, win.fullscreen, win.id, tiling, tile],
  );

  const startResize = (edge: Edge) => (e: RPE) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    focus(win.id);
    interacting.current = true;
    const p0 = pt(e);
    const b0 = { ...win.bounds };
    const minW = def.window.minWidth;
    const minH = def.window.minHeight;
    const el = ref.current!;
    let nb = { ...b0 };
    const onMove = (ev: PointerEvent) => {
      const p = pt(ev);
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      nb = { ...b0 };
      if (edge.includes('e')) nb.w = Math.max(minW, b0.w + dx);
      if (edge.includes('s')) nb.h = Math.max(minH, b0.h + dy);
      if (edge.includes('w')) {
        nb.w = Math.max(minW, b0.w - dx);
        nb.x = b0.x + (b0.w - nb.w);
      }
      if (edge.includes('n')) {
        const maxUp = b0.y - MENUBAR_H;
        const ndy = Math.max(-maxUp, dy);
        nb.h = Math.max(minH, b0.h - ndy);
        nb.y = b0.y + (b0.h - nb.h);
      }
      el.style.left = `${nb.x}px`;
      el.style.top = `${nb.y}px`;
      el.style.width = `${nb.w}px`;
      el.style.height = `${nb.h}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setBounds(win.id, nb);
      endInteraction();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const ctx: WindowCtx = useMemo(
    () => ({
      win,
      focused,
      startDrag,
      close: () => {
        // Fade first, then update the store: the Dock, menu bar and the window behind re-render
        // once the window is already invisible instead of in the middle of the animation.
        if (!reduceMotion && !hasCloseGuard(win.id)) startExit(() => void close(win.id));
        else void close(win.id);
      },
      minimize: () => {
        if (!reduceMotion && !win.minimized) startMinimize(() => minimize(win.id));
        else minimize(win.id);
      },
      zoom: () => {
        if (win.fullscreen) toggleFullscreen(win.id);
        else toggleMaximize(win.id);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win, focused, startDrag, close, minimize, toggleMaximize, toggleFullscreen, reduceMotion],
  );

  const Comp = def.component;
  const content = useMemo(() => <Comp win={win} />, [Comp, win]);
  const resizable = def.window.resizable !== false && !win.fullscreen;
  const b = win.bounds;
  const edges: [Edge, React.CSSProperties][] = [
    ['n', { top: -3, left: 8, right: 8, height: 6, cursor: 'ns-resize' }],
    ['s', { bottom: -3, left: 8, right: 8, height: 6, cursor: 'ns-resize' }],
    ['e', { right: -3, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }],
    ['w', { left: -3, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }],
    ['ne', { right: -4, top: -4, width: 14, height: 14, cursor: 'nesw-resize' }],
    ['nw', { left: -4, top: -4, width: 14, height: 14, cursor: 'nwse-resize' }],
    ['se', { right: -4, bottom: -4, width: 14, height: 14, cursor: 'nwse-resize' }],
    ['sw', { left: -4, bottom: -4, width: 14, height: 14, cursor: 'nesw-resize' }],
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={win.title}
      data-window-id={win.id}
      className={`window ${focused ? 'focused' : ''} ${win.fullscreen ? 'fullscreen' : ''} ${animBounds ? 'anim-bounds' : ''} ${win.hidden ? 'win-hidden' : ''} ${animRef.current ? 'animating' : ''}`}
      style={{
        left: b.x,
        top: b.y,
        width: b.w,
        height: b.h,
        zIndex: win.fullscreen ? 5000 + win.z : win.z,
        visibility: hiddenAfterMin ? 'hidden' : 'visible',
        pointerEvents: win.minimized ? 'none' : 'auto',
        background: def.window.background,
      }}
      onPointerDownCapture={() => {
        if (!focused) focus(win.id);
        useSystem.getState().set({ activeMenu: null, contextMenu: null });
      }}
    >
      <WindowContext.Provider value={ctx}>
        <ErrorBoundary appName={def.name} onClose={() => void close(win.id, true)}>
          <Suspense fallback={<div className="flex-1 grid place-items-center"><div className="spinner" /></div>}>
            {def.window.chrome === 'standard' ? (
              <>
                <TitleBar className="chrome hairline-b" height={38} />
                <div className="flex-1 min-h-0 flex flex-col">
                  {content}
                </div>
              </>
            ) : (
              content
            )}
          </Suspense>
        </ErrorBoundary>
      </WindowContext.Provider>
      {resizable && !win.minimized && edges.map(([edge, st]) => <div key={edge} className="resize-handle" style={st} onPointerDown={startResize(edge)} />)}
    </div>
  );
}

export const Window = memo(WindowImpl);

export { restoreHelper };
function restoreHelper(id: string) {
  useWindows.getState().restore(id);
}
