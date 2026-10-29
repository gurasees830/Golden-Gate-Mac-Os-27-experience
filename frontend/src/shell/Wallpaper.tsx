import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useWindows } from '../stores/windows';
import { create } from 'zustand';
import { useSettings, resolvedTheme } from '../stores/settings';
import { fileUrl, useFs } from '../stores/fs';
import { useClock } from '../lib/clock';

export interface WallpaperDef {
  id: string;
  name: string;
  file?: string;
  dynamic?: { light: string; dark: string; golden?: string };
  group: 'dynamic' | 'landscape' | 'abstract';
}

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'gg-dynamic', name: 'Golden Gate', dynamic: { light: 'gg-day', dark: 'gg-night', golden: 'gg-golden' }, group: 'dynamic' },
  { id: 'folds-dynamic', name: 'Silk Folds', dynamic: { light: 'folds-light', dark: 'folds-dark' }, group: 'dynamic' },
  { id: 'glass-dynamic', name: 'Bay Glass', dynamic: { light: 'glass-light', dark: 'glass-dark' }, group: 'dynamic' },
  { id: 'gg-golden', name: 'Golden Gate · Golden Hour', file: 'gg-golden', group: 'landscape' },
  { id: 'gg-day', name: 'Golden Gate · Day', file: 'gg-day', group: 'landscape' },
  { id: 'gg-night', name: 'Golden Gate · Night', file: 'gg-night', group: 'landscape' },
  { id: 'folds-light', name: 'Silk Folds · Light', file: 'folds-light', group: 'abstract' },
  { id: 'folds-dark', name: 'Silk Folds · Dark', file: 'folds-dark', group: 'abstract' },
  { id: 'glass-light', name: 'Bay Glass · Dawn', file: 'glass-light', group: 'abstract' },
  { id: 'glass-dark', name: 'Bay Glass · Dusk', file: 'glass-dark', group: 'abstract' },
];

export const WALLPAPER_COLORS = ['#1f4e8c', '#2f6f4f', '#8a2f3c', '#4b3f7a', '#c4612b', '#1c1c1e', '#d8d2c8', '#5b7c8d', '#b28a3a', '#3a3f4a'];

export function thumbUrl(file: string) {
  return `./wallpapers/${file}-thumb.jpg`;
}
export function fullUrl(file: string) {
  return `./wallpapers/${file}.jpg`;
}

export const useWallpaperInfo = create<{ dark: boolean; url: string | null }>(() => ({ dark: true, url: null }));

/** Resolve the current wallpaper to a concrete image URL or colour. */
export function useResolvedWallpaper(): { url: string | null; color: string | null; isBridge: boolean } {
  const id = useSettings((s) => s.wallpaper.id);
  const appearance = useSettings((s) => s.appearance);
  const now = useClock(60000);
  const nodes = useFs((s) => s.nodes);
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => {
    if (!id.startsWith('custom:')) return;
    let alive = true;
    void fileUrl(id.slice(7)).then((u) => alive && setCustom(u));
    return () => {
      alive = false;
    };
  }, [id, nodes]);

  if (id.startsWith('color:')) return { url: null, color: id.slice(6), isBridge: false };
  if (id.startsWith('custom:')) return { url: custom, color: custom ? null : '#1c1c1e', isBridge: false };
  const def = WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
  if (def.file) return { url: fullUrl(def.file), color: null, isBridge: def.file.startsWith('gg') };
  const d = def.dynamic!;
  let file: string;
  if (appearance === 'auto' && d.golden) {
    const h = now.getHours() + now.getMinutes() / 60;
    file = h >= 6.5 && h < 17 ? d.light : h >= 17 && h < 19.5 ? d.golden : d.dark;
  } else {
    file = resolvedTheme(appearance) === 'dark' ? d.dark : d.light;
  }
  return { url: fullUrl(file), color: null, isBridge: file.startsWith('gg') };
}

function measureLuma(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 4;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, img.width, img.height * 0.05, 0, 0, 64, 4);
        const d = ctx.getImageData(0, 0, 64, 4).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        resolve(sum / (d.length / 4) / 255);
      } catch {
        resolve(0.3);
      }
    };
    img.onerror = () => resolve(0.3);
    img.src = url;
  });
}

function hexLuma(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Drifting fog over the bridge wallpaper. It is a plain transform tween on its own layer (no blend
 * mode, no filter) and it rests whenever a window is open, because moving pixels under the
 * glass surfaces would force them to re-blur every frame.
 */
function Fog() {
  const ref = useRef<HTMLDivElement>(null);
  const busy = useWindows((s) => s.windows.some((w) => !w.minimized && !w.hidden));
  const tween = useRef<gsap.core.Tween | null>(null);
  useEffect(() => {
    tween.current = gsap.fromTo(ref.current, { xPercent: -4 }, { xPercent: 4, duration: 38, ease: 'sine.inOut', yoyo: true, repeat: -1, force3D: true, paused: true });
    return () => {
      tween.current?.kill();
    };
  }, []);
  useEffect(() => {
    if (busy) tween.current?.pause();
    else tween.current?.play();
  }, [busy]);
  return (
    <div ref={ref} className="absolute inset-x-[-10%] bottom-[8%] h-[38%] pointer-events-none" style={{ opacity: 0.32, willChange: 'transform', background: 'radial-gradient(ellipse 40% 30% at 30% 60%, rgba(255,245,235,.55), transparent 70%), radial-gradient(ellipse 35% 25% at 70% 55%, rgba(255,245,235,.45), transparent 70%), radial-gradient(ellipse 50% 22% at 50% 80%, rgba(255,250,245,.4), transparent 70%)' }} />
  );
}

export function Wallpaper({ blur = 0, dim = 0 }: { blur?: number; dim?: number }) {
  const { url, color, isBridge } = useResolvedWallpaper();
  const fit = useSettings((s) => s.wallpaper.fit);
  const animated = useSettings((s) => s.wallpaper.animated && !s.accessibility.reduceMotion && !s.battery.lowPower);
  const [shown, setShown] = useState<string | null>(url);
  const [prev, setPrev] = useState<string | null>(null);

  useEffect(() => {
    if (url) {
      void measureLuma(url).then((l) => useWallpaperInfo.setState({ dark: l < 0.62, url }));
    } else if (color) {
      useWallpaperInfo.setState({ dark: hexLuma(color) < 0.6, url: null });
    }
    if (url !== shown) {
      // cross-fade between wallpapers once the new one has decoded
      if (!url) {
        setShown(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        setPrev(shown);
        setShown(url);
        setTimeout(() => setPrev(null), 900);
      };
      img.src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, color]);

  const size = fit === 'fill' ? 'cover' : fit === 'fit' ? 'contain' : 'auto';
  const layer = (u: string, extra: React.CSSProperties = {}) => (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `url("${u}")`,
        backgroundSize: size,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        filter: blur ? `blur(${blur}px)` : undefined,
        transform: blur ? 'scale(1.06)' : undefined,
        ...extra,
      }}
    />
  );
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: color ?? '#111' }} aria-hidden="true">
      {prev && layer(prev)}
      {shown && layer(shown, { animation: prev ? 'gg-fade-in .8s ease-out' : undefined })}
      {isBridge && animated && !blur && <Fog />}
      {dim > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${dim})` }} />}
    </div>
  );
}
