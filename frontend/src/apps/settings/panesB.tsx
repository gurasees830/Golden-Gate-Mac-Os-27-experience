import { useMemo } from 'react';
import { Check, Plus } from 'lucide-react';
import { useSettings, ACCENTS, type Accent, type HotCorner } from '../../stores/settings';
import { useFs, PICTURES, importHostFiles } from '../../stores/fs';
import { Group, Row, Toggle, Popup, Slider, Segmented } from '../../components/ui';
import { WALLPAPERS, WALLPAPER_COLORS, thumbUrl } from '../../shell/Wallpaper';
import { PaneHeader } from './Settings';
import { useSystem } from '../../stores/system';
import { FileIcon } from '../../icons/FileIcon';
import { PANES } from '../settingsPanes';

export function AppearancePane() {
  const s = useSettings();
  return (
    <>
      <PaneHeader id="appearance" title="Appearance" />
      <Group>
        <Row label="Appearance">
          <div className="flex gap-4">
            {(['auto', 'light', 'dark'] as const).map((a) => (
              <button key={a} className="flex flex-col items-center gap-1 border-0 bg-transparent" onClick={() => s.set({ appearance: a })}>
                <div className="w-[68px] h-[46px] rounded-[8px] overflow-hidden relative" style={{ boxShadow: s.appearance === a ? '0 0 0 2.5px var(--accent)' : '0 0 0 1px var(--separator)', background: a === 'light' ? 'linear-gradient(#bcd7f2,#efe2d1)' : a === 'dark' ? 'linear-gradient(#141a33,#3a2d4a)' : 'linear-gradient(90deg,#bcd7f2 50%,#141a33 50%)' }}>
                  <div className="absolute left-[8px] top-[8px] w-[40px] h-[26px] rounded-[4px]" style={{ background: a === 'dark' ? '#2a2a2d' : a === 'light' ? '#fff' : 'linear-gradient(90deg,#fff 50%,#2a2a2d 50%)' }} />
                </div>
                <span className="text-[11px] capitalize">{a}</span>
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group>
        <Row label="Accent color">
          <div className="flex gap-[7px]">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <button
                key={a}
                aria-label={ACCENTS[a].label}
                title={ACCENTS[a].label}
                onClick={() => s.set({ accent: a })}
                className="w-[16px] h-[16px] rounded-full border-0 p-0 grid place-items-center"
                style={{ background: a === 'multicolor' ? 'conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#007aff,#af52de,#ff3b30)' : ACCENTS[a].light, boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.2)' }}
              >
                {s.accent === a && <span className="w-[6px] h-[6px] rounded-full bg-white" />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Sidebar icon size">
          <Popup value={s.sidebarIconSize} onChange={(v) => s.set({ sidebarIconSize: v })} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
        </Row>
        <Row label="Allow wallpaper tinting in windows">
          <Toggle on={s.wallpaperTinting} onChange={(v) => s.set({ wallpaperTinting: v })} />
        </Row>
      </Group>
      <Group title="Liquid Glass" footer="Golden Gate 27 lets you choose how see-through glass surfaces are, from Clear to Tinted. Affects menus, the Dock, toolbars and sidebars.">
        <Row label="Transparency">
          <span className="text-[11px] muted">Clear</span>
          <div className="w-[180px]">
            <Slider value={s.glassTint} onChange={(v) => s.set({ glassTint: v })} ariaLabel="Glass tint" />
          </div>
          <span className="text-[11px] muted">Tinted</span>
        </Row>
      </Group>
      <Group>
        <Row label="Show scroll bars">
          <Popup value={s.scrollbars} onChange={(v) => s.set({ scrollbars: v })} options={[{ value: 'auto', label: 'Automatically based on mouse or trackpad' }, { value: 'scrolling', label: 'When scrolling' }, { value: 'always', label: 'Always' }]} />
        </Row>
      </Group>
    </>
  );
}

export function AccessibilityPane() {
  const a = useSettings((s) => s.accessibility);
  const scale = useSettings((s) => s.display.scale);
  const patch = useSettings((s) => s.patch);
  const t = (k: keyof typeof a, label: string, sub?: string) => (
    <Row label={label} sub={sub}>
      <Toggle on={a[k]} onChange={(v) => patch('accessibility', { [k]: v })} />
    </Row>
  );
  return (
    <>
      <PaneHeader id="accessibility" title="Accessibility">Personalise the simulator in ways that work best for you.</PaneHeader>
      <Group title="Vision">
        {t('reduceMotion', 'Reduce motion', 'Turns off window, Dock and wallpaper animations.')}
        {t('reduceTransparency', 'Reduce transparency', 'Uses solid backgrounds instead of glass.')}
        {t('increaseContrast', 'Increase contrast')}
        {t('boldText', 'Bold text')}
        {t('invertColors', 'Invert colors')}
        {t('grayscale', 'Color filters: Grayscale')}
        <Row label="Text size" sub="Scales the whole interface.">
          <Popup value={scale} onChange={(v) => patch('display', { scale: v })} options={[0.85, 0.92, 1, 1.1, 1.2, 1.3].map((x) => ({ value: x, label: `${Math.round(x * 100)}%` }))} />
        </Row>
      </Group>
    </>
  );
}

export function ControlCenterPane() {
  const items = useSettings((s) => s.menubar.items);
  const mb = useSettings((s) => s.menubar);
  const patch = useSettings((s) => s.patch);
  const t = (k: keyof typeof items, label: string) => (
    <Row label={label}>
      <Toggle on={items[k]} onChange={(v) => patch('menubar', { items: { ...items, [k]: v } })} />
    </Row>
  );
  return (
    <>
      <PaneHeader id="controlcenter" title="Control Center">Choose which items appear in the menu bar.</PaneHeader>
      <Group title="Menu Bar Items">
        {t('wifi', 'Wi‑Fi')}
        {t('bluetooth', 'Bluetooth')}
        {t('sound', 'Sound')}
        {t('battery', 'Battery')}
        {t('focus', 'Focus')}
        {t('nowPlaying', 'Now Playing')}
        {t('spotlight', 'Spotlight')}
      </Group>
      <Group title="Menu Bar">
        <Row label="Show menu bar background">
          <Toggle on={mb.showBackground} onChange={(v) => patch('menubar', { showBackground: v })} />
        </Row>
        <Row label="Automatically hide and show the menu bar">
          <Toggle on={mb.autohide} onChange={(v) => patch('menubar', { autohide: v })} />
        </Row>
      </Group>
      <Group title="Clock">
        <Row label="Show date">
          <Toggle on={mb.clock.showDate} onChange={(v) => patch('menubar', { clock: { ...mb.clock, showDate: v } })} />
        </Row>
        <Row label="Show day of week">
          <Toggle on={mb.clock.showDay} onChange={(v) => patch('menubar', { clock: { ...mb.clock, showDay: v } })} />
        </Row>
        <Row label="Display time with seconds">
          <Toggle on={mb.clock.showSeconds} onChange={(v) => patch('menubar', { clock: { ...mb.clock, showSeconds: v } })} />
        </Row>
      </Group>
    </>
  );
}

const CORNER_OPTIONS: { value: HotCorner; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'launchpad', label: 'Launchpad' },
  { value: 'notifications', label: 'Notification Center' },
  { value: 'controlcenter', label: 'Control Center' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'screensaver', label: 'Start Screen Saver' },
  { value: 'lock', label: 'Lock Screen' },
  { value: 'sleep', label: 'Put Display to Sleep' },
];

export function DesktopDockPane() {
  const d = useSettings((s) => s.dock);
  const desk = useSettings((s) => s.desktop);
  const patch = useSettings((s) => s.patch);
  const t = (k: keyof typeof d, label: string) => (
    <Row label={label}>
      <Toggle on={d[k] as boolean} onChange={(v) => patch('dock', { [k]: v })} />
    </Row>
  );
  return (
    <>
      <PaneHeader id="desktop" title="Desktop & Dock" />
      <Group title="Dock">
        <Row label="Size">
          <span className="text-[11px] muted">Small</span>
          <div className="w-[180px]">
            <Slider value={d.size} min={32} max={88} step={1} onChange={(v) => patch('dock', { size: v, magnifySize: Math.max(v, d.magnifySize) })} ariaLabel="Dock size" />
          </div>
          <span className="text-[11px] muted">Large</span>
        </Row>
        <Row label="Magnification">
          <Toggle on={d.magnification} onChange={(v) => patch('dock', { magnification: v })} />
          <div className="w-[140px]">
            <Slider value={d.magnifySize} min={d.size} max={128} step={1} onChange={(v) => patch('dock', { magnifySize: v })} ariaLabel="Magnification size" />
          </div>
        </Row>
        <Row label="Position on screen">
          <Segmented value={d.position} onChange={(v) => patch('dock', { position: v })} options={[{ value: 'left', label: 'Left' }, { value: 'bottom', label: 'Bottom' }, { value: 'right', label: 'Right' }]} />
        </Row>
        <Row label="Minimize windows using">
          <Popup value={d.minimizeEffect} onChange={(v) => patch('dock', { minimizeEffect: v })} options={[{ value: 'genie', label: 'Genie Effect' }, { value: 'scale', label: 'Scale Effect' }]} />
        </Row>
        <Row label="Double-click a window’s title bar to">
          <Popup value={d.titlebarDoubleClick} onChange={(v) => patch('dock', { titlebarDoubleClick: v })} options={[{ value: 'zoom', label: 'Zoom' }, { value: 'minimize', label: 'Minimize' }, { value: 'none', label: 'Do Nothing' }]} />
        </Row>
        {t('minimizeToApp', 'Minimize windows into application icon')}
        {t('autohide', 'Automatically hide and show the Dock')}
        {t('animateOpening', 'Animate opening applications')}
        {t('showIndicators', 'Show indicators for open applications')}
        {t('showRecents', 'Show suggested and recent apps in Dock')}
      </Group>
      <Group title="Desktop">
        <Row label="Show items on Desktop">
          <Toggle on={desk.showItems} onChange={(v) => patch('desktop', { showItems: v })} />
        </Row>
        <Row label="Icon size">
          <div className="w-[180px]">
            <Slider value={desk.iconSize} min={40} max={96} step={4} onChange={(v) => patch('desktop', { iconSize: v })} ariaLabel="Desktop icon size" />
          </div>
        </Row>
        <Row label="Click wallpaper to reveal desktop">
          <Toggle on={desk.clickWallpaperToReveal} onChange={(v) => patch('desktop', { clickWallpaperToReveal: v })} />
        </Row>
      </Group>
      <Group title="Windows">
        <Row label="Drag windows to screen edges to tile">
          <Toggle on={desk.tiling} onChange={(v) => patch('desktop', { tiling: v })} />
        </Row>
        <Row label="Close windows when quitting an application">
          <Toggle on={desk.closeWindowsOnQuit} onChange={(v) => patch('desktop', { closeWindowsOnQuit: v })} />
        </Row>
      </Group>
      <Group title="Hot Corners" footer="Move the pointer into a screen corner to trigger an action.">
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <Row key={c} label={{ tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' }[c]}>
            <Popup value={desk.hotCorners[c]} onChange={(v) => patch('desktop', { hotCorners: { ...desk.hotCorners, [c]: v } })} options={CORNER_OPTIONS} />
          </Row>
        ))}
      </Group>
    </>
  );
}

export function DisplaysPane() {
  const d = useSettings((s) => s.display);
  const patch = useSettings((s) => s.patch);
  const scales = [
    { v: 1.3, l: 'Larger Text' },
    { v: 1.15, l: '' },
    { v: 1, l: 'Default' },
    { v: 0.92, l: '' },
    { v: 0.85, l: 'More Space' },
  ];
  return (
    <>
      <PaneHeader id="displays" title="Displays">
        Your screen: {screen.width} × {screen.height} at {window.devicePixelRatio}x (detected).
      </PaneHeader>
      <Group title="Use as">
        <div className="flex justify-around py-4 px-3">
          {scales.map((x) => (
            <button key={x.v} className="flex flex-col items-center gap-2 border-0 bg-transparent" onClick={() => patch('display', { scale: x.v })}>
              <div className="rounded-[6px] grid place-items-center" style={{ width: 70, height: 46, background: 'linear-gradient(#5b8bd6,#c8a6d8)', boxShadow: d.scale === x.v ? '0 0 0 2.5px var(--accent)' : '0 0 0 1px var(--separator)' }}>
                <span className="text-white font-bold" style={{ fontSize: 8 + x.v * 8 }}>Aa</span>
              </div>
              <span className="text-[11px] h-[14px]">{x.l}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group>
        <Row label="Brightness" sub="Dims the simulator; your real display brightness isn’t changed.">
          <div className="w-[200px]">
            <Slider value={d.brightness} min={0.3} max={1} onChange={(v) => patch('display', { brightness: v })} ariaLabel="Brightness" />
          </div>
        </Row>
        <Row label="True Tone">
          <Toggle on={d.trueTone} onChange={(v) => patch('display', { trueTone: v })} />
        </Row>
      </Group>
      <Group title="Night Shift">
        <Row label="Night Shift" sub="Warms the colors of the simulator.">
          <Toggle on={d.nightShift} onChange={(v) => patch('display', { nightShift: v })} />
        </Row>
        <Row label="Color temperature">
          <span className="text-[11px] muted">Less Warm</span>
          <div className="w-[150px]">
            <Slider value={d.nightShiftWarmth} onChange={(v) => patch('display', { nightShiftWarmth: v })} ariaLabel="Warmth" />
          </div>
          <span className="text-[11px] muted">More Warm</span>
        </Row>
      </Group>
    </>
  );
}

export function ScreenSaverPane() {
  const l = useSettings((s) => s.lockScreen);
  const patch = useSettings((s) => s.patch);
  const opts: { id: typeof l.screensaver; name: string; bg: string }[] = [
    { id: 'drift', name: 'Golden Hour', bg: thumbUrl('gg-golden') },
    { id: 'aerial', name: 'Aerial Tour', bg: thumbUrl('gg-night') },
    { id: 'clock', name: 'Clock', bg: '' },
  ];
  return (
    <>
      <PaneHeader id="screensaver" title="Screen Saver" />
      <div className="grid grid-cols-3 gap-3 mb-5">
        {opts.map((o) => (
          <button key={o.id} className="border-0 bg-transparent flex flex-col gap-1 items-center" onClick={() => patch('lockScreen', { screensaver: o.id })}>
            <div className="w-full aspect-[16/10] rounded-[8px] bg-cover bg-center grid place-items-center text-white text-[20px] font-bold" style={{ backgroundImage: o.bg ? `url(${o.bg})` : undefined, background: o.bg ? undefined : '#000', boxShadow: l.screensaver === o.id ? '0 0 0 3px var(--accent)' : '0 0 0 1px var(--separator)' }}>
              {o.id === 'clock' && '9:41'}
            </div>
            <span className="text-[12px]">{o.name}</span>
          </button>
        ))}
      </div>
      <Group>
        <Row label="Start Screen Saver when inactive">
          <Popup value={l.screensaverAfterMin} onChange={(v) => patch('lockScreen', { screensaverAfterMin: v })} options={[{ value: 0, label: 'Never' }, { value: 1, label: 'For 1 minute' }, { value: 2, label: 'For 2 minutes' }, { value: 5, label: 'For 5 minutes' }, { value: 10, label: 'For 10 minutes' }, { value: 20, label: 'For 20 minutes' }, { value: 60, label: 'For 1 hour' }]} />
        </Row>
        <Row label="Preview">
          <button className="btn" onClick={() => useSystem.getState().set({ screensaver: true })}>
            Preview
          </button>
        </Row>
      </Group>
    </>
  );
}

export function SpotlightPane() {
  const sp = useSettings((s) => s.spotlight);
  const kb = useSettings((s) => s.keyboard);
  const set = useSettings((s) => s.set);
  const patch = useSettings((s) => s.patch);
  const labels: Record<string, string> = { apps: 'Applications', files: 'Documents', folders: 'Folders', notes: 'Notes', contacts: 'Contacts', events: 'Events', reminders: 'Reminders', settings: 'System Settings', store: 'App Store', calculator: 'Calculator', mail: 'Mail Messages' };
  return (
    <>
      <PaneHeader id="spotlight" title="Spotlight">Spotlight helps you quickly find things in the simulator.</PaneHeader>
      <Group title="Search results">
        {Object.keys(labels).map((k) => (
          <Row key={k} label={labels[k]}>
            <Toggle on={sp[k] !== false} onChange={(v) => set({ spotlight: { ...sp, [k]: v } })} />
          </Row>
        ))}
      </Group>
      <Group footer="Your browser may reserve some combinations. Ctrl+K (⌘K) always works too.">
        <Row label="Spotlight shortcut">
          <Popup value={kb.spotlightShortcut} onChange={(v) => patch('keyboard', { spotlightShortcut: v })} options={[{ value: 'mod+space', label: '⌘ Space (Ctrl+Space)' }, { value: 'mod+shift+space', label: '⇧⌘ Space (Ctrl+Shift+Space)' }, { value: 'mod+k', label: '⌘K (Ctrl+K)' }]} />
        </Row>
      </Group>
      <div className="text-[11.5px] muted">Matches from {PANES.length} settings, your files, notes, contacts, events and more.</div>
    </>
  );
}

export function WallpaperPane() {
  const wp = useSettings((s) => s.wallpaper);
  const patch = useSettings((s) => s.patch);
  const nodes = useFs((s) => s.nodes);
  const photos = useMemo(() => Object.values(nodes).filter((n) => !n.trashed && n.kind === 'file' && n.mime.startsWith('image/') && !n.assetUrl).sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 12), [nodes]);
  const addPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const [n] = await importHostFiles([f], PICTURES);
      patch('wallpaper', { id: `custom:${n.id}`, customName: n.name });
      useSystem.getState().showToast(`“${n.name}” is now your wallpaper and was saved to Pictures.`);
    };
    input.click();
  };
  const tile = (id: string, bg: string, name: string, extra?: React.ReactNode) => (
    <button key={id} className="border-0 bg-transparent p-0 flex flex-col items-center gap-1" onClick={() => patch('wallpaper', { id })} title={name}>
      <div className="w-full aspect-[16/10] rounded-[8px] bg-cover bg-center relative" style={{ background: bg.startsWith('#') ? bg : undefined, backgroundImage: bg.startsWith('#') ? undefined : `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: wp.id === id ? '0 0 0 3px var(--accent)' : '0 0 0 .5px var(--separator)' }}>
        {wp.id === id && <span className="absolute right-1 bottom-1 w-[16px] h-[16px] rounded-full grid place-items-center bg-[var(--accent)] text-white"><Check size={10} strokeWidth={3} /></span>}
        {extra}
      </div>
      <span className="text-[11px] truncate max-w-full">{name}</span>
    </button>
  );
  const current = WALLPAPERS.find((w) => w.id === wp.id);
  return (
    <>
      <div className="flex gap-4 items-center mb-5">
        <div className="w-[160px] aspect-[16/10] rounded-[10px] bg-cover bg-center flex-none" style={{ backgroundImage: current ? `url(${thumbUrl(current.file ?? current.dynamic!.light)})` : undefined, background: wp.id.startsWith('color:') ? wp.id.slice(6) : undefined, boxShadow: '0 0 0 .5px var(--separator), 0 4px 14px rgba(0,0,0,.15)' }}>
          {wp.id.startsWith('custom:') && nodes[wp.id.slice(7)] && <div className="w-full h-full rounded-[10px] overflow-hidden grid place-items-center"><FileIcon node={nodes[wp.id.slice(7)]} size={90} /></div>}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-[14px]">{current?.name ?? (wp.id.startsWith('color:') ? 'Color' : wp.customName ?? 'Custom Photo')}</div>
          {current?.dynamic && <div className="text-[11.5px] muted mt-1">Dynamic: follows Light/Dark appearance{current.dynamic.golden ? ', or the time of day when Appearance is Auto' : ''}.</div>}
          <div className="flex items-center gap-2 mt-3">
            <Popup value={wp.fit} onChange={(v) => patch('wallpaper', { fit: v })} options={[{ value: 'fill', label: 'Fill Screen' }, { value: 'fit', label: 'Fit to Screen' }, { value: 'center', label: 'Center' }]} />
            <label className="flex items-center gap-2 text-[12px]">
              <Toggle small on={wp.animated} onChange={(v) => patch('wallpaper', { animated: v })} /> Animate fog
            </label>
          </div>
        </div>
        <button className="btn" onClick={addPhoto}>
          <Plus size={13} /> Add Photo…
        </button>
      </div>
      <h3 className="text-[13px] font-semibold mb-2">Dynamic Wallpapers</h3>
      <div className="grid grid-cols-4 gap-3 mb-5">{WALLPAPERS.filter((w) => w.dynamic).map((w) => tile(w.id, thumbUrl(w.dynamic!.light), w.name))}</div>
      <h3 className="text-[13px] font-semibold mb-2">Pictures</h3>
      <div className="grid grid-cols-4 gap-3 mb-5">{WALLPAPERS.filter((w) => w.file).map((w) => tile(w.id, thumbUrl(w.file!), w.name))}</div>
      {photos.length > 0 && (
        <>
          <h3 className="text-[13px] font-semibold mb-2">Your Photos</h3>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {photos.map((p) => (
              <button key={p.id} className="border-0 bg-transparent p-0 flex flex-col items-center gap-1" onClick={() => patch('wallpaper', { id: `custom:${p.id}`, customName: p.name })}>
                <div className="w-full aspect-[16/10] rounded-[8px] overflow-hidden grid place-items-center" style={{ boxShadow: wp.id === `custom:${p.id}` ? '0 0 0 3px var(--accent)' : '0 0 0 .5px var(--separator)', background: 'var(--bg-2)' }}>
                  <FileIcon node={p} size={80} />
                </div>
                <span className="text-[11px] truncate max-w-full">{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3 className="text-[13px] font-semibold mb-2">Colors</h3>
      <div className="grid grid-cols-5 gap-3">{WALLPAPER_COLORS.map((c) => tile(`color:${c}`, c, c))}</div>
      <p className="text-[11px] muted mt-5">All wallpapers here are original artwork rendered for this simulator. Add Photo lets you use any picture from your computer.</p>
    </>
  );
}
