import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../../stores/settings';
import { Group, Row, Toggle, Popup } from '../../components/ui';
import { allApps, getApp } from '../../lib/appRegistry';
import { isInstalled, useApps, installedVersion } from '../../stores/apps';
import { AppIcon } from '../../icons/AppIcon';
import { PaneHeader } from './Settings';
import { useClock } from '../../lib/clock';
import { measureStorage, exportAllData, importAllData, eraseAllData } from '../../lib/db';
import { formatBytes } from '../../lib/format';
import { useFs, trashItems } from '../../stores/fs';
import { emptyTrash, openApp, restart } from '../../shell/actions';
import { confirmDialog, showDialog, useSystem } from '../../stores/system';
import { saveToHost } from '../../lib/download';
import { uninstallApp } from '../../shell/Launchpad';
import { useSysInfo } from '../about/About';
import { gpuLabel } from '../../lib/sysinfo';
import { APP_VERSION } from '../../lib/env';
import { ManualSpecs } from '../about/SystemReport';

const ZONES = ['auto', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];

export function DateTimePane() {
  const dt = useSettings((s) => s.dateTime);
  const clock = useSettings((s) => s.menubar.clock);
  const patch = useSettings((s) => s.patch);
  const now = useClock(1000);
  const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <>
      <PaneHeader id="datetime" title="Date & Time">
        {now.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' })}
      </PaneHeader>
      <Group footer="Setting the time manually changes the simulator’s clock only (menu bar, Calendar, alarms). Your computer’s clock is unchanged.">
        <Row label="Set time and date automatically" sub="Uses your computer’s clock.">
          <Toggle on={dt.auto} onChange={(v) => patch('dateTime', { auto: v, offsetMs: v ? 0 : dt.offsetMs })} />
        </Row>
        {!dt.auto && (
          <Row label="Date and time">
            <input
              type="datetime-local"
              className="field !w-[220px]"
              value={toLocalInput(now)}
              onChange={(e) => {
                const target = new Date(e.target.value).getTime();
                if (!Number.isNaN(target)) patch('dateTime', { offsetMs: target - Date.now() });
              }}
            />
          </Row>
        )}
        <Row label="Time zone">
          <Popup value={dt.timeZone} onChange={(v) => patch('dateTime', { timeZone: v })} options={ZONES.map((z) => ({ value: z, label: z === 'auto' ? `Automatic (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : z.replace('_', ' ') }))} />
        </Row>
      </Group>
      <Group>
        <Row label="24-hour time">
          <Toggle on={clock.use24h} onChange={(v) => patch('menubar', { clock: { ...clock, use24h: v } })} />
        </Row>
        <Row label="Show the time with seconds">
          <Toggle on={clock.showSeconds} onChange={(v) => patch('menubar', { clock: { ...clock, showSeconds: v } })} />
        </Row>
      </Group>
    </>
  );
}

export function LanguagePane() {
  const r = useSettings((s) => s.region);
  const patch = useSettings((s) => s.patch);
  const locales = [...new Set([navigator.language, 'en-US', 'en-GB', 'en-IN', 'hi-IN', 'pa-IN', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP', 'zh-CN'])];
  const sample = new Date();
  return (
    <>
      <PaneHeader id="language" title="Language & Region">The interface is in English; region settings change date, number and unit formats across apps.</PaneHeader>
      <Group>
        <Row label="Region & formats">
          <Popup value={r.locale} onChange={(v) => patch('region', { locale: v })} options={locales.map((l) => ({ value: l, label: (() => { try { return `${new Intl.DisplayNames([l], { type: 'region' }).of(l.split('-')[1] ?? 'US')} (${l})`; } catch { return l; } })() }))} />
        </Row>
        <Row label="First day of week">
          <Popup value={r.firstDayOfWeek} onChange={(v) => patch('region', { firstDayOfWeek: v })} options={[{ value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 6, label: 'Saturday' }]} />
        </Row>
        <Row label="Temperature">
          <Popup value={r.tempUnit} onChange={(v) => patch('region', { tempUnit: v })} options={[{ value: 'C', label: 'Celsius (°C)' }, { value: 'F', label: 'Fahrenheit (°F)' }]} />
        </Row>
        <Row label="Measurement system">
          <Popup value={r.measurement} onChange={(v) => patch('region', { measurement: v })} options={[{ value: 'metric', label: 'Metric' }, { value: 'us', label: 'US' }]} />
        </Row>
      </Group>
      <div className="card p-4 text-[12px]">
        <div className="font-semibold mb-1">Format preview</div>
        <div>{sample.toLocaleString(r.locale, { dateStyle: 'full', timeStyle: 'short' })}</div>
        <div>{(1234567.89).toLocaleString(r.locale)} · {(0.42).toLocaleString(r.locale, { style: 'percent' })}</div>
      </div>
    </>
  );
}

export function LoginItemsPane() {
  const items = useSettings((s) => s.loginItems);
  const reopen = useSettings((s) => s.reopenWindows);
  const set = useSettings((s) => s.set);
  useApps();
  const candidates = allApps().filter((a) => !a.hidden && isInstalled(a.id) && !items.includes(a.id) && a.id !== 'launchpad');
  const [add, setAdd] = useState(candidates[0]?.id ?? '');
  return (
    <>
      <PaneHeader id="loginitems" title="Login Items">These apps open automatically when you log in.</PaneHeader>
      <Group title="Open at Login">
        {items.length === 0 && <Row label={<span className="muted">No login items</span>} />}
        {items.map((id) => (
          <Row key={id} label={<span className="flex items-center gap-2"><AppIcon id={id} size={20} /> {getApp(id)?.name}</span>}>
            <button className="btn ghost" aria-label="Remove" onClick={() => set({ loginItems: items.filter((x) => x !== id) })}>
              <Trash2 size={13} />
            </button>
          </Row>
        ))}
        <Row label="">
          <select className="popup" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="App to add">
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn" disabled={!add} onClick={() => set({ loginItems: [...items, add] })}>
            <Plus size={13} /> Add
          </button>
        </Row>
      </Group>
      <Group>
        <Row label="Reopen windows when logging back in">
          <Toggle on={reopen} onChange={(v) => set({ reopenWindows: v })} />
        </Row>
      </Group>
    </>
  );
}

export function StoragePane() {
  const nodes = useFs((s) => s.nodes);
  const autoEmpty = useSettings((s) => s.finder.autoEmptyTrash);
  const patch = useSettings((s) => s.patch);
  const [m, setM] = useState<Awaited<ReturnType<typeof measureStorage>> | null>(null);
  const [est, setEst] = useState<{ quota?: number; usage?: number } | null>(null);
  useEffect(() => {
    void measureStorage().then(setM);
    void navigator.storage?.estimate?.().then((e) => setEst({ quota: e.quota, usage: e.usage }));
  }, [nodes]);
  const trashSize = trashItems(nodes).reduce((a, n) => a + n.size, 0);
  const cats = m
    ? [
        { k: 'Photos', v: m.photos, c: '#ff9f0a' },
        { k: 'Music', v: m.music, c: '#ff375f' },
        { k: 'Movies', v: m.video, c: '#5e5ce6' },
        { k: 'Documents', v: m.documents, c: '#0a84ff' },
        { k: 'Other Files', v: m.files, c: '#30b0c7' },
        { k: 'App Data', v: m.appData, c: '#34c759' },
        { k: 'System Data', v: m.system, c: '#8e8e93' },
      ]
    : [];
  const total = cats.reduce((a, c) => a + c.v, 0) || 1;
  return (
    <>
      <PaneHeader id="storage" title="Storage">Measured from the simulator’s own data in this browser. This isn’t your computer’s disk.</PaneHeader>
      <div className="card p-4 mb-5">
        <div className="flex justify-between text-[13px] font-semibold">
          <span>Golden Gate HD (virtual)</span>
          <span className="muted font-normal">{formatBytes(total)} used{est?.quota ? ` of ${formatBytes(est.quota)} browser quota` : ''}</span>
        </div>
        <div className="flex h-[22px] rounded-[6px] overflow-hidden mt-3" style={{ background: 'var(--field)' }}>
          {cats.map((c) => (
            <div key={c.k} title={`${c.k}: ${formatBytes(c.v)}`} style={{ width: `${(c.v / total) * 100}%`, background: c.c, minWidth: c.v ? 2 : 0 }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11.5px]">
          {cats.map((c) => (
            <span key={c.k} className="flex items-center gap-1">
              <span className="w-[8px] h-[8px] rounded-full" style={{ background: c.c }} /> {c.k} <span className="muted">{formatBytes(c.v)}</span>
            </span>
          ))}
        </div>
      </div>
      <Group title="Recommendations">
        <Row label="Empty Trash Automatically" sub="Erase items that have been in the Trash for more than 30 days.">
          <Toggle on={autoEmpty} onChange={(v) => patch('finder', { autoEmptyTrash: v })} />
        </Row>
        <Row label="Trash" sub={formatBytes(trashSize)}>
          <button className="btn" disabled={!trashSize} onClick={() => void emptyTrash()}>Empty Trash…</button>
        </Row>
        <Row label="Request persistent storage" sub="Asks the browser not to clear the simulator’s data under storage pressure.">
          <button className="btn" onClick={async () => {
            const ok = await navigator.storage?.persist?.();
            useSystem.getState().showToast(ok ? 'Persistent storage granted.' : 'The browser declined persistent storage.');
          }}>Request</button>
        </Row>
      </Group>
    </>
  );
}

export function ApplicationsPane() {
  const apps = useApps();
  const list = useMemo(() => allApps().filter((a) => !a.hidden && isInstalled(a.id, apps) && a.id !== 'launchpad').sort((a, b) => a.name.localeCompare(b.name)), [apps]);
  return (
    <>
      <PaneHeader id="applications" title="Applications">{list.length} apps installed in the simulator.</PaneHeader>
      <Group>
        {list.map((a) => (
          <Row key={a.id} label={<span className="flex items-center gap-2"><AppIcon id={a.id} size={22} /> {a.name}</span>} sub={`${a.category} · Version ${installedVersion(a.id) ?? '—'}${a.store ? ` · ${a.store.sizeMB} MB` : ''}`}>
            <button className="btn" onClick={() => openApp(a.id)}>Open</button>
            <button className="btn" disabled={a.system} onClick={() => void uninstallApp(a)}>Delete…</button>
          </Row>
        ))}
      </Group>
    </>
  );
}

export function SoftwareUpdatePane() {
  const v = useSettings((s) => s.osVersion);
  const set = useSettings((s) => s.set);
  const [state, setState] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle');
  const [p, setP] = useState(0);
  const latest = '27.2';
  const upToDate = v === latest;
  useEffect(() => {
    if (state !== 'checking') return;
    const t = setTimeout(() => setState(upToDate ? 'idle' : 'available'), 1600);
    return () => clearTimeout(t);
  }, [state, upToDate]);
  useEffect(() => {
    if (state !== 'downloading') return;
    const t = setInterval(() => setP((x) => {
      if (x >= 1) {
        setState('ready');
        return 1;
      }
      return x + 0.04;
    }), 160);
    return () => clearInterval(t);
  }, [state]);
  return (
    <>
      <PaneHeader id="softwareupdate" title="Software Update">Golden Gate {v}</PaneHeader>
      <Group footer="Updates here change the simulator’s version number and show the update experience. They don’t download or install anything on your computer.">
        <Row label={upToDate && state !== 'checking' ? 'Your simulator is up to date' : state === 'checking' ? 'Checking for updates…' : state === 'idle' ? 'Check for simulator updates' : `Golden Gate ${latest}`} sub={state === 'available' ? 'Includes Liquid Glass refinements and bug fixes. 1.4 GB (simulated)' : state === 'downloading' ? `Preparing update… ${Math.round(p * 100)}%` : state === 'ready' ? 'Restart to finish installing.' : undefined}>
          {state === 'idle' && <button className="btn" onClick={() => setState('checking')}>Check Now</button>}
          {state === 'checking' && <div className="spinner" />}
          {state === 'available' && <button className="btn primary" onClick={() => setState('downloading')}>Update Now</button>}
          {state === 'downloading' && <div className="w-[120px] h-[6px] rounded-full bg-[var(--field)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${p * 100}%` }} /></div>}
          {state === 'ready' && (
            <button className="btn primary" onClick={async () => {
              const ok = await confirmDialog('Restart to install Golden Gate 27.2?', 'Open windows will close.', 'Restart');
              if (!ok) return;
              set({ osVersion: latest });
              void restart('update');
            }}>Restart Now</button>
          )}
        </Row>
      </Group>
      <Group>
        <Row label="App updates" sub="Managed in the App Store.">
          <button className="btn" onClick={() => openApp('appstore', { tab: 'updates' })}>Open App Store</button>
        </Row>
      </Group>
    </>
  );
}

export function TimeMachinePane() {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PaneHeader id="timemachine" title="Time Machine">Back up everything in the simulator — files, settings, notes, events and more — to a file on your computer, and restore it later.</PaneHeader>
      <Group>
        <Row label="Back Up Now" sub="Exports a .ggbackup (JSON) file.">
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const json = await exportAllData();
              await saveToHost(new Blob([json], { type: 'application/json' }), `Golden Gate Backup ${new Date().toISOString().slice(0, 10)}.ggbackup`);
            } finally {
              setBusy(false);
            }
          }}>Back Up…</button>
        </Row>
        <Row label="Restore from Backup" sub="Replaces all current simulator data, then restarts.">
          <button className="btn" onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ggbackup,.json,application/json';
            input.onchange = async () => {
              const f = input.files?.[0];
              if (!f) return;
              const ok = await confirmDialog('Restore this backup?', 'Everything currently in the simulator will be replaced.', 'Restore', { icon: 'warning' });
              if (!ok) return;
              try {
                await importAllData(await f.text());
                location.reload();
              } catch (e) {
                useSystem.getState().showToast((e as Error).message);
              }
            };
            input.click();
          }}>Restore…</button>
        </Row>
      </Group>
      <Group title="Transfer or Reset">
        <Row label="Erase All Content and Settings" sub="Deletes everything stored by the simulator in this browser and starts setup again.">
          <button className="btn" style={{ color: '#ff3b30' }} onClick={async () => {
            const r = await showDialog({ title: 'Erase all content and settings?', message: 'All files, settings and app data stored by Golden Gate in this browser will be permanently deleted.', icon: 'warning', buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Erase', value: 'ok', primary: true, danger: true }] });
            if (r.value !== 'ok') return;
            await eraseAllData();
            location.reload();
          }}>Erase…</button>
        </Row>
      </Group>
    </>
  );
}

