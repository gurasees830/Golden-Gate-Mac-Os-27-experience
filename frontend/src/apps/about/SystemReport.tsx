import { useState } from 'react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { useSettings } from '../../stores/settings';
import { useSysInfo } from './About';
import { gpuLabel, sysInfoReport } from '../../lib/sysinfo';
import { APP_VERSION } from '../../lib/env';
import { copyText } from '../../lib/download';
import { formatBytes } from '../../lib/format';
import { Check, X } from 'lucide-react';

const SECTIONS = ['Overview', 'Hardware', 'Graphics/Displays', 'Network', 'Storage', 'Browser Features', 'Software', 'Manual Specs'] as const;

export default function SystemReport(_: AppProps) {
  const info = useSysInfo();
  const s = useSettings();
  const [sec, setSec] = useState<(typeof SECTIONS)[number]>('Overview');
  const m = s.manualSpecs;
  const na = <span className="faint">Unavailable in this browser</span>;
  const rows = (pairs: [string, React.ReactNode][]) => (
    <table className="w-full text-[12.5px]">
      <tbody>
        {pairs.map(([k, v]) => (
          <tr key={k} className="hairline-b">
            <td className="py-[6px] pr-4 w-[220px] align-top font-medium">{k}:</td>
            <td className="py-[6px] selectable break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[200px] sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-2 flex flex-col gap-[2px]">
          {SECTIONS.map((x) => (
            <div key={x} className={`sb-item accent ${sec === x ? 'active' : ''}`} onClick={() => setSec(x)}>
              {x}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} title={`${s.computerName} — System Report`} className="chrome hairline-b">
          <div className="ml-auto" data-no-drag>
            <button className="btn" disabled={!info} onClick={() => info && void copyText(sysInfoReport(info, { Model: m.model, Processor: m.processor, Memory: m.memory, Graphics: m.graphics, Storage: m.storage, 'Serial number': m.serial }, { computerName: s.computerName, osVersion: s.osVersion, appVersion: APP_VERSION }), 'System report copied.')}>
              Copy Report
            </button>
          </div>
        </TitleBar>
        <div className="flex-1 scroll p-5">
          {!info ? (
            <div className="spinner mx-auto mt-10" />
          ) : (
            <>
              <h2 className="text-[15px] font-bold mb-3">{sec}</h2>
              {sec === 'Overview' &&
                rows([
                  ['Computer Name', s.computerName],
                  ['Simulated OS', `Golden Gate ${s.osVersion} (runs in your browser)`],
                  ['Simulator Build', APP_VERSION],
                  ['Host Operating System', `${info.os.name} ${info.os.version}${info.os.detail ? ` — ${info.os.detail}` : ''}`],
                  ['Browser', `${info.browser.name} ${info.browser.version}`],
                  ['Device Model', m.model || info.model || na],
                  ['User', `${s.user.fullName} (${s.user.accountName})`],
                ])}
              {sec === 'Hardware' &&
                rows([
                  ['Processor', m.processor ? `${m.processor} (entered manually)` : 'Exact model is not exposed to web pages'],
                  ['Logical Processors', info.cores ?? na],
                  ['Architecture', [info.architecture, info.bitness].filter(Boolean).join(', ') || na],
                  ['Memory', info.memoryGB ? `≈ ${info.memoryGB} GB — browser-reported, rounded and capped (Device Memory API)` : na],
                  ['Memory (manual)', m.memory || '—'],
                  ['Touch Points', info.touchPoints],
                  ['Platform', info.platform],
                  ['Serial Number', m.serial || 'Not available to web pages'],
                ])}
              {sec === 'Graphics/Displays' &&
                rows([
                  ['GPU', gpuLabel(info.gpu)],
                  ['GPU Vendor (WebGL)', info.gpu.vendor ?? na],
                  ['Renderer string', info.gpu.renderer ?? na],
                  ['WebGL 2', info.gpu.webgl2 ? 'Supported' : 'Not supported'],
                  ['WebGPU', info.gpu.webgpu ? 'Supported' : 'Not supported'],
                  ['Screen Resolution', `${info.screen.width} × ${info.screen.height} (CSS pixels)`],
                  ['Native Pixels (approx.)', `${Math.round(info.screen.width * info.screen.dpr)} × ${Math.round(info.screen.height * info.screen.dpr)}`],
                  ['Available Area', `${info.screen.availWidth} × ${info.screen.availHeight}`],
                  ['Device Pixel Ratio', info.screen.dpr],
                  ['Colour Depth', `${info.screen.colorDepth}-bit`],
                  ['HDR', info.screen.hdr ? 'Yes' : 'No'],
                  ['Refresh Rate (measured)', info.screen.refresh ? `≈ ${info.screen.refresh} Hz` : na],
                  ['Browser Viewport', `${info.viewport.width} × ${info.viewport.height}`],
                ])}
              {sec === 'Network' &&
                rows([
                  ['Online', info.online ? 'Yes' : 'No'],
                  ['Effective Type', info.connection?.effectiveType ?? na],
                  ['Downlink (est.)', info.connection?.downlink != null ? `${info.connection.downlink} Mb/s` : na],
                  ['Round-trip (est.)', info.connection?.rtt != null ? `${info.connection.rtt} ms` : na],
                  ['Data Saver', info.connection?.saveData != null ? (info.connection.saveData ? 'On' : 'Off') : na],
                  ['Wi‑Fi switch (in Golden Gate)', s.network.wifi ? (s.network.ssid ? `On · ${s.network.ssid} (entered by you)` : 'On') : 'Off'],
                ])}
              {sec === 'Storage' &&
                rows([
                  ['Disk Capacity', m.storage ? `${m.storage} (entered manually)` : 'Not available to web pages'],
                  ['Browser Quota for this Site', info.storage.quota != null ? `${formatBytes(info.storage.quota)} — this is a browser limit, not your disk size` : na],
                  ['Used by Simulator', info.storage.usage != null ? formatBytes(info.storage.usage) : na],
                  ['Persistent Storage', info.storage.persisted == null ? na : info.storage.persisted ? 'Granted' : 'Best-effort (may be cleared under pressure)'],
                ])}
              {sec === 'Browser Features' && (
                <div className="grid grid-cols-2 gap-x-6">
                  {Object.entries(info.features).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 py-[5px] hairline-b text-[12.5px]">
                      {v ? <Check size={14} className="text-[#34c759]" /> : <X size={14} className="text-[#ff3b30]" />}
                      {k}
                    </div>
                  ))}
                </div>
              )}
              {sec === 'Software' &&
                rows([
                  ['Language', info.language],
                  ['Preferred Languages', info.languages.join(', ')],
                  ['Time Zone', info.timeZone],
                  ['Cookies', info.cookies ? 'Enabled' : 'Disabled'],
                  ['User Agent', info.userAgent],
                ])}
              {sec === 'Manual Specs' && <ManualSpecs />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ManualSpecs() {
  const m = useSettings((s) => s.manualSpecs);
  const patch = useSettings((s) => s.patch);
  const fields: [keyof typeof m, string, string][] = [
    ['model', 'Model name', 'e.g. HP Pavilion 15'],
    ['processor', 'Processor', 'e.g. Intel Core i5-1235U'],
    ['memory', 'Memory', 'e.g. 16 GB DDR4'],
    ['graphics', 'Graphics', 'e.g. Intel Iris Xe'],
    ['storage', 'Storage', 'e.g. 512 GB SSD'],
    ['serial', 'Serial number', 'optional'],
  ];
  return (
    <div className="flex flex-col gap-3 max-w-[460px]">
      <p className="text-[12px] muted">Browsers can’t read these details. If you enter them, About This Mac shows them labelled as “entered”. They’re stored only in this browser.</p>
      {fields.map(([k, label, ph]) => (
        <label key={k} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-[120px] text-right">{label}</span>
          <input className="field flex-1" placeholder={ph} value={m[k]} onChange={(e) => patch('manualSpecs', { [k]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}
