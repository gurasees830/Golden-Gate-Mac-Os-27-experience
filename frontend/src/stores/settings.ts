import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idb, registerHydration } from '../lib/persist';
import type { AppId } from '../types';

export type Accent = 'multicolor' | 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'graphite';
export type HotCorner = 'none' | 'launchpad' | 'notifications' | 'desktop' | 'lock' | 'screensaver' | 'controlcenter' | 'sleep';
export type FocusMode = 'dnd' | 'work' | 'personal' | 'sleep';

export const ACCENTS: Record<Accent, { light: string; dark: string; label: string }> = {
  multicolor: { light: '#007aff', dark: '#0a84ff', label: 'Multicolor' },
  blue: { light: '#007aff', dark: '#0a84ff', label: 'Blue' },
  purple: { light: '#9a4fd6', dark: '#bf5af2', label: 'Purple' },
  pink: { light: '#e8457f', dark: '#ff4f9a', label: 'Pink' },
  red: { light: '#ff3b30', dark: '#ff453a', label: 'Red' },
  orange: { light: '#ff8c00', dark: '#ff9f0a', label: 'Orange' },
  yellow: { light: '#f5b800', dark: '#ffd60a', label: 'Yellow' },
  green: { light: '#28a745', dark: '#30d158', label: 'Green' },
  graphite: { light: '#8e8e93', dark: '#98989d', label: 'Graphite' },
};

export interface NotifPref {
  allow: boolean;
  style: 'banners' | 'alerts' | 'none';
  sound: boolean;
  badge: boolean;
}

export interface SettingsState {
  onboarded: boolean;
  osVersion: string;
  user: { fullName: string; accountName: string; avatarColor: string; avatarImage?: string; passcodeHash?: string; passcodeSalt?: string; hint?: string };
  computerName: string;
  appearance: 'light' | 'dark' | 'auto';
  accent: Accent;
  sidebarIconSize: 'small' | 'medium' | 'large';
  glassTint: number; // 0 = clear … 1 = tinted
  wallpaperTinting: boolean;
  scrollbars: 'auto' | 'scrolling' | 'always';
  wallpaper: { id: string; fit: 'fill' | 'fit' | 'center'; animated: boolean; customName?: string };
  recentWallpapers: string[];
  dock: {
    size: number;
    magnification: boolean;
    magnifySize: number;
    position: 'bottom' | 'left' | 'right';
    autohide: boolean;
    minimizeEffect: 'genie' | 'scale';
    minimizeToApp: boolean;
    animateOpening: boolean;
    showIndicators: boolean;
    showRecents: boolean;
    titlebarDoubleClick: 'zoom' | 'minimize' | 'none';
  };
  desktop: { showItems: boolean; sortBy: 'none' | 'name' | 'kind' | 'date'; iconSize: number; hotCorners: { tl: HotCorner; tr: HotCorner; bl: HotCorner; br: HotCorner }; clickWallpaperToReveal: boolean; closeWindowsOnQuit: boolean; tiling: boolean };
  menubar: {
    showBackground: boolean;
    autohide: boolean;
    clock: { showDate: boolean; showDay: boolean; showSeconds: boolean; use24h: boolean };
    items: { wifi: boolean; bluetooth: boolean; sound: boolean; battery: boolean; batteryPercent: boolean; focus: boolean; nowPlaying: boolean; spotlight: boolean };
  };
  sound: { volume: number; muted: boolean; alertSound: string; alertVolume: number; startupSound: boolean; uiSounds: boolean; volumeFeedback: boolean };
  display: { brightness: number; nightShift: boolean; nightShiftWarmth: number; scale: number; trueTone: boolean };
  accessibility: { reduceMotion: boolean; reduceTransparency: boolean; increaseContrast: boolean; invertColors: boolean; grayscale: boolean; boldText: boolean };
  network: { wifi: boolean; ssid: string | null; knownNetworks: string[]; bluetooth: boolean; btConnected: string[]; airdrop: 'off' | 'contacts' | 'everyone'; firewall: boolean };
  focus: { active: FocusMode | null; until: number | null; allowRepeated: boolean };
  notifications: { previews: 'always' | 'unlocked' | 'never'; perApp: Record<AppId, NotifPref>; sleepingDisplay: boolean };
  keyboard: { shortcutsEnabled: boolean; spotlightShortcut: 'mod+space' | 'mod+k' | 'mod+shift+space'; disabled: string[]; textReplacements: { from: string; to: string }[]; keyboardNavigation: boolean; symbols: 'mac' | 'pc' };
  pointer: { naturalScrolling: boolean; doubleClickMs: number; secondaryClick: boolean; tapToClick: boolean };
  dateTime: { auto: boolean; offsetMs: number; timeZone: string }; // timeZone 'auto' = browser zone
  region: { locale: string; firstDayOfWeek: 0 | 1 | 6; tempUnit: 'C' | 'F'; measurement: 'metric' | 'us' };
  privacy: { location: Record<AppId, boolean>; camera: Record<AppId, boolean>; microphone: Record<AppId, boolean>; screen: Record<AppId, boolean>; files: Record<AppId, boolean>; analytics: boolean; locationServices: boolean };
  lockScreen: { screensaverAfterMin: number; requirePasswordAfterSleep: boolean; screensaver: 'drift' | 'clock' | 'aerial'; message: string };
  loginItems: AppId[];
  battery: { lowPower: boolean };
  manualSpecs: { model: string; processor: string; memory: string; graphics: string; storage: string; serial: string };
  spotlight: Record<string, boolean>;
  finder: { showPathBar: boolean; showStatusBar: boolean; defaultView: 'icons' | 'list' | 'columns'; showExtensions: boolean; warnEmptyTrash: boolean; autoEmptyTrash: boolean; suggestNames: boolean; sidebarItems: Record<string, boolean> };
  reopenWindows: boolean;
  cloud: { email: string | null; displayName: string | null; lastSync: number | null };
  patch: <K extends keyof SettingsState>(key: K, value: Partial<SettingsState[K]> | SettingsState[K]) => void;
  set: (partial: Partial<SettingsState>) => void;
}

