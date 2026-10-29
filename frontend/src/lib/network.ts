import { useEffect, useState } from 'react';
import { useSettings } from '../stores/settings';

interface NetConn extends EventTarget {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface NetworkInfo {
  online: boolean;
  /** wifi / ethernet / cellular … — only reported by some browsers. */
  type: string | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
}

const conn = (): NetConn | undefined => (navigator as Navigator & { connection?: NetConn }).connection;

function read(): NetworkInfo {
  const c = conn();
  return { online: navigator.onLine, type: c?.type ?? null, effectiveType: c?.effectiveType ?? null, downlink: c?.downlink ?? null, rtt: c?.rtt ?? null };
}

/** The browser's real connection state (Network Information API where available). */
export function useNetwork(): NetworkInfo {
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const update = () => setInfo((prev) => {
      const next = read();
      return prev.online === next.online && prev.type === next.type && prev.effectiveType === next.effectiveType && prev.downlink === next.downlink && prev.rtt === next.rtt ? prev : next;
    });
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const c = conn();
    c?.addEventListener('change', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      c?.removeEventListener('change', update);
    };
  }, []);
  return info;
}

/** True when the page has no connection: the simulated Wi‑Fi switch is off, or the browser reports offline. */
export function isOffline(): boolean {
  return !useSettings.getState().network.wifi || !navigator.onLine;
}

export function useOffline(): boolean {
  const wifiOn = useSettings((s) => s.network.wifi);
  const { online } = useNetwork();
  return !wifiOn || !online;
}

/** 0–3 bars from the browser's effective connection type; 3 when it doesn't say. */
export function signalBars(n: NetworkInfo): number {
  if (!n.online) return 0;
  switch (n.effectiveType) {
    case '4g': return 3;
    case '3g': return 2;
    case '2g':
    case 'slow-2g': return 1;
    default: return 3;
  }
}

/** Plain-language name for how the browser says it's connected. */
export function linkLabel(n: NetworkInfo): string {
  switch (n.type) {
    case 'wifi': return 'Wi‑Fi';
    case 'ethernet': return 'Ethernet';
    case 'cellular': return 'Cellular';
    case 'bluetooth': return 'Bluetooth';
    default: return 'Wi‑Fi';
  }
}

/** One-line status for menus: what the browser can truthfully say. */
export function networkSummary(n: NetworkInfo, wifiOn: boolean, name: string | null): string {
  if (!wifiOn) return 'Off';
  if (!n.online) return 'No Internet Connection';
  const speed = n.downlink != null ? ` · ${n.downlink} Mb/s` : '';
  return `${name || linkLabel(n)}${speed}`;
}
