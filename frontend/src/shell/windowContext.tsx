import { createContext, useContext, useEffect, useRef, type PointerEvent as RPE, type ReactNode } from 'react';
import { Minus, Plus, X, ChevronsLeftRight } from 'lucide-react';
import type { MenuDef, WindowState } from '../types';
import { setCloseGuard, useWindows } from '../stores/windows';
import { useSystem } from '../stores/system';
import { useSettings } from '../stores/settings';

export interface WindowCtx {
  win: WindowState;
  focused: boolean;
  startDrag: (e: RPE) => void;
  close: () => void;
  minimize: () => void;
  zoom: () => void;
}

export const WindowContext = createContext<WindowCtx | null>(null);

export function useWindow(): WindowCtx {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error('useWindow must be used inside a window');
  return ctx;
}

/** Register app-specific menu bar menus for this window. */
export function useMenus(menus: MenuDef[], deps: unknown[] = []) {
  const { win } = useWindow();
  const register = useSystem((s) => s.registerMenus);
  const unregister = useSystem((s) => s.unregisterMenus);
  useEffect(() => {
    register(win.id, menus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id, ...deps]);
  useEffect(() => () => unregister(win.id), [win.id, unregister]);
}

/** Ask before closing (e.g. unsaved changes). Return true to allow the close. */
export function useCloseGuard(guard: (() => Promise<boolean>) | null) {
  const { win } = useWindow();
  const ref = useRef(guard);
  ref.current = guard;
  useEffect(() => {
    setCloseGuard(win.id, ref.current ? () => (ref.current ? ref.current() : Promise.resolve(true)) : null);
    return () => setCloseGuard(win.id, null);
  }, [win.id, !!guard]);
}

export function useWindowTitle(title: string) {
  const { win } = useWindow();
  const setTitle = useWindows((s) => s.setTitle);
  useEffect(() => {
    setTitle(win.id, title);
  }, [title, win.id, setTitle]);
}

export function TrafficLights({ className = '' }: { className?: string }) {
  const { win, close, minimize, zoom } = useWindow();
  const resizable = true;
  return (
    <div className={`traffic ${className}`} data-no-drag onDoubleClick={(e) => e.stopPropagation()}>
      <button className="tl-close" aria-label="Close" onClick={close}>
        <X size={8} strokeWidth={3.2} />
        {win.dirty && <span className="dirty-dot" />}
      </button>
      <button className="tl-min" aria-label="Minimize" onClick={minimize} disabled={win.fullscreen}>
        <Minus size={8} strokeWidth={3.4} />
      </button>
      <button className="tl-max" aria-label="Zoom" onClick={zoom} disabled={!resizable}>
        {win.fullscreen ? <ChevronsLeftRight size={8} strokeWidth={3} /> : <Plus size={8} strokeWidth={3.4} />}
      </button>
    </div>
  );
}

/** Draggable unified title/toolbar area. Children are toolbar contents. */
export function TitleBar({
  title,
  children,
  className = '',
  height = 52,
  showTitle = true,
  lightsSpacer,
  style,
  lights = true,
}: {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  height?: number;
  showTitle?: boolean;
  lightsSpacer?: number;
  style?: React.CSSProperties;
  lights?: boolean;
}) {
  const { startDrag, win, zoom, minimize } = useWindow();
  const dbl = useSettings((s) => s.dock.titlebarDoubleClick);
  return (
    <div
      className={`titlebar ${className}`}
      style={{ height, ...style }}
      onPointerDown={startDrag}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,textarea,select,[data-no-drag]')) return;
        if (dbl === 'zoom') zoom();
        else if (dbl === 'minimize') minimize();
      }}
    >
      {lights && <TrafficLights />}
      {lightsSpacer ? <div style={{ width: lightsSpacer }} /> : null}
      {showTitle && (
        <div className="titlebar-title pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[50%]">{title ?? win.title}</div>
      )}
      {children}
    </div>
  );
}

/** A plain drag region for custom layouts. */
export function DragRegion({ className = '', children, style }: { className?: string; children?: ReactNode; style?: React.CSSProperties }) {
  const { startDrag, zoom } = useWindow();
  return (
    <div
      className={className}
      style={style}
      onPointerDown={startDrag}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,textarea,select,[data-no-drag]')) return;
        zoom();
      }}
    >
      {children}
    </div>
  );
}
