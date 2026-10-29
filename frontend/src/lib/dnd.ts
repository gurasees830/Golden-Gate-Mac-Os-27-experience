import { create } from 'zustand';
import { pt } from './screen';
import { useFs, DESKTOP } from '../stores/fs';

/**
 * Internal drag & drop for virtual files (Finder ↔ Desktop ↔ Dock ↔ Trash).
 * Drop targets declare themselves with data attributes:
 *   data-drop-folder="<id>"  data-drop-trash  data-drop-app="<appId>"  data-drop-desktop
 */
interface DndState {
  active: boolean;
  ids: string[];
  x: number;
  y: number;
  copy: boolean;
}
export const dndState = create<DndState>(() => ({ active: false, ids: [], x: 0, y: 0, copy: false }));

let lastHover: HTMLElement | null = null;

function targetAt(clientX: number, clientY: number): HTMLElement | null {
  const els = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
  for (const el of els) {
    const t = el.closest('[data-drop-folder],[data-drop-trash],[data-drop-app],[data-drop-desktop]') as HTMLElement | null;
    if (t) return t;
  }
  return null;
}

export interface DropResult {
  kind: 'folder' | 'trash' | 'app' | 'desktop' | 'none';
  id?: string;
  x: number;
  y: number;
  copy: boolean;
}

export async function dropAt(clientX: number, clientY: number, ids: string[], copy: boolean): Promise<DropResult> {
  const t = targetAt(clientX, clientY);
  const p = pt({ clientX, clientY });
  if (!t) return { kind: 'none', x: p.x, y: p.y, copy };
  const fs = useFs.getState();
  if (t.dataset.dropTrash !== undefined) {
    const { moveToTrash } = await import('../shell/actions');
    await moveToTrash(ids);
    return { kind: 'trash', x: p.x, y: p.y, copy };
  }
  if (t.dataset.dropApp) {
    const { openFile } = await import('../shell/actions');
    ids.forEach((id) => openFile(id, t.dataset.dropApp));
    return { kind: 'app', id: t.dataset.dropApp, x: p.x, y: p.y, copy };
  }
  if (t.dataset.dropFolder) {
    const target = t.dataset.dropFolder;
    const valid = ids.filter((id) => id !== target);
    if (copy) await fs.copy(valid, target);
    else await fs.move(valid, target);
    return { kind: 'folder', id: target, x: p.x, y: p.y, copy };
  }
  if (t.dataset.dropDesktop !== undefined) {
    if (copy) {
      const created = await fs.copy(ids, DESKTOP);
      return { kind: 'desktop', x: p.x, y: p.y, copy, id: created.join(',') };
    }
    await fs.move(ids, DESKTOP);
    return { kind: 'desktop', x: p.x, y: p.y, copy };
  }
  return { kind: 'none', x: p.x, y: p.y, copy };
}

/**
 * Begin a potential drag from a pointerdown. Returns nothing; calls onDrop
 * once released over a target. Small movements are treated as clicks.
 */
export function beginFsDrag(e: React.PointerEvent | PointerEvent, ids: string[], onDrop?: (r: DropResult) => void, opts: { threshold?: number; internalDesktop?: boolean } = {}) {
  const sx = e.clientX;
  const sy = e.clientY;
  let started = false;
  const move = (ev: PointerEvent) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < (opts.threshold ?? 5)) return;
    if (!started) {
      started = true;
      dndState.setState({ active: true, ids });
    }
    const p = pt(ev);
    dndState.setState({ x: p.x, y: p.y, copy: ev.altKey });
    const t = targetAt(ev.clientX, ev.clientY);
    if (t !== lastHover) {
      lastHover?.classList.remove('drop-hover');
      if (t && !(t.dataset.dropFolder && ids.includes(t.dataset.dropFolder)) && t.dataset.dropDesktop === undefined) t.classList.add('drop-hover');
      lastHover = t;
    }
  };
  const up = async (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    lastHover?.classList.remove('drop-hover');
    lastHover = null;
    if (!started) return;
    dndState.setState({ active: false, ids: [] });
    // swallow the click following a drag
    const stop = (ce: MouseEvent) => {
      ce.stopPropagation();
      window.removeEventListener('click', stop, true);
    };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 30);
    const t = targetAt(ev.clientX, ev.clientY);
    if (opts.internalDesktop && t?.dataset.dropDesktop !== undefined) {
      const p = pt(ev);
      onDrop?.({ kind: 'desktop', x: p.x, y: p.y, copy: ev.altKey });
      return;
    }
    const r = await dropAt(ev.clientX, ev.clientY, ids, ev.altKey);
    onDrop?.(r);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