export const DEFAULT_NOTIF: NotifPref = { allow: true, style: 'banners', sound: true, badge: true };

const defaults = {
  onboarded: false,
  osVersion: '27.0.1',
  user: { fullName: 'Guest', accountName: 'guest', avatarColor: '#ff9f0a' },
  computerName: 'Golden Gate',
  appearance: 'light' as const,
  accent: 'multicolor' as Accent,
  sidebarIconSize: 'medium' as const,
  glassTint: 0.35,
  wallpaperTinting: true,
  scrollbars: 'auto' as const,
  wallpaper: { id: 'gg-dynamic', fit: 'fill' as const, animated: true },
  recentWallpapers: [],
  dock: {
    size: 52,
    magnification: true,
    magnifySize: 84,
    position: 'bottom' as const,
    autohide: false,
    minimizeEffect: 'genie' as const,
    minimizeToApp: false,
    animateOpening: true,
    showIndicators: true,
    showRecents: true,
    titlebarDoubleClick: 'zoom' as const,
  },
  desktop: { showItems: true, sortBy: 'none' as const, iconSize: 64, hotCorners: { tl: 'none' as HotCorner, tr: 'notifications' as HotCorner, bl: 'none' as HotCorner, br: 'desktop' as HotCorner }, clickWallpaperToReveal: false, closeWindowsOnQuit: true, tiling: true },
  menubar: {
    showBackground: false,
    autohide: false,
    clock: { showDate: true, showDay: true, showSeconds: false, use24h: false },
    items: { wifi: true, bluetooth: false, sound: true, battery: true, batteryPercent: false, focus: true, nowPlaying: true, spotlight: true },
  },
  sound: { volume: 0.6, muted: false, alertSound: 'Chime', alertVolume: 0.8, startupSound: true, uiSounds: true, volumeFeedback: true },
  display: { brightness: 1, nightShift: false, nightShiftWarmth: 0.5, scale: 1, trueTone: true },
  accessibility: { reduceMotion: false, reduceTransparency: false, increaseContrast: false, invertColors: false, grayscale: false, boldText: false },
  network: { wifi: true, ssid: null, knownNetworks: [], bluetooth: true, btConnected: ['Magic Keyboard'], airdrop: 'contacts' as const, firewall: true },
  focus: { active: null, until: null, allowRepeated: true },
  notifications: { previews: 'always' as const, perApp: {}, sleepingDisplay: false },
  keyboard: { shortcutsEnabled: true, spotlightShortcut: 'mod+space' as const, disabled: [], textReplacements: [{ from: 'omw', to: 'On my way!' }, { from: 'gg27', to: 'Golden Gate 27' }], keyboardNavigation: true, symbols: 'mac' as const },
  pointer: { naturalScrolling: true, doubleClickMs: 450, secondaryClick: true, tapToClick: true },
  dateTime: { auto: true, offsetMs: 0, timeZone: 'auto' },
  region: { locale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US', firstDayOfWeek: 0 as const, tempUnit: 'C' as const, measurement: 'metric' as const },
  privacy: { location: {}, camera: {}, microphone: {}, screen: {}, files: {}, analytics: false, locationServices: true },
  lockScreen: { screensaverAfterMin: 10, requirePasswordAfterSleep: true, screensaver: 'drift' as const, message: '' },
  loginItems: [],
  battery: { lowPower: false },
  manualSpecs: { model: '', processor: '', memory: '', graphics: '', storage: '', serial: '' },
  spotlight: { apps: true, files: true, folders: true, notes: true, contacts: true, events: true, reminders: true, settings: true, store: true, calculator: true, mail: true },
  finder: { showPathBar: true, showStatusBar: true, defaultView: 'icons' as const, showExtensions: false, warnEmptyTrash: true, autoEmptyTrash: false, suggestNames: true, sidebarItems: { recents: true, applications: true, desktop: true, documents: true, downloads: true, pictures: true, music: true, movies: true, home: true, trash: true, tags: true } },
  reopenWindows: true,
  cloud: { email: null, displayName: null, lastSync: null },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...(defaults as unknown as Omit<SettingsState, 'patch' | 'set'>),
      patch: (key, value) =>
        set((s) => {
          const cur = s[key];
          if (cur && typeof cur === 'object' && !Array.isArray(cur) && value && typeof value === 'object' && !Array.isArray(value)) {
            return { [key]: { ...(cur as object), ...(value as object) } } as Partial<SettingsState>;
          }
          return { [key]: value } as Partial<SettingsState>;
        }),
      set: (partial) => set(partial),
    }),
    idb<SettingsState>('settings', {
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<SettingsState>;
        const out = { ...current } as Record<string, unknown>;
        for (const [k, v] of Object.entries(p)) {
          const c = (current as unknown as Record<string, unknown>)[k];
          if (c && typeof c === 'object' && !Array.isArray(c) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(c as object), ...(v as object) };
          else out[k] = v;
        }
        // browsers can't read the real network name: drop the invented ones older builds stored
        const net = out.network as SettingsState['network'] | undefined;
        if (net) {
          const fake = new Set(['Golden Gate Wi-Fi', 'Presidio Guest', 'Fort Point 5G', 'Crissy Field Café']);
          out.network = { ...net, ssid: net.ssid && fake.has(net.ssid) ? null : net.ssid, knownNetworks: (net.knownNetworks || []).filter((k) => !fake.has(k)) };
        }
        return out as unknown as SettingsState;
      },
    }),
  ),
);
registerHydration(useSettings);

export function notifPref(appId: AppId): NotifPref {
  return { ...DEFAULT_NOTIF, ...(useSettings.getState().notifications.perApp[appId] || {}) };
}

export function permission(kind: 'location' | 'camera' | 'microphone' | 'screen' | 'files', appId: AppId): boolean | undefined {
  const s = useSettings.getState();
  if (kind === 'location' && !s.privacy.locationServices) return false;
  return s.privacy[kind][appId];
}

export function resolvedTheme(appearance: SettingsState['appearance']): 'light' | 'dark' {
  if (appearance === 'auto') {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return appearance;
}

export async function hashPasscode(passcode: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${passcode}`);
  try {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // crypto.subtle unavailable (insecure context) – fall back to a simple FNV hash
    let h = 2166136261;
    for (const b of data) h = Math.imul(h ^ b, 16777619);
    return (h >>> 0).toString(16);
  }
}
