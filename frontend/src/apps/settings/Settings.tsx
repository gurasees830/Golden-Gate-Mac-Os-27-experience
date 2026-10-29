import { useEffect, useMemo, useState } from 'react';
import {
  Wifi, Bluetooth, Globe, BatteryFull, Settings as Gear, Accessibility, Contrast, SlidersHorizontal, LayoutDashboard, Sun, Monitor, Search, Image as ImageIcon, Bell, Volume2, Moon, Lock, Hand, Users, AtSign, Keyboard, Mouse, Clock, Languages, LogIn, HardDrive, AppWindow, RefreshCw, History, Info, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useWindow } from '../../shell/windowContext';
import { useSettings } from '../../stores/settings';
import { SearchField, Avatar } from '../../components/ui';
import { PANES } from '../settingsPanes';
import { WifiPane, BluetoothPane, NetworkPane, BatteryPane, GeneralPane } from './panesA';
import { AppearancePane, AccessibilityPane, ControlCenterPane, DesktopDockPane, DisplaysPane, ScreenSaverPane, SpotlightPane, WallpaperPane } from './panesB';
import { NotificationsPane, SoundPane, FocusPane, LockScreenPane, PrivacyPane, UsersPane, InternetPane, KeyboardPane, TrackpadPane } from './panesC';
import { DateTimePane, LanguagePane, LoginItemsPane, StoragePane, ApplicationsPane, SoftwareUpdatePane, TimeMachinePane, AboutPane } from './panesD';

const ICONS: Record<string, React.ReactNode> = {
  wifi: <Wifi size={14} />, bluetooth: <Bluetooth size={14} />, network: <Globe size={14} />, battery: <BatteryFull size={14} />, general: <Gear size={14} />, accessibility: <Accessibility size={14} />,
  appearance: <Contrast size={14} />, controlcenter: <SlidersHorizontal size={14} />, desktop: <LayoutDashboard size={14} />, displays: <Sun size={14} />, screensaver: <Monitor size={14} />, spotlight: <Search size={14} />,
  wallpaper: <ImageIcon size={14} />, notifications: <Bell size={14} />, sound: <Volume2 size={14} />, focus: <Moon size={14} />, lockscreen: <Lock size={14} />, privacy: <Hand size={14} />, users: <Users size={14} />,
  internet: <AtSign size={14} />, keyboard: <Keyboard size={14} />, trackpad: <Mouse size={14} />, datetime: <Clock size={14} />, language: <Languages size={14} />, loginitems: <LogIn size={14} />, storage: <HardDrive size={14} />,
  applications: <AppWindow size={14} />, softwareupdate: <RefreshCw size={14} />, timemachine: <History size={14} />, about: <Info size={14} />,
};

export function PaneIcon({ id, size = 22 }: { id: string; size?: number }) {
  const p = PANES.find((x) => x.id === id);
  return (
    <span className="rounded-[6px] grid place-items-center text-white flex-none" style={{ width: size, height: size, background: `linear-gradient(${p?.color ?? '#8e8e93'}, color-mix(in srgb, ${p?.color ?? '#8e8e93'} 78%, #000))`, boxShadow: 'inset 0 0 0 .5px rgba(255,255,255,.25)' }}>
      {ICONS[id]}
    </span>
  );
}

const SIDEBAR_HIDDEN = new Set(['loginitems', 'storage', 'applications', 'softwareupdate', 'timemachine', 'about', 'datetime', 'language']);

