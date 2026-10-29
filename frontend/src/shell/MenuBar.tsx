import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, Volume1, Volume2, VolumeX, Bluetooth, Moon, Play, Pause, SkipForward, Lock } from 'lucide-react';
import { useSystem } from '../stores/system';
import { useFocusedAppId, useFocusedWindowId, useWindows } from '../stores/windows';
import { useSettings } from '../stores/settings';
import { useMedia, currentTrackName } from '../stores/media';
import { useClock } from '../lib/clock';
import { useBattery } from '../lib/battery';
import { BatteryGlyph, ControlCenterGlyph, SystemMark, WifiGlyph } from '../icons/Glyphs';
import { MenuList } from './Menu';
import { buildMenus, systemMenu } from './appMenus';
import { useWallpaperInfo } from './Wallpaper';
import { Slider, Toggle } from '../components/ui';
import { openSettings } from './actions';
import { playUi } from '../lib/sound';
import { linkLabel, signalBars, useNetwork } from '../lib/network';

function MenuTitle({ id, children, bold, onOpen }: { id: string; children: ReactNode; bold?: boolean; onOpen?: () => void }) {
  const active = useSystem((s) => s.activeMenu);
  const set = useSystem((s) => s.set);
  const isOpen = active === id;
  return (
    <button
      data-menu-id={id}
      className={`h-[22px] px-[9px] rounded-[6px] border-0 bg-transparent flex items-center whitespace-nowrap ${bold ? 'font-bold' : 'font-medium'} ${isOpen ? 'bg-[rgba(255,255,255,0.22)]' : ''}`}
      style={{ background: isOpen ? 'var(--menubar-hl)' : undefined }}
      onPointerDown={(e) => {
        e.stopPropagation();
        set({ activeMenu: isOpen ? null : id, controlCenter: false, notificationCenter: false, contextMenu: null, spotlight: false });
        onOpen?.();
      }}
      onPointerEnter={() => {
        if (active && active !== id && !active.startsWith('status:')) set({ activeMenu: id });
      }}
    >
      {children}
    </button>
  );
}

function Dropdown({ id, children, align = 'left' }: { id: string; children: ReactNode; align?: 'left' | 'right' }) {
  const active = useSystem((s) => s.activeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (active !== id) return;
    const btn = document.querySelector(`[data-menu-id="${id}"]`) as HTMLElement | null;
    if (!btn) return;
    const bar = document.querySelector('.menubar') as HTMLElement | null;
    let x = 0;
    let n: HTMLElement | null = btn;
    while (n && n !== bar) {
      x += n.offsetLeft;
      n = n.offsetParent as HTMLElement | null;
    }
    const w = ref.current?.offsetWidth ?? 220;
    const max = (document.querySelector('.menubar') as HTMLElement)?.offsetWidth ?? 1200;
    setLeft(align === 'right' ? Math.max(6, Math.min(x + btn.offsetWidth - w, max - w - 6)) : Math.min(x, max - w - 6));
  }, [active, id, align]);
  if (active !== id) return null;
  return (
    <div ref={ref} className="absolute top-[28px] z-[9100]" style={{ left: left ?? -9999, color: 'var(--text)' }} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function StatusPanel({ children, width = 300 }: { children: ReactNode; width?: number }) {
  return (
    <div className="menu-panel anim-pop" style={{ width, padding: 12 }}>
      {children}
    </div>
  );
}

function ClockText() {
  const now = useClock(1000);
  const c = useSettings((s) => s.menubar.clock);
  const locale = useSettings((s) => s.region.locale);
  const date = c.showDate ? now.toLocaleDateString(locale, { weekday: c.showDay ? 'short' : undefined, month: 'short', day: 'numeric' }).replace(',', '') : c.showDay ? now.toLocaleDateString(locale, { weekday: 'short' }) : '';
  const time = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: c.showSeconds ? '2-digit' : undefined, hour12: !c.use24h });
  return (
    <span className="tabular-nums">
      {date && <span className="mr-[6px]">{date}</span>}
      {time}
    </span>
  );
}

