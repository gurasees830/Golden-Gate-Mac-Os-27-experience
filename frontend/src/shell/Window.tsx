import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { usePresence } from 'framer-motion';
import { gsap } from 'gsap';
import type { WindowState } from '../types';
import { getApp } from '../lib/appRegistry';
import { MENUBAR_H, hasCloseGuard, useWindows, workArea } from '../stores/windows';
import { useSettings } from '../stores/settings';
import { useSystem } from '../stores/system';
import { WindowContext, TitleBar, type WindowCtx } from './windowContext';
import { deskSize, dockTarget, pt } from '../lib/screen';
import { ErrorBoundary } from './ErrorBoundary';

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
  const [animating, setAnimating] = useState(false);
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
    if (blurOff) setAnimating(true);
    const t = build(el);
    tween.current = t;
    t.eventCallback('onComplete', () => {
      gsap.set(el, { clearProps: 'transform,opacity,transformOrigin' });
      setAnimating(false);
      done?.();
    });
  };
  const ease = { out: 'power3.out', in: 'power2.in' };

  // open: rise and settle, like a macOS window appearing
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion) {
      setAnimating(false);
      return;
    }
    gsap.set(el, { opacity: 0, scale: 0.92, y: 18, transformOrigin: '50% 60%' });
    play((e) => gsap.to(e, { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power3.out', force3D: true }));
    return () => {
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
      scale: 0.9,
      duration: 0.2,
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

  // minimise into the Dock / restore from it
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const b = win.bounds;
    const t = dockTarget(toApp ? win.appId : `min:${win.id}`, win.appId);
    const genie = effect === 'genie';
    if (win.minimized) {
      if (reduceMotion) return setHiddenAfterMin(true);
      const dx = t.x - (b.x + b.w / 2);
      const dy = t.y - (b.y + b.h / 2);
      play(
        (e) => {
          gsap.set(e, { transformOrigin: '50% 100%' });
          const tl = gsap.timeline({ defaults: { force3D: true } });
          if (genie) {
            // funnel: the window narrows toward the Dock tile while it drops into it
            tl.to(e, { scaleX: 0.28, duration: 0.3, ease: 'power2.in' }, 0).to(e, { x: dx, y: dy + b.h * 0.42, scaleY: 0.06, scaleX: 0.06, opacity: 0.2, duration: 0.42, ease: 'power3.in' }, 0.04);
          } else {
            tl.to(e, { x: dx, y: dy, scale: 0.06, opacity: 0, duration: 0.3, ease: ease.in }, 0);
          }
          return tl;
        },
        () => setHiddenAfterMin(true),
      );
    } else {
      setHiddenAfterMin(false);
      if (reduceMotion) return;
      const dx = t.x - (b.x + b.w / 2);
      const dy = t.y - (b.y + b.h / 2);
      gsap.set(ref.current, { x: dx, y: dy + (genie ? b.h * 0.42 : 0), scale: 0.06, opacity: 0.2, transformOrigin: '50% 100%' });
      play((e) => gsap.to(e, { x: 0, y: 0, scale: 1, opacity: 1, duration: genie ? 0.42 : 0.3, ease: 'power3.out', force3D: true }));
    }
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
      minimize: () => minimize(win.id),
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
      className={`window ${focused ? 'focused' : ''} ${win.fullscreen ? 'fullscreen' : ''} ${animBounds ? 'anim-bounds' : ''} ${win.hidden ? 'win-hidden' : ''} ${animating ? 'animating' : ''}`}
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
