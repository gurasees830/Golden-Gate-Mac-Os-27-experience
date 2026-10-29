import { useEffect } from 'react';
import { useSystem } from './stores/system';
import { useSettings, resolvedTheme, ACCENTS } from './stores/settings';
import { useWindows } from './stores/windows';
import { Wallpaper } from './shell/Wallpaper';
import { Desktop } from './shell/Desktop';
import { preloadApps } from './apps';
import { useApps } from './stores/apps';
import { installHostGuards, keyboardCaptureSupported } from './lib/hostGuard';
import { WindowManager } from './shell/WindowManager';
import { MenuBar } from './shell/MenuBar';
import { Dock } from './shell/Dock';
import { Spotlight } from './shell/Spotlight';
import { Launchpad } from './shell/Launchpad';
import { ControlCenter } from './shell/ControlCenter';
import { NotificationCenter, Banners } from './shell/NotificationCenter';
import { ContextMenuLayer, DialogLayer, DndGhost, QuickLook, ShortcutsPanel, Toast } from './shell/Overlays';
import { BootScreen, LoginScreen, Onboarding, PowerOverlay, Screensaver } from './shell/Screens';
import { useShortcuts } from './shell/useShortcuts';
import { useSystemTicker } from './shell/useSystemTicker';
import { onQuotaError } from './lib/db';
import { notify } from './stores/notifications';
import { useCloudSync } from './services/cloud';
import { ScreenshotLayer } from './lib/screenshot';
import { AppSwitcher } from './shell/AppSwitcher';

function useThemeAttributes() {
  const s = useSettings();
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const theme = resolvedTheme(s.appearance);
      root.dataset.theme = theme;
      root.dataset.transparency = s.accessibility.reduceTransparency ? 'reduced' : 'normal';
      root.dataset.contrast = s.accessibility.increaseContrast ? 'high' : 'normal';
      root.dataset.motion = s.accessibility.reduceMotion || s.battery.lowPower ? 'reduced' : 'normal';
      root.dataset.tinting = String(s.wallpaperTinting);
      root.dataset.scrollbars = s.scrollbars;
      root.dataset.kbnav = String(s.keyboard.keyboardNavigation);
      root.dataset.bold = String(s.accessibility.boldText);
      const accent = ACCENTS[s.accent] ?? ACCENTS.blue;
      root.style.setProperty('--accent', theme === 'dark' ? accent.dark : accent.light);
      root.style.setProperty('--tint', String(s.glassTint));
      root.style.setProperty('--sidebar-icon', s.sidebarIconSize === 'small' ? '14px' : s.sidebarIconSize === 'large' ? '20px' : '16px');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.appearance, s.accent, s.glassTint, s.accessibility, s.battery.lowPower, s.wallpaperTinting, s.scrollbars, s.keyboard.keyboardNavigation, s.sidebarIconSize]);
}

function DisplayFilters() {
  const d = useSettings((s) => s.display);
  return (
    <>
      {d.nightShift && <div className="fixed inset-0 pointer-events-none z-[99998]" style={{ background: `rgba(255,138,30,${0.08 + d.nightShiftWarmth * 0.2})`, mixBlendMode: 'multiply' }} />}
      {d.brightness < 1 && <div className="fixed inset-0 pointer-events-none z-[99999]" style={{ background: `rgba(0,0,0,${(1 - d.brightness) * 0.85})` }} />}
    </>
  );
}

function DesktopShell() {
  useEffect(() => preloadApps(), []);
  useEffect(() => {
    // put the new Code Studio in existing Docks once, next to Terminal
    if (localStorage.getItem('gg.dock.code')) return;
    localStorage.setItem('gg.dock.code', '1');
    const a = useApps.getState();
    if (!a.dock.includes('code')) a.addToDock('code', a.dock.includes('terminal') ? a.dock.indexOf('terminal') + 1 : undefined);
  }, []);
  const fullscreen = useWindows((s) => {
    let best = null as null | (typeof s.windows)[number];
    for (const w of s.windows) if (!w.minimized && (!best || w.z > best.z)) best = w;
    return !!best?.fullscreen;
  });
  return (
    <>
      <Wallpaper />
      <Desktop />
      <WindowManager />
      <MenuBar hidden={fullscreen || useSettings.getState().menubar.autohide} />
      <Dock hidden={fullscreen} />
      <Launchpad />
      <Spotlight />
      <ControlCenter />
      <NotificationCenter />
      <Banners />
      <QuickLook />
      <ShortcutsPanel />
      <DndGhost />
      <ContextMenuLayer />
      <DialogLayer />
      <Toast />
      <ScreenshotLayer />
      <AppSwitcher />
      <Screensaver />
    </>
  );
}

export default function App() {
  const power = useSystem((s) => s.power);
  const set = useSystem((s) => s.set);
  const scale = useSettings((s) => s.display.scale) || 1;
  const a11y = useSettings((s) => s.accessibility);
  useThemeAttributes();
  const onDesktop = power === 'desktop' || power === 'sleep';
  useShortcuts(onDesktop);
  useSystemTicker(onDesktop);
  useEffect(() => installHostGuards(), []);
  useEffect(() => {
    if (!onDesktop || !keyboardCaptureSupported() || localStorage.getItem('gg.fsHint') === '1') return;
    const t = setTimeout(() => {
      localStorage.setItem('gg.fsHint', '1');
      useSystem.getState().showToast('Tip: turn on Full Screen in Control Center. Shortcuts like Ctrl+Tab, Ctrl+W and Alt+Tab then stay inside Golden Gate instead of your browser.');
    }, 6000);
    return () => clearTimeout(t);
  }, [onDesktop]);
  useCloudSync();

  useEffect(
    () =>
      onQuotaError((msg) => {
        notify({ appId: 'settings', title: 'Storage Full', body: msg });
      }),
    [],
  );

  const filter = [a11y.invertColors ? 'invert(1) hue-rotate(180deg)' : '', a11y.grayscale ? 'grayscale(1)' : ''].filter(Boolean).join(' ') || undefined;
  const showDesktop = power === 'desktop' || power === 'sleep' || power === 'restarting' || power === 'shuttingdown' || power === 'loggingout';

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      onContextMenu={(e) => {
        if (!(e.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) e.preventDefault();
      }}
    >
      <div
        className="absolute left-0 top-0 overflow-hidden"
        style={{ width: `${100 / scale}vw`, height: `${100 / scale}vh`, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: '0 0', filter }}
      >
        {power === 'booting' && (
          <BootScreen
            onDone={() => {
              const s = useSettings.getState();
              set({ power: s.onboarded ? 'login' : 'onboarding' });
            }}
          />
        )}
        {power === 'onboarding' && <Onboarding onFinish={() => set({ power: 'desktop' })} />}
        {power === 'login' && <LoginScreen mode="login" />}
        {showDesktop && <DesktopShell />}
        {power === 'locked' && (
          <div className="absolute inset-0 z-[9970]">
            <LoginScreen mode="locked" />
          </div>
        )}
      </div>
      <PowerOverlay />
      <DisplayFilters />
    </div>
  );
}
