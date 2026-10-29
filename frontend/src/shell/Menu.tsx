import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import type { MenuItem } from '../types';
import { useSettings } from '../stores/settings';
import { deskSize } from '../lib/screen';

export function formatShortcut(sc: string, style: 'mac' | 'pc' = useSettings.getState().keyboard.symbols): string {
  const parts = sc.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const keyLabel: Record<string, string> = {
    space: style === 'mac' ? 'Space' : 'Space', backspace: style === 'mac' ? '⌫' : 'Backspace', delete: style === 'mac' ? '⌦' : 'Del', enter: '↩', escape: 'Esc',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', tab: '⇥', ',': ',', '.': '.', '`': '`',
  };
  const k = keyLabel[key] ?? key.toUpperCase();
  if (style === 'mac') {
    let s = '';
    if (mods.has('ctrl')) s += '⌃';
    if (mods.has('alt')) s += '⌥';
    if (mods.has('shift')) s += '⇧';
    if (mods.has('mod')) s += '⌘';
    return s + k;
  }
  const out: string[] = [];
  if (mods.has('mod') || mods.has('ctrl')) out.push('Ctrl');
  if (mods.has('alt') || (mods.has('mod') && mods.has('ctrl'))) out.push('Alt');
  if (mods.has('shift')) out.push('Shift');
  out.push(k);
  return out.join('+');
}

export function MenuList({ items, onDone, className = '', style }: { items: MenuItem[]; onDone: () => void; className?: string; style?: React.CSSProperties }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const subRefs = useRef<(HTMLDivElement | null)[]>([]);
  const symbols = useSettings((s) => s.keyboard.symbols);
  return (
    <div className={`menu-panel anim-pop ${className}`} style={style} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="menu-sep" />;
        const enabled = !it.disabled && (!!it.action || !!it.submenu);
        return (
          <div
            key={i}
            ref={(el) => {
              subRefs.current[i] = el;
            }}
            role="menuitem"
            aria-disabled={!enabled}
            className={`menu-item ${enabled ? 'enabled' : 'disabled'} ${openSub === i ? 'open' : ''}`}
            onPointerEnter={() => setOpenSub(it.submenu ? i : null)}
            onClick={(e) => {
              e.stopPropagation();
              if (!enabled || it.submenu) return;
              onDone();
              it.action?.();
            }}
          >
            {it.checked && (
              <span className="check">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
            {it.icon && <span className="flex-none -ml-1 flex items-center">{it.icon}</span>}
            <span className={it.danger ? 'text-[#ff3b30]' : ''}>{it.label}</span>
            {it.shortcut && <span className="shortcut">{formatShortcut(it.shortcut, symbols)}</span>}
            {it.submenu && <ChevronRight size={13} className="ml-auto -mr-1 opacity-70" />}
            {it.submenu && openSub === i && <SubMenu items={it.submenu} anchor={subRefs.current[i]} onDone={onDone} />}
          </div>
        );
      })}
    </div>
  );
}

function SubMenu({ items, anchor, onDone }: { items: MenuItem[]; anchor: HTMLDivElement | null; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    const parentW = anchor.offsetWidth;
    const ds = deskSize();
    const ar = anchor.getBoundingClientRect();
    const scale = ar.width / parentW || 1;
    const ax = ar.left / scale;
    const ay = ar.top / scale;
    let left = parentW + 1;
    if (ax + parentW + w > ds.w - 4) left = -w - 1;
    let top = -5;
    if (ay + h > ds.h - 4) top = ds.h - 4 - ay - h;
    setPos({ left, top });
  }, [anchor]);
  return (
    <div ref={ref} className="absolute z-10" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', color: 'var(--text)' }} onClick={(e) => e.stopPropagation()}>
      <MenuList items={items} onDone={onDone} />
    </div>
  );
}

/** Positioned floating menu (context menus, dock menus). Keeps itself on screen. */
export function FloatingMenu({ x, y, items, onDone, anchor = 'top-left' }: { x: number; y: number; items: MenuItem[]; onDone: () => void; anchor?: 'top-left' | 'bottom-center' | 'top-right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    const ds = deskSize();
    let left = anchor === 'bottom-center' ? x - w / 2 : anchor === 'top-right' ? x - w : x;
    let top = anchor === 'bottom-center' ? y - h - 8 : y;
    if (left + w > ds.w - 4) left = Math.max(4, anchor === 'bottom-center' ? ds.w - w - 4 : x - w);
    if (left < 4) left = 4;
    if (top + h > ds.h - 4) top = Math.max(30, y - h);
    if (top < 28) top = 28;
    setPos({ left, top });
  }, [x, y, anchor]);
  return (
    <div ref={ref} className="fixed z-[9500]" style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? 'visible' : 'hidden' }}>
      <MenuList items={items} onDone={onDone} />
    </div>
  );
}
