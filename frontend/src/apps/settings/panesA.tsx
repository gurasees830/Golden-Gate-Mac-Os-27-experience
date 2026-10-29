import { useEffect, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { useSettings } from '../../stores/settings';
import { Group, Row, Toggle, Popup } from '../../components/ui';
import { linkLabel, signalBars, useNetwork } from '../../lib/network';
import { WifiGlyph, BatteryGlyph } from '../../icons/Glyphs';
import { useBattery, batteryHistory } from '../../lib/battery';
import { PaneHeader, PaneIcon, type PaneProps } from './Settings';
import { useSystem } from '../../stores/system';

export function WifiPane() {
  const n = useSettings((s) => s.network);
  const patch = useSettings((s) => s.patch);
  const real = useNetwork();
  return (
    <>
      <PaneHeader id="wifi" title="Wi‑Fi">
        Connection details come from your browser. Web pages can’t read the name of your Wi‑Fi network or list nearby ones. Turning Wi‑Fi off here makes apps inside Golden Gate behave offline; it doesn’t change your computer’s real connection.
      </PaneHeader>
      <Group>
        <Row label="Wi‑Fi">
          <Toggle on={n.wifi} onChange={(v) => patch('network', { wifi: v })} />
        </Row>
        {n.wifi && (
          <Row label={<span className="flex items-center gap-2"><WifiGlyph on={real.online} strength={signalBars(real)} size={14} /> {n.ssid || linkLabel(real)}</span>} sub={real.online ? 'Connected' : 'No Internet Connection'} />
        )}
      </Group>
      <Group title="Network Name" footer="Optional. Shown in the menu bar and Control Center instead of a generic name. It is only stored here and labelled as entered by you.">
        <Row label="Name">
          <input className="field" style={{ width: 200 }} aria-label="Network name" placeholder={linkLabel(real)} value={n.ssid ?? ''} onChange={(e) => patch('network', { ssid: e.target.value || null })} />
        </Row>
      </Group>
      <Group title="Your Real Connection" footer="Reported by your browser (Network Information API where supported).">
        <Row label="Status">{real.online ? 'Online' : 'Offline'}</Row>
        <Row label="Link type">{real.type ?? 'Not reported'}</Row>
        <Row label="Connection quality">{real.effectiveType ?? 'Not reported'}</Row>
        <Row label="Estimated bandwidth">{real.downlink != null ? `${real.downlink} Mb/s` : 'Not reported'}</Row>
        <Row label="Estimated latency">{real.rtt != null ? `${real.rtt} ms` : 'Not reported'}</Row>
      </Group>
    </>
  );
}

export function BluetoothPane() {
  const n = useSettings((s) => s.network);
  const patch = useSettings((s) => s.patch);
  const devices = ['Magic Keyboard', 'Wireless Headphones', 'Trackpad', 'Game Controller'];
  const hasWebBt = 'bluetooth' in navigator;
  return (
    <>
      <PaneHeader id="bluetooth" title="Bluetooth">Simulated devices. Connecting them here doesn’t pair real hardware.</PaneHeader>
      <Group>
        <Row label="Bluetooth">
          <Toggle on={n.bluetooth} onChange={(v) => patch('network', { bluetooth: v })} />
        </Row>
      </Group>
      {n.bluetooth && (
        <Group title="My Devices">
          {devices.map((d) => {
            const c = n.btConnected.includes(d);
            return (
              <Row key={d} label={d} sub={c ? 'Connected' : 'Not Connected'}>
                <button className="btn" onClick={() => patch('network', { btConnected: c ? n.btConnected.filter((x) => x !== d) : [...n.btConnected, d] })}>{c ? 'Disconnect' : 'Connect'}</button>
              </Row>
            );
          })}
        </Group>
      )}
      <Group title="Real Devices" footer={hasWebBt ? 'Uses Web Bluetooth. Your browser asks before showing nearby devices; nothing is paired by the simulator.' : 'Your browser doesn’t support Web Bluetooth.'}>
        <Row label="Scan for nearby Bluetooth devices">
          <button
            className="btn"
            disabled={!hasWebBt}
            onClick={async () => {
              try {
                const nav = navigator as Navigator & { bluetooth: { requestDevice: (o: unknown) => Promise<{ name?: string }> } };
                const dev = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
                useSystem.getState().showToast(`Found “${dev.name ?? 'Unnamed device'}”. Golden Gate can only list it, not pair it.`);
              } catch (e) {
                useSystem.getState().showToast(`Bluetooth scan unavailable: ${(e as Error).message}`);
              }
            }}
          >
            Scan…
          </button>
        </Row>
      </Group>
    </>
  );
}

export function NetworkPane({ nav }: PaneProps) {
  const n = useSettings((s) => s.network);
  const patch = useSettings((s) => s.patch);
  return (
    <>
      <PaneHeader id="network" title="Network" />
      <Group>
        <Row label={<span className="flex items-center gap-2"><PaneIcon id="wifi" size={20} /> Wi‑Fi</span>} sub={n.wifi ? (n.ssid ? `Connected to ${n.ssid}` : 'On') : 'Off'}>
          <button className="btn ghost" onClick={() => nav('wifi')}><ChevronRight size={14} /></button>
        </Row>
        <Row label="Ethernet" sub="Not connected" />
        <Row label="Thunderbolt Bridge" sub="Not connected" />
      </Group>
      <Group footer="The simulated firewall blocks simulated incoming connections only.">
        <Row label="Firewall" sub={n.firewall ? 'On' : 'Off'}>
          <Toggle on={n.firewall} onChange={(v) => patch('network', { firewall: v })} />
        </Row>
      </Group>
    </>
  );
}

export function BatteryPane() {
  const b = useBattery();
  const lp = useSettings((s) => s.battery.lowPower);
  const items = useSettings((s) => s.menubar.items);
  const patch = useSettings((s) => s.patch);
  const hist = batteryHistory();
  return (
    <>
      <PaneHeader id="battery" title="Battery">Values come from your browser’s Battery Status API where supported.</PaneHeader>
      {!b.supported ? (
        <Group footer="Firefox and Safari don’t expose battery information to web pages, and desktop PCs have no battery.">
          <Row label="Battery information" sub="Not available in this browser" />
        </Group>
      ) : (
        <Group>
          <Row label="Battery Level">
            <span className="flex items-center gap-2 tabular-nums">
              <BatteryGlyph level={b.level} charging={b.charging} /> {b.level != null ? `${Math.round(b.level * 100)}%` : '—'}
            </span>
          </Row>
          <Row label="Power Source">{b.charging ? 'Power Adapter' : 'Battery'}</Row>
          {b.charging && b.chargingTime != null && <Row label="Time until full">{Math.round(b.chargingTime / 60)} min</Row>}
          {!b.charging && b.dischargingTime != null && <Row label="Time remaining">{Math.floor(b.dischargingTime / 3600)} h {Math.round((b.dischargingTime % 3600) / 60)} min</Row>}
          {hist.length > 1 && (
            <div className="px-3 py-3">
              <div className="text-[11px] muted mb-1">Level during this session</div>
              <svg viewBox="0 0 300 60" className="w-full h-[60px]">
                <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={hist.map((h, i) => `${(i / (hist.length - 1)) * 300},${60 - h.level * 56}`).join(' ')} />
              </svg>
            </div>
          )}
        </Group>
      )}
      <Group footer="Low Power Mode in Golden Gate turns off animated wallpapers and reduces animations to save energy.">
        <Row label="Low Power Mode">
          <Toggle on={lp} onChange={(v) => patch('battery', { lowPower: v })} />
        </Row>
        <Row label="Show battery in menu bar">
          <Toggle on={items.battery} onChange={(v) => patch('menubar', { items: { ...items, battery: v } })} />
        </Row>
        <Row label="Show percentage">
          <Toggle on={items.batteryPercent} onChange={(v) => patch('menubar', { items: { ...items, batteryPercent: v } })} />
        </Row>
      </Group>
    </>
  );
}

export function GeneralPane({ nav }: PaneProps) {
  const computer = useSettings((s) => s.computerName);
  const set = useSettings((s) => s.set);
  const airdrop = useSettings((s) => s.network.airdrop);
  const patch = useSettings((s) => s.patch);
  const link = (id: string, label: string) => (
    <Row key={id} label={<span className="flex items-center gap-2"><PaneIcon id={id} size={20} /> {label}</span>} className="cursor-default">
      <button className="btn ghost" aria-label={label} onClick={() => nav(id)}>
        <ChevronRight size={14} />
      </button>
    </Row>
  );
  return (
    <>
      <PaneHeader id="general" title="General">Manage your overall setup and preferences for the simulator, such as software updates, language, AirDrop and more.</PaneHeader>
      <Group>
        {link('about', 'About')}
        {link('softwareupdate', 'Software Update')}
        {link('storage', 'Storage')}
      </Group>
      <Group>
        <Row label="AirDrop" sub="Simulated">
          <Popup value={airdrop} onChange={(v) => patch('network', { airdrop: v })} options={[{ value: 'off', label: 'Receiving Off' }, { value: 'contacts', label: 'Contacts Only' }, { value: 'everyone', label: 'Everyone for 10 Minutes' }]} />
        </Row>
        {link('loginitems', 'Login Items & Extensions')}
      </Group>
      <Group>
        {link('datetime', 'Date & Time')}
        {link('language', 'Language & Region')}
      </Group>
      <Group>
        <Row label="Computer name" sub="Shown in About This Mac, Terminal and the login screen.">
          <input className="field !w-[200px]" value={computer} onChange={(e) => set({ computerName: e.target.value })} />
        </Row>
        {link('timemachine', 'Time Machine')}
        {link('applications', 'Applications')}
      </Group>
    </>
  );
}
