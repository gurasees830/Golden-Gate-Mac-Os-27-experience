import { useEffect, useRef, useState } from 'react';
import { XOctagon, Info } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useWindows } from '../../stores/windows';
import { getApp } from '../../lib/appRegistry';
import { Segmented, SearchField } from '../../components/ui';
import { AppIcon } from '../../icons/AppIcon';
import { measureStorage } from '../../lib/db';
import { formatBytes } from '../../lib/format';
import { useBattery } from '../../lib/battery';
import { confirmDialog } from '../../stores/system';
import { openApp } from '../../shell/actions';

type Tab = 'cpu' | 'memory' | 'energy' | 'disk' | 'network';

/** Real measurements from this browser tab (frame timing, JS heap, DOM size). */
function useMetrics() {
  const [m, setM] = useState({ load: 0, fps: 60, heapUsed: 0, heapTotal: 0, heapLimit: 0, dom: 0, longTasks: 0, history: [] as number[], heapHistory: [] as number[] });
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let busy = 0;
    let longTasks = 0;
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((list) => {
        longTasks += list.getEntries().length;
      });
      obs.observe({ type: 'longtask', buffered: false });
    } catch {
      obs = null;
    }
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      frames++;
      busy += Math.max(0, dt - 16.7);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let windowStart = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const span = now - windowStart;
      windowStart = now;
      const fps = Math.round((frames * 1000) / span);
      const load = Math.min(100, Math.round((busy / span) * 100));
      frames = 0;
      busy = 0;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      setM((p) => ({
        load,
        fps,
        heapUsed: mem?.usedJSHeapSize ?? 0,
        heapTotal: mem?.totalJSHeapSize ?? 0,
        heapLimit: mem?.jsHeapSizeLimit ?? 0,
        dom: document.getElementsByTagName('*').length,
        longTasks,
        history: [...p.history, load].slice(-90),
        heapHistory: [...p.heapHistory, mem ? mem.usedJSHeapSize / mem.jsHeapSizeLimit : 0].slice(-90),
      }));
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tick);
      obs?.disconnect();
    };
  }, []);
  return m;
}

