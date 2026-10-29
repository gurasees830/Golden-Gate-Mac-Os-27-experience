import { useEffect, useState } from 'react';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export interface BatteryInfo {
  supported: boolean;
  level: number | null;
  charging: boolean;
  chargingTime: number | null;
  dischargingTime: number | null;
}

const history: { t: number; level: number }[] = [];
export function batteryHistory() {
  return history;
}

let cached: Promise<BatteryManagerLike | null> | null = null;
function getBattery(): Promise<BatteryManagerLike | null> {
  if (!cached) {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    cached = nav.getBattery ? nav.getBattery().catch(() => null) : Promise.resolve(null);
  }
  return cached;
}

/** Real battery status from the Battery Status API where the browser supports it. */
export function useBattery(): BatteryInfo {
  const [info, setInfo] = useState<BatteryInfo>({ supported: false, level: null, charging: false, chargingTime: null, dischargingTime: null });
  useEffect(() => {
    let b: BatteryManagerLike | null = null;
    const update = () => {
      if (!b) return;
      setInfo({
        supported: true,
        level: b.level,
        charging: b.charging,
        chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : null,
        dischargingTime: Number.isFinite(b.dischargingTime) ? b.dischargingTime : null,
      });
      const last = history[history.length - 1];
      if (!last || Date.now() - last.t > 60000 || last.level !== b.level) history.push({ t: Date.now(), level: b.level });
      if (history.length > 500) history.shift();
    };
    void getBattery().then((bm) => {
      b = bm;
      if (!b) return;
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    });
    return () => {
      if (b) {
        b.removeEventListener('levelchange', update);
        b.removeEventListener('chargingchange', update);
      }
    };
  }, []);
  return info;
}