export default function SettingsApp({ win }: AppProps) {
  const [pane, setPane] = useState<string>((win.args?.pane as string) || 'appearance');
  const [hist, setHist] = useState<string[]>([pane]);
  const [hi, setHi] = useState(0);
  const [q, setQ] = useState('');
  const user = useSettings((s) => s.user);
  const cloud = useSettings((s) => s.cloud);
  const { focused } = useWindow();

  useEffect(() => {
    const p = win.args?.pane as string | undefined;
    if (p && p !== pane) nav(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const nav = (p: string) => {
    const h = [...hist.slice(0, hi + 1), p];
    setHist(h);
    setHi(h.length - 1);
    setPane(p);
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return PANES.filter((p) => !SIDEBAR_HIDDEN.has(p.id) || query).filter((p) => !query || p.label.toLowerCase().includes(query) || p.keywords.includes(query));
  }, [q]);

  const meta = PANES.find((p) => p.id === pane);
  const Body = PANE_COMPONENTS[pane] ?? GeneralPane;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[230px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2">
          <SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search settings" />
        </div>
        <div className="scroll flex-1 px-[10px] pb-3">
          <div className={`flex items-center gap-[10px] p-[6px] rounded-[8px] mb-2 ${pane === 'users' ? 'bg-[var(--press)]' : ''}`} onClick={() => nav('users')}>
            <Avatar name={user.fullName} color={user.avatarColor} image={user.avatarImage} size={38} />
            <div className="min-w-0">
              <div className="font-semibold truncate">{user.fullName}</div>
              <div className="text-[11px] muted truncate">{cloud.email ? cloud.email : 'Local Account'}</div>
            </div>
          </div>
          {filtered.map((p, i) => (
            <div key={p.id}>
              {i > 0 && filtered[i - 1].group !== p.group && !q && <div className="h-[10px]" />}
              <div className={`sb-item accent ${pane === p.id ? 'active' : ''}`} style={{ height: 30 }} onClick={() => nav(p.id)}>
                <PaneIcon id={p.id} />
                <span className="truncate">{p.label}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-[12px] muted p-3">No Results</div>}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface" style={{ background: 'var(--bg)' }}>
        <TitleBar lights={false} showTitle={false} className="hairline-b !gap-2" style={{ paddingLeft: 14 }}>
          <div className="tb-group" data-no-drag>
            <button className="tb-btn" aria-label="Back" disabled={hi === 0} onClick={() => { setHi(hi - 1); setPane(hist[hi - 1]); }}>
              <ChevronLeft size={17} />
            </button>
            <button className="tb-btn" aria-label="Forward" disabled={hi >= hist.length - 1} onClick={() => { setHi(hi + 1); setPane(hist[hi + 1]); }}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className={`font-bold text-[15px] ${focused ? '' : 'toolbar-dim'}`}>{meta?.label}</div>
        </TitleBar>
        <div className="flex-1 scroll px-6 py-5">
          <div className="max-w-[560px] mx-auto">
            <Body nav={nav} />
          </div>
        </div>
      </div>
    </div>
  );
}

export type PaneProps = { nav: (id: string) => void };

const PANE_COMPONENTS: Record<string, React.ComponentType<PaneProps>> = {
  wifi: WifiPane, bluetooth: BluetoothPane, network: NetworkPane, battery: BatteryPane, general: GeneralPane, accessibility: AccessibilityPane, appearance: AppearancePane, controlcenter: ControlCenterPane,
  desktop: DesktopDockPane, displays: DisplaysPane, screensaver: ScreenSaverPane, spotlight: SpotlightPane, wallpaper: WallpaperPane, notifications: NotificationsPane, sound: SoundPane, focus: FocusPane,
  lockscreen: LockScreenPane, privacy: PrivacyPane, users: UsersPane, internet: InternetPane, keyboard: KeyboardPane, trackpad: TrackpadPane, datetime: DateTimePane, language: LanguagePane,
  loginitems: LoginItemsPane, storage: StoragePane, applications: ApplicationsPane, softwareupdate: SoftwareUpdatePane, timemachine: TimeMachinePane, about: AboutPane,
};

export function PaneHeader({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center mb-6">
      <PaneIcon id={id} size={56} />
      <div className="text-[19px] font-bold mt-3">{title}</div>
      {children && <div className="text-[12px] muted mt-1 max-w-[420px] leading-snug">{children}</div>}
    </div>
  );
}