function Graph({ data, color, max = 100 }: { data: number[]; color: string; max?: number }) {
  const pts = data.map((v, i) => `${(i / 89) * 300},${60 - (v / max) * 58}`).join(' ');
  return (
    <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="w-full h-[60px] rounded-[6px]" style={{ background: '#000' }}>
      {[15, 30, 45].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(255,255,255,.08)" />)}
      {data.length > 1 && <polygon points={`0,60 ${pts} ${((data.length - 1) / 89) * 300},60`} fill={color} fillOpacity=".35" />}
      {data.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
}

export default function ActivityMonitor(_: AppProps) {
  const [tab, setTab] = useState<Tab>('cpu');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const windows = useWindows((s) => s.windows);
  const m = useMetrics();
  const battery = useBattery();
  const [disk, setDisk] = useState<Awaited<ReturnType<typeof measureStorage>> | null>(null);
  const [est, setEst] = useState<{ usage?: number; quota?: number }>({});
  const created = useRef(Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    void measureStorage().then(setDisk);
    void navigator.storage?.estimate?.().then((e) => setEst({ usage: e.usage, quota: e.quota }));
    const t = setInterval(() => force((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [tab]);

  const apps = [...new Set(windows.map((w) => w.appId))];
  const procs = [
    ...apps.map((a) => {
      const wins = windows.filter((w) => w.appId === a);
      const dom = wins.reduce((n, w) => n + (document.querySelector(`[data-window-id="${w.id}"]`)?.getElementsByTagName('*').length ?? 0), 0);
      return { id: a, name: getApp(a)?.name ?? a, windows: wins.length, dom, uptime: Date.now() - Math.min(...wins.map((w) => w.createdAt)), user: true };
    }),
    { id: 'windowserver', name: 'Desktop Shell', windows: 0, dom: document.querySelector('.menubar')?.parentElement?.children.length ?? 0, uptime: Date.now() - created.current + performance.now(), user: false },
    { id: 'dock', name: 'Dock', windows: 0, dom: document.querySelectorAll('.dock-ico').length * 8, uptime: performance.now(), user: false },
  ].filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  const quit = async () => {
    if (!sel || !apps.includes(sel)) return;
    if (await confirmDialog(`Are you sure you want to quit this process?`, `“${getApp(sel)?.name}” will close all of its windows.`, 'Force Quit', { icon: 'warning' })) await useWindows.getState().quitApp(sel, true);
  };
  useMenus([{ title: 'View', items: (['cpu', 'memory', 'energy', 'disk', 'network'] as Tab[]).map((t, i) => ({ label: t.toUpperCase() === 'CPU' ? 'CPU' : t[0].toUpperCase() + t.slice(1), shortcut: `mod+${i + 1}`, checked: tab === t, action: () => setTab(t) })) }], [tab]);

  const fmtUp = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const hasHeap = m.heapLimit > 0;

  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar showTitle={false} className="chrome hairline-b !gap-3">
        <div className="font-bold text-[13px] ml-2">Activity Monitor</div>
        <div className="tb-group" data-no-drag>
          <button className="tb-btn" aria-label="Force quit selected" disabled={!sel || !apps.includes(sel)} onClick={() => void quit()}><XOctagon size={15} /></button>
          <button className="tb-btn" aria-label="Open app" disabled={!sel || !apps.includes(sel)} onClick={() => sel && openApp(sel)}><Info size={15} /></button>
        </div>
        <div className="flex-1 flex justify-center" data-no-drag>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'cpu', label: 'CPU' }, { value: 'memory', label: 'Memory' }, { value: 'energy', label: 'Energy' }, { value: 'disk', label: 'Disk' }, { value: 'network', label: 'Network' }]} />
        </div>
        <SearchField width={150} value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search processes" />
      </TitleBar>
      <div className="flex px-3 h-[26px] items-center text-[11.5px] font-medium hairline-b muted gap-3">
        <span className="flex-1">Process Name</span>
        <span className="w-[80px] text-right">Windows</span>
        <span className="w-[110px] text-right">DOM Elements</span>
        <span className="w-[90px] text-right">Uptime</span>
        <span className="w-[70px] text-right">Kind</span>
      </div>
      <div className="flex-1 scroll px-[6px] py-1">
        {procs.map((p, i) => (
          <div key={p.id} className={`list-row gap-3 ${i % 2 ? 'alt' : ''} ${sel === p.id ? 'selected' : ''}`} onClick={() => setSel(p.id)}>
            <span className="flex-1 flex items-center gap-2 truncate">{p.user ? <AppIcon id={p.id} size={16} /> : <span className="w-[16px]" />}{p.name}</span>
            <span className="w-[80px] text-right tabular-nums">{p.windows || '—'}</span>
            <span className="w-[110px] text-right tabular-nums">{p.dom.toLocaleString()}</span>
            <span className="w-[90px] text-right tabular-nums">{fmtUp(p.uptime)}</span>
            <span className="w-[70px] text-right opacity-70">{p.user ? 'App' : 'System'}</span>
          </div>
        ))}
      </div>
      <div className="h-[150px] hairline-t flex gap-6 p-4 text-[12px]" style={{ background: 'var(--bg-2)' }}>
        {tab === 'cpu' && (
          <>
            <div className="w-[230px] grid grid-cols-2 gap-y-1">
              <span className="muted">Main-thread load:</span><span className="text-right tabular-nums font-semibold" style={{ color: '#ff453a' }}>{m.load}%</span>
              <span className="muted">Frame rate:</span><span className="text-right tabular-nums">{m.fps} fps</span>
              <span className="muted">Long tasks:</span><span className="text-right tabular-nums">{m.longTasks}</span>
              <span className="muted">Logical cores:</span><span className="text-right tabular-nums">{navigator.hardwareConcurrency ?? '—'}</span>
              <span className="col-span-2 text-[10.5px] faint mt-1">Measured from this tab’s frame timing — not your computer’s total CPU.</span>
            </div>
            <div className="flex-1 flex flex-col gap-1"><span className="muted text-[11px]">MAIN-THREAD LOAD</span><Graph data={m.history} color="#ff453a" /></div>
          </>
        )}
        {tab === 'memory' && (
          <>
            <div className="w-[260px] grid grid-cols-2 gap-y-1">
              <span className="muted">JS heap used:</span><span className="text-right tabular-nums font-semibold">{hasHeap ? formatBytes(m.heapUsed) : 'n/a'}</span>
              <span className="muted">JS heap allocated:</span><span className="text-right tabular-nums">{hasHeap ? formatBytes(m.heapTotal) : 'n/a'}</span>
              <span className="muted">Heap limit:</span><span className="text-right tabular-nums">{hasHeap ? formatBytes(m.heapLimit) : 'n/a'}</span>
              <span className="muted">DOM elements:</span><span className="text-right tabular-nums">{m.dom.toLocaleString()}</span>
              <span className="col-span-2 text-[10.5px] faint mt-1">{hasHeap ? 'Chrome’s performance.memory for this tab only.' : 'This browser doesn’t expose memory usage.'}</span>
            </div>
            <div className="flex-1 flex flex-col gap-1"><span className="muted text-[11px]">HEAP PRESSURE</span><Graph data={m.heapHistory.map((x) => x * 100)} color="#30d158" /></div>
          </>
        )}
        {tab === 'energy' && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <span className="muted">Battery:</span><span>{battery.supported && battery.level != null ? `${Math.round(battery.level * 100)}%` : 'Not reported by this browser'}</span>
            <span className="muted">Power source:</span><span>{battery.supported ? (battery.charging ? 'Power Adapter' : 'Battery') : '—'}</span>
            <span className="muted">Time remaining:</span><span>{battery.dischargingTime ? `${Math.round(battery.dischargingTime / 60)} min` : '—'}</span>
            <span className="muted">Open windows:</span><span>{windows.length}</span>
          </div>
        )}
        {tab === 'disk' && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <span className="muted">Simulator data:</span><span>{disk ? formatBytes(Object.values(disk).reduce((a, b) => a + b, 0)) : '…'}</span>
            <span className="muted">Photos / Music / Movies:</span><span>{disk ? `${formatBytes(disk.photos)} / ${formatBytes(disk.music)} / ${formatBytes(disk.video)}` : '…'}</span>
            <span className="muted">Browser usage (all data):</span><span>{est.usage != null ? formatBytes(est.usage) : '—'}</span>
            <span className="muted">Browser quota:</span><span>{est.quota != null ? formatBytes(est.quota) : '—'}</span>
          </div>
        )}
        {tab === 'network' && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {(() => {
              const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
              return (
                <>
                  <span className="muted">Online:</span><span>{navigator.onLine ? 'Yes' : 'No'}</span>
                  <span className="muted">Connection type:</span><span>{c?.effectiveType ?? 'Not reported'}</span>
                  <span className="muted">Downlink estimate:</span><span>{c?.downlink != null ? `${c.downlink} Mb/s` : '—'}</span>
                  <span className="muted">Round-trip estimate:</span><span>{c?.rtt != null ? `${c.rtt} ms` : '—'}</span>
                  <span className="muted">Resources loaded:</span><span>{performance.getEntriesByType('resource').length}</span>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