export function AboutPane() {
  const s = useSettings();
  const info = useSysInfo();
  return (
    <>
      <PaneHeader id="about" title={s.manualSpecs.model || s.computerName}>Golden Gate {s.osVersion} — independent browser simulator inspired by macOS (not affiliated with Apple).</PaneHeader>
      <Group title="Detected">
        <Row label="Host OS">{info ? `${info.os.name} ${info.os.version}` : '…'}</Row>
        <Row label="Browser">{info ? `${info.browser.name} ${info.browser.version}` : '…'}</Row>
        <Row label="Logical processors">{info?.cores ?? 'Unavailable'}</Row>
        <Row label="Memory">{info?.memoryGB ? `≈ ${info.memoryGB} GB (browser estimate)` : 'Unavailable'}</Row>
        <Row label="Graphics">{info ? gpuLabel(info.gpu) : '…'}</Row>
        <Row label="Display">{`${screen.width} × ${screen.height} @${window.devicePixelRatio}x`}</Row>
        <Row label="Simulator build">{APP_VERSION}</Row>
      </Group>
      <Group title="Enter Your Specs">
        <div className="p-3">
          <ManualSpecs />
        </div>
      </Group>
      <Group>
        <Row label="System Report">
          <button className="btn" onClick={() => openApp('systemreport')}>Open…</button>
        </Row>
      </Group>
    </>
  );
}

export { restart };
