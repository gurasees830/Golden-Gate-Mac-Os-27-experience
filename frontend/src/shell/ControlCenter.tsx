import { useState, type ReactNode } from 'react';
import { Bluetooth, Moon, Sun, Volume2, Radio, Play, Pause, SkipForward, SkipBack, ChevronRight, Maximize, Contrast, Briefcase, User, BedDouble, Camera } from 'lucide-react';
import { useSettings, type FocusMode } from '../stores/settings';
import { useSystem } from '../stores/system';
import { useMedia, currentTrackName } from '../stores/media';
import { useBattery } from '../lib/battery';
import { Slider } from '../components/ui';
import { WifiGlyph, BatteryGlyph } from '../icons/Glyphs';
import { openSettings, takeScreenshot, toggleBrowserFullscreen } from './actions';
import { playUi } from '../lib/sound';
import { linkLabel, networkSummary, signalBars, useNetwork } from '../lib/network';

const FOCUS: { id: FocusMode; label: string; icon: ReactNode; color: string }[] = [
  { id: 'dnd', label: 'Do Not Disturb', icon: <Moon size={15} fill="currentColor" />, color: '#5e5ce6' },
  { id: 'work', label: 'Work', icon: <Briefcase size={15} />, color: '#30b0c7' },
  { id: 'personal', label: 'Personal', icon: <User size={15} />, color: '#bf5af2' },
  { id: 'sleep', label: 'Sleep', icon: <BedDouble size={15} />, color: '#34c759' },
];