export function MenuBar({ hidden }: { hidden?: boolean }) {
  const appId = useFocusedAppId();
  const winId = useFocusedWindowId();
  const activeMenu = useSystem((s) => s.activeMenu);
  const set = useSystem((s) => s.set);
  const registered = useSystem((s) => (winId ? s.menus[winId] : undefined));
  const windows = useWindows((s) => s.windows);
  const dark = useWallpaperInfo((s) => s.dark);
  const showBg = useSettings((s) => s.menubar.showBackground);
  const theme = useSettings((s) => s.appearance);
  const items = useSettings((s) => s.menubar.items);
  const net = useSettings((s) => s.network);
  const realNet = useNetwork();
  const sound = useSettings((s) => s.sound);
  const focus = useSettings((s) => s.focus);
  const patch = useSettings((s) => s.patch);
  const battery = useBattery();
  const media = useMedia();
  const [hovering, setHovering] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const menus = useMemo(() => buildMenus(appId, winId), [appId, winId, registered, windows.length, activeMenu]);

  useEffect(() => {
    const close = () => useSystem.getState().set({ activeMenu: null });
    window.addEventListener('pointerdown', close);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const lightText = showBg ? false : dark;
  const fg = showBg ? 'var(--text)' : lightText ? '#fff' : 'rgba(0,0,0,.85)';
  const VolIcon = sound.muted || sound.volume === 0 ? VolumeX : sound.volume < 0.5 ? Volume1 : Volume2;
  const isHidden = hidden && !hovering && !activeMenu;
  const focusOn = !!focus.active && (!focus.until || focus.until > Date.now());

  return (
    <div
      role="menubar"
      aria-label="Menu bar"
      className="menubar absolute top-0 inset-x-0 z-[9000] flex items-center text-[13px] select-none"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      style={{
        height: 30,
        padding: '0 8px',
        color: fg,
        transform: isHidden ? 'translateY(-100%)' : undefined,
        transition: 'transform .25s var(--ease-out)',
        background: showBg ? 'var(--menu-bg)' : lightText ? 'linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,0))' : 'linear-gradient(rgba(255,255,255,.25), rgba(255,255,255,0))',
        backdropFilter: showBg ? 'blur(30px) saturate(180%)' : undefined,
        textShadow: !showBg && lightText ? '0 0 6px rgba(0,0,0,.25)' : undefined,
        ['--menubar-hl' as string]: showBg ? 'var(--press)' : lightText ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.1)',
        boxShadow: showBg ? '0 0.5px 0 var(--separator)' : undefined,
      }}
      data-theme-hint={theme}
    >
      {hidden && <div className="absolute inset-x-0 top-full h-[6px]" />}
      <div className="flex items-center gap-[1px] min-w-0 overflow-hidden">
        <MenuTitle id="system">
          <SystemMark size={16} />
        </MenuTitle>
        <Dropdown id="system">
          <MenuList items={systemMenu()} onDone={() => set({ activeMenu: null })} />
        </Dropdown>
        {menus.map((m, i) => (
          <div key={`${m.title}${i}`}>
            <MenuTitle id={`app:${i}`} bold={i === 0}>
              {m.title}
            </MenuTitle>
            <Dropdown id={`app:${i}`}>
              <MenuList items={m.items} onDone={() => set({ activeMenu: null })} />
            </Dropdown>
          </div>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-[1px] flex-none">
        {items.nowPlaying && media.source && (
          <div>
            <MenuTitle id="status:np">{media.playing ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}</MenuTitle>
            <Dropdown id="status:np" align="right">
              <StatusPanel width={280}>
                <div className="text-[11px] font-semibold muted mb-1">Now Playing · {media.source === 'music' ? 'Music' : 'Podcasts'}</div>
                <div className="font-semibold truncate">{currentTrackName() ?? 'Nothing playing'}</div>
                <div className="flex items-center justify-center gap-4 mt-3">
                  <button className="tb-btn" onClick={media.toggle} aria-label={media.playing ? 'Pause' : 'Play'}>
                    {media.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </button>
                  <button className="tb-btn" onClick={media.next} aria-label="Next">
                    <SkipForward size={18} fill="currentColor" />
                  </button>
                </div>
              </StatusPanel>
            </Dropdown>
          </div>
        )}
        {items.focus && focusOn && (
          <MenuTitle id="status:focus" onOpen={() => set({ activeMenu: null, controlCenter: true })}>
            <Moon size={14} fill="currentColor" />
          </MenuTitle>
        )}
        {items.bluetooth && (
          <div>
            <MenuTitle id="status:bt">
              <Bluetooth size={15} style={{ opacity: net.bluetooth ? 1 : 0.4 }} />
            </MenuTitle>
            <Dropdown id="status:bt" align="right">
              <StatusPanel>
                <div className="flex items-center justify-between font-semibold mb-2">
                  Bluetooth <Toggle on={net.bluetooth} onChange={(v) => patch('network', { bluetooth: v })} />
                </div>
                <div className="text-[11px] muted">Simulated devices — this does not control your computer’s Bluetooth.</div>
                <div className="menu-sep" />
                <button className="menu-item enabled w-full border-0 bg-transparent text-left" style={{ paddingLeft: 8 }} onClick={() => openSettings('bluetooth')}>
                  Bluetooth Settings…
                </button>
              </StatusPanel>
            </Dropdown>
          </div>
        )}
        {items.wifi && (
          <div>
            <MenuTitle id="status:wifi">
              <WifiGlyph on={net.wifi && realNet.online} strength={signalBars(realNet)} />
            </MenuTitle>
            <Dropdown id="status:wifi" align="right">
              <StatusPanel>
                <div className="flex items-center justify-between font-semibold">
                  Wi‑Fi <Toggle on={net.wifi} onChange={(v) => patch('network', { wifi: v })} />
                </div>
                {net.wifi && (
                  <>
                    <div className="text-[11px] font-semibold muted mt-3 mb-1">{realNet.online ? 'Connected' : 'Not Connected'}</div>
                    <div className="menu-item enabled w-full" style={{ paddingLeft: 8 }}>
                      <span className="w-5 h-5 rounded-full grid place-items-center" style={{ background: realNet.online ? 'var(--accent)' : 'var(--field)', color: realNet.online ? '#fff' : 'inherit' }}>
                        <WifiGlyph on={realNet.online} strength={signalBars(realNet)} size={12} />
                      </span>
                      {net.ssid || linkLabel(realNet)}
                      <span className="ml-auto text-[11px] opacity-70">{realNet.online && realNet.downlink != null ? `${realNet.downlink} Mb/s` : ''}</span>
                    </div>
                  </>
                )}
                <div className="text-[11px] muted mt-2">Status comes from your browser. Web pages can’t see nearby networks or the network name; you can enter it in Wi‑Fi Settings.</div>
                <div className="menu-sep" />
                <button className="menu-item enabled w-full border-0 bg-transparent text-left" style={{ paddingLeft: 8 }} onClick={() => openSettings('wifi')}>
                  Wi‑Fi Settings…
                </button>
              </StatusPanel>
            </Dropdown>
          </div>
        )}
        {items.sound && (
          <div>
            <MenuTitle id="status:sound">
              <VolIcon size={16} />
            </MenuTitle>
            <Dropdown id="status:sound" align="right">
              <StatusPanel width={270}>
                <div className="font-semibold mb-2">Sound</div>
                <Slider
                  value={sound.muted ? 0 : sound.volume}
                  onChange={(v) => patch('sound', { volume: v, muted: v === 0 })}
                  onCommit={() => sound.volumeFeedback && playUi('volume')}
                  ariaLabel="Output volume"
                />
                <div className="text-[11px] font-semibold muted mt-3">Output</div>
                <div className="text-[12.5px] mt-1">Browser default output</div>
                <div className="menu-sep" />
                <button className="menu-item enabled w-full border-0 bg-transparent text-left" style={{ paddingLeft: 8 }} onClick={() => openSettings('sound')}>
                  Sound Settings…
                </button>
              </StatusPanel>
            </Dropdown>
          </div>
        )}
        {items.battery && battery.supported && (
          <div>
            <MenuTitle id="status:battery">
              <span className="flex items-center gap-[5px]">
                {useSettings.getState().menubar.items.batteryPercent && battery.level != null && <span className="text-[12px] tabular-nums">{Math.round(battery.level * 100)}%</span>}
                <BatteryGlyph level={battery.level} charging={battery.charging} />
              </span>
            </MenuTitle>
            <Dropdown id="status:battery" align="right">
              <StatusPanel width={260}>
                <div className="flex justify-between font-semibold">
                  Battery <span className="muted font-normal tabular-nums">{battery.level != null ? `${Math.round(battery.level * 100)}%` : '—'}</span>
                </div>
                <div className="text-[12px] muted mt-1">
                  Power Source: {battery.charging ? 'Power Adapter' : 'Battery'}
                  {!battery.charging && battery.dischargingTime ? ` · ${Math.round(battery.dischargingTime / 60)} min remaining` : ''}
                </div>
                <div className="text-[11px] faint mt-1">Reported by your browser (Battery Status API).</div>
                <div className="menu-sep" />
                <div className="flex items-center justify-between text-[13px] px-2 py-1">
                  Low Power Mode <Toggle small on={useSettings.getState().battery.lowPower} onChange={(v) => patch('battery', { lowPower: v })} />
                </div>
                <button className="menu-item enabled w-full border-0 bg-transparent text-left" style={{ paddingLeft: 8 }} onClick={() => openSettings('battery')}>
                  Battery Settings…
                </button>
              </StatusPanel>
            </Dropdown>
          </div>
        )}
        <button
          aria-label="Control Center"
          className="h-[22px] px-[8px] rounded-[6px] border-0 bg-transparent flex items-center"
          style={{ background: useSystem.getState().controlCenter ? 'var(--menubar-hl)' : undefined }}
          onPointerDown={(e) => {
            e.stopPropagation();
            set({ controlCenter: !useSystem.getState().controlCenter, activeMenu: null, notificationCenter: false, spotlight: false });
          }}
        >
          <ControlCenterGlyph />
        </button>
        {items.spotlight && (
          <button
            aria-label="Spotlight"
            className="h-[22px] px-[8px] rounded-[6px] border-0 bg-transparent flex items-center"
            onPointerDown={(e) => {
              e.stopPropagation();
              set({ spotlight: !useSystem.getState().spotlight, activeMenu: null, controlCenter: false, launchpad: false });
            }}
          >
            <Search size={15} strokeWidth={2.2} />
          </button>
        )}
        <button
          aria-label="Notification Center"
          className="h-[22px] px-[8px] rounded-[6px] border-0 bg-transparent flex items-center font-medium"
          style={{ background: useSystem.getState().notificationCenter ? 'var(--menubar-hl)' : undefined }}
          onPointerDown={(e) => {
            e.stopPropagation();
            set({ notificationCenter: !useSystem.getState().notificationCenter, activeMenu: null, controlCenter: false });
          }}
        >
          <ClockText />
        </button>
      </div>
    </div>
  );
}
