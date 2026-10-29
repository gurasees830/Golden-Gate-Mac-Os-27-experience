import { useEffect, useState } from 'react';
import type { AppProps } from '../../types';
import { TrafficLights, DragRegion } from '../../shell/windowContext';
import { useSettings } from '../../stores/settings';
import { collectSysInfo, gpuLabel, sysInfoReport, type SysInfo } from '../../lib/sysinfo';
import { APP_VERSION } from '../../lib/env';
import { copyText } from '../../lib/download';
import { openApp, openSettings } from '../../shell/actions';
import { useResolvedWallpaper } from '../../shell/Wallpaper';

export function useSysInfo() {
  const [info, setInfo] = useState<SysInfo | null>(null);
  useEffect(() => {
    void collectSysInfo().then(setInfo);
  }, []);
  return info;
}

/** Original laptop illustration showing the current wallpaper on its screen. */
function Laptop() {
  const { url, color } = useResolvedWallpaper();
  return (
    <svg width="200" height="122" viewBox="0 0 200 122" aria-hidden="true">
      <defs>
        <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3e" />
          <stop offset="1" stopColor="#1c1c1e" />
        </linearGradient>
        <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6e6ea" />
          <stop offset="1" stopColor="#a8a8ae" />
        </linearGradient>
        <clipPath id="scr">
          <rect x="26" y="9" width="148" height="95" rx="3" />
        </clipPath>
      </defs>
      <rect x="22" y="4" width="156" height="106" rx="9" fill="url(#lid)" />
      {url ? <image href={url} x="26" y="9" width="148" height="95" preserveAspectRatio="xMidYMid slice" clipPath="url(#scr)" /> : <rect x="26" y="9" width="148" height="95" fill={color ?? '#333'} />}
      <rect x="86" y="9" width="28" height="4" rx="2" fill="#111" />
      <path d="M6 110h188l-6 8a6 6 0 0 1-5 2.5H17a6 6 0 0 1-5-2.5z" fill="url(#base)" />
      <rect x="84" y="110" width="32" height="3" rx="1.5" fill="#8e8e93" />
    </svg>
  );
}

export default function About(_: AppProps) {
  const info = useSysInfo();
  const s = useSettings();
  const manual = s.manualSpecs;
  const rows: [string, string, 'detected' | 'manual' | 'na'][] = info
    ? [
        ['Processor', manual.processor || (info.cores ? `${info.cores} logical cores · model unavailable in browser` : 'Exact model unavailable in browser'), manual.processor ? 'manual' : info.cores ? 'detected' : 'na'],
        ['Memory', manual.memory || (info.memoryGB ? `≈ ${info.memoryGB} GB (browser estimate)` : 'Unavailable in this browser'), manual.memory ? 'manual' : info.memoryGB ? 'detected' : 'na'],
        ['Graphics', manual.graphics || gpuLabel(info.gpu), manual.graphics ? 'manual' : info.gpu.renderer ? 'detected' : 'na'],
        ['Display', `${info.screen.width} × ${info.screen.height} @${info.screen.dpr}x`, 'detected'],
        ['Storage', manual.storage || 'Exact capacity unavailable in browser', manual.storage ? 'manual' : 'na'],
        ['Host OS', `${info.os.name} ${info.os.version} · ${info.browser.name} ${info.browser.version.split('.')[0]}`, 'detected'],
      ]
    : [];
  const report = () => (info ? sysInfoReport(info, { Model: manual.model, Processor: manual.processor, Memory: manual.memory, Graphics: manual.graphics, Storage: manual.storage, 'Serial number': manual.serial }, { computerName: s.computerName, osVersion: s.osVersion, appVersion: APP_VERSION }) : '');
  return (
    <div className="flex flex-col h-full app-surface relative" style={{ background: 'var(--chrome-solid)' }}>
      <DragRegion className="absolute inset-x-0 top-0 h-[40px] z-10 flex items-center">
        <TrafficLights />
      </DragRegion>
      <div className="flex flex-col items-center pt-[34px] px-5 text-center">
        <Laptop />
        <div className="text-[21px] font-bold mt-3 leading-tight">{manual.model || s.computerName}</div>
        <div className="text-[11.5px] muted">Golden Gate {s.osVersion} · browser simulator</div>
      </div>
      <div className="px-5 mt-4 flex flex-col gap-[7px] text-[11.5px]">
        {!info && <div className="mx-auto spinner" />}
        {rows.map(([k, v, src]) => (
          <div key={k} className="flex gap-3">
            <div className="w-[64px] text-right font-semibold flex-none">{k}</div>
            <div className="flex-1 min-w-0 text-left break-words" style={{ color: src === 'na' ? 'var(--text-3)' : 'var(--text-2)' }}>
              {v}
              {src === 'manual' && <span className="ml-1 text-[10px] px-1 rounded bg-[var(--field)]">entered</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto pb-3 pt-3 px-5 flex flex-col items-center gap-2">
        <div className="flex gap-2">
          <button className="btn" onClick={() => openSettings('about')}>
            More Info…
          </button>
          <button className="btn" onClick={() => openApp('systemreport')}>
            System Report…
          </button>
        </div>
        <button className="btn ghost text-[11.5px]" disabled={!info} onClick={() => void copyText(report(), 'System information copied.')}>
          Copy System Information
        </button>
        <div className="text-[10px] faint text-center leading-snug">Independent simulator · not affiliated with Apple. Hardware values come from your browser or what you entered.</div>
      </div>
    </div>
  );
}