function Tile({ children, className = '', onClick, style }: { children: ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-[18px] p-[10px] ${className}`} style={{ background: 'var(--glass-strong)', boxShadow: 'inset 0 0 0 0.5px var(--glass-border), 0 1px 2px rgba(0,0,0,.06)', ...style }} onClick={onClick}>
      {children}
    </div>
  );
}

function Circle({ on, children, onClick, label }: { on: boolean; children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-[30px] h-[30px] rounded-full border-0 grid place-items-center flex-none transition-colors"
      style={{ background: on ? 'var(--accent)' : 'rgba(128,128,128,.22)', color: on ? '#fff' : 'var(--text)' }}
    >
      {children}
    </button>
  );
}

export function ControlCenter() {
  const open = useSystem((s) => s.controlCenter);
  const s = useSettings();
  const media = useMedia();
  const battery = useBattery();
  const [expand, setExpand] = useState<null | 'wifi' | 'bt' | 'focus' | 'display'>(null);
  const real = useNetwork();
  if (!open) return null;
  const n = s.network;
  const focusOn = !!s.focus.active;
  const track = currentTrackName();

  if (expand) {
    return (
      <div className="absolute right-[8px] top-[34px] z-[9200] w-[320px] menu-panel anim-pop" style={{ padding: 14, borderRadius: 22 }} onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn ghost mb-2 -ml-2 !justify-start" onClick={() => setExpand(null)}>
          ‹ Control Center
        </button>
        {expand === 'wifi' && (
          <>
            <div className="flex items-center justify-between font-semibold text-[14px]">
              Wi‑Fi
              <Circle on={n.wifi} label="Wi-Fi" onClick={() => s.patch('network', { wifi: !n.wifi })}>
                <WifiGlyph on={n.wifi} size={14} />
              </Circle>
            </div>
            {n.wifi && (
              <div className="mt-3 menu-item enabled w-full" style={{ paddingLeft: 6 }}>
                <WifiGlyph on={real.online} strength={signalBars(real)} size={14} /> {n.ssid || linkLabel(real)}
                <span className="ml-auto text-[11px] opacity-70">{real.online ? 'Connected' : 'Not Connected'}</span>
              </div>
            )}
            <p className="text-[11px] muted mt-2">Status comes from your browser. Web pages can’t see nearby networks; the Wi‑Fi switch here only affects apps inside Golden Gate.</p>
          </>
        )}
        {expand === 'bt' && (
          <>
            <div className="flex items-center justify-between font-semibold text-[14px]">
              Bluetooth
              <Circle on={n.bluetooth} label="Bluetooth" onClick={() => s.patch('network', { bluetooth: !n.bluetooth })}>
                <Bluetooth size={15} />
              </Circle>
            </div>
            {n.bluetooth &&
              ['Magic Keyboard', 'Wireless Headphones', 'Trackpad'].map((d) => {
                const c = n.btConnected.includes(d);
                return (
                  <button key={d} className="menu-item enabled border-0 bg-transparent text-left w-full mt-1" style={{ paddingLeft: 6 }} onClick={() => s.patch('network', { btConnected: c ? n.btConnected.filter((x) => x !== d) : [...n.btConnected, d] })}>
                    {d}
                    <span className="ml-auto text-[11px] opacity-70">{c ? 'Connected' : 'Not Connected'}</span>
                  </button>
                );
              })}
            <p className="text-[11px] muted mt-2">Simulated devices.</p>
          </>
        )}
        {expand === 'focus' && (
          <div className="flex flex-col gap-2">
            {FOCUS.map((f) => (
              <button
                key={f.id}
                className="flex items-center gap-3 p-2 rounded-[12px] border-0 text-left"
                style={{ background: s.focus.active === f.id ? f.color : 'rgba(128,128,128,.15)', color: s.focus.active === f.id ? '#fff' : 'var(--text)' }}
                onClick={() => s.patch('focus', { active: s.focus.active === f.id ? null : f.id, until: null })}
              >
                <span className="w-7 h-7 rounded-full grid place-items-center" style={{ background: s.focus.active === f.id ? 'rgba(255,255,255,.25)' : f.color, color: '#fff' }}>
                  {f.icon}
                </span>
                {f.label}
              </button>
            ))}
            {focusOn && (
              <button className="btn" onClick={() => s.patch('focus', { until: Date.now() + 3600000 })}>
                Keep on for 1 hour
              </button>
            )}
            <p className="text-[11px] muted">While a Focus is on, notification banners and sounds are silenced. They still collect in Notification Center.</p>
          </div>
        )}
        {expand === 'display' && (
          <div className="flex flex-col gap-3">
            <div className="font-semibold">Display</div>
            <Slider value={s.display.brightness} min={0.3} max={1} onChange={(v) => s.patch('display', { brightness: v })} ariaLabel="Brightness" />
            <div className="flex gap-2">
              <button className={`btn flex-1 ${s.appearance === 'dark' ? 'primary' : ''}`} onClick={() => s.set({ appearance: s.appearance === 'dark' ? 'light' : 'dark' })}>
                <Contrast size={14} /> Dark Mode
              </button>
              <button className={`btn flex-1 ${s.display.nightShift ? 'primary' : ''}`} onClick={() => s.patch('display', { nightShift: !s.display.nightShift })}>
                <Sun size={14} /> Night Shift
              </button>
            </div>
            <button className="btn" onClick={() => openSettings('displays')}>
              Display Settings…
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute right-[8px] top-[34px] z-[9200] w-[332px] rounded-[24px] p-[10px] glass-strong liquid anim-pop" onPointerDown={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
      <div className="grid grid-cols-2 gap-[10px]">
        <Tile className="row-span-2 flex flex-col gap-[10px]">
          {[
            {
              k: 'wifi' as const,
              on: n.wifi,
              icon: <WifiGlyph on={n.wifi} size={14} />,
              label: 'Wi‑Fi',
              sub: networkSummary(real, n.wifi, n.ssid),
              toggle: () => s.patch('network', { wifi: !n.wifi }),
            },
            { k: 'bt' as const, on: n.bluetooth, icon: <Bluetooth size={15} />, label: 'Bluetooth', sub: n.bluetooth ? 'On' : 'Off', toggle: () => s.patch('network', { bluetooth: !n.bluetooth }) },
            {
              k: null,
              on: n.airdrop !== 'off',
              icon: <Radio size={15} />,
              label: 'AirDrop',
              sub: n.airdrop === 'off' ? 'Receiving Off' : n.airdrop === 'contacts' ? 'Contacts Only' : 'Everyone for 10 Minutes',
              toggle: () => s.patch('network', { airdrop: n.airdrop === 'off' ? 'contacts' : n.airdrop === 'contacts' ? 'everyone' : 'off' }),
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-[9px] cursor-default" onClick={() => row.k && setExpand(row.k)}>
              <Circle on={row.on} label={row.label} onClick={row.toggle}>
                {row.icon}
              </Circle>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">{row.label}</div>
                <div className="text-[11px] muted truncate leading-tight">{row.sub}</div>
              </div>
            </div>
          ))}
        </Tile>
        <Tile className="flex items-center gap-[9px] cursor-default" onClick={() => setExpand('focus')}>
          <Circle on={focusOn} label="Focus" onClick={() => s.patch('focus', { active: focusOn ? null : 'dnd', until: null })}>
            <Moon size={15} fill={focusOn ? 'currentColor' : 'none'} />
          </Circle>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold leading-tight">{focusOn ? FOCUS.find((f) => f.id === s.focus.active)?.label : 'Focus'}</div>
            {focusOn && <div className="text-[11px] muted leading-tight">On</div>}
          </div>
          <ChevronRight size={14} className="ml-auto opacity-50" />
        </Tile>
        <div className="grid grid-cols-2 gap-[10px]">
          <Tile className="grid place-items-center cursor-default" onClick={() => s.set({ appearance: s.appearance === 'dark' ? 'light' : 'dark' })}>
            <div className="flex flex-col items-center gap-1" title="Dark Mode">
              <Contrast size={18} />
              <span className="text-[10px] font-medium">{s.appearance === 'dark' ? 'Dark' : 'Light'}</span>
            </div>
          </Tile>
          <Tile className="grid place-items-center cursor-default" onClick={toggleBrowserFullscreen}>
            <div className="flex flex-col items-center gap-1" title="Full Screen">
              <Maximize size={17} />
              <span className="text-[10px] font-medium">Full Screen</span>
            </div>
          </Tile>
        </div>
        <Tile className="col-span-2">
          <div className="text-[12.5px] font-semibold mb-[7px] flex items-center justify-between">
            Display
            <button className="border-0 bg-transparent p-0 opacity-60" onClick={() => setExpand('display')} aria-label="Display options">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Sun size={14} className="opacity-70" />
            <Slider value={s.display.brightness} min={0.3} max={1} onChange={(v) => s.patch('display', { brightness: v })} ariaLabel="Brightness" />
          </div>
        </Tile>
        <Tile className="col-span-2">
          <div className="text-[12.5px] font-semibold mb-[7px]">Sound</div>
          <div className="flex items-center gap-2">
            <Volume2 size={14} className="opacity-70" />
            <Slider value={s.sound.muted ? 0 : s.sound.volume} onChange={(v) => s.patch('sound', { volume: v, muted: v === 0 })} onCommit={() => s.sound.volumeFeedback && playUi('volume')} ariaLabel="Volume" />
          </div>
        </Tile>
        <Tile className="col-span-2 flex items-center gap-3">
          <div className="w-[42px] h-[42px] rounded-[9px] flex-none grid place-items-center" style={{ background: 'linear-gradient(135deg,#ff6f88,#f7213d)' }}>
            <Play size={18} fill="#fff" color="#fff" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold truncate">{track ?? 'Not Playing'}</div>
            <div className="text-[11px] muted">{media.source === 'podcasts' ? 'Podcasts' : 'Music'}</div>
          </div>
          <button className="tb-btn" aria-label="Previous" disabled={!track} onClick={media.prev}>
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button className="tb-btn" aria-label={media.playing ? 'Pause' : 'Play'} disabled={!track} onClick={media.toggle}>
            {media.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="tb-btn" aria-label="Next" disabled={!track} onClick={media.next}>
            <SkipForward size={16} fill="currentColor" />
          </button>
        </Tile>
        <Tile className="flex items-center gap-2 cursor-default" onClick={() => void takeScreenshot('screen')}>
          <Camera size={16} />
          <span className="text-[12px] font-medium">Screenshot</span>
        </Tile>
        <Tile className="flex items-center gap-2 cursor-default" onClick={() => openSettings('battery')}>
          {battery.supported ? (
            <>
              <BatteryGlyph level={battery.level} charging={battery.charging} />
              <span className="text-[12px] font-medium tabular-nums">{battery.level != null ? `${Math.round(battery.level * 100)}%` : '—'}</span>
            </>
          ) : (
            <span className="text-[11.5px] muted">Battery info unavailable</span>
          )}
        </Tile>
      </div>
      <button className="btn ghost w-full mt-2 text-[12px]" onClick={() => openSettings('controlcenter')}>
        Edit Controls…
      </button>
    </div>
  );
}
