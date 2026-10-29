/** Settings pane catalogue (data only, shared with Spotlight). */
export interface PaneMeta {
  id: string;
  label: string;
  color: string;
  keywords: string;
  group: number;
}

export const PANES: PaneMeta[] = [
  { id: 'wifi', label: 'Wi‑Fi', color: '#007aff', keywords: 'wireless network internet ssid', group: 1 },
  { id: 'bluetooth', label: 'Bluetooth', color: '#007aff', keywords: 'devices headphones keyboard', group: 1 },
  { id: 'network', label: 'Network', color: '#007aff', keywords: 'ethernet firewall connection', group: 1 },
  { id: 'battery', label: 'Battery', color: '#34c759', keywords: 'power low power mode charge', group: 1 },
  { id: 'general', label: 'General', color: '#8e8e93', keywords: 'about software update storage airdrop sharing time machine backup reset erase', group: 2 },
  { id: 'accessibility', label: 'Accessibility', color: '#007aff', keywords: 'reduce motion transparency contrast invert grayscale bold', group: 2 },
  { id: 'appearance', label: 'Appearance', color: '#1c1c1e', keywords: 'dark mode light accent color theme liquid glass transparency', group: 2 },
  { id: 'controlcenter', label: 'Control Center', color: '#8e8e93', keywords: 'menu bar items status icons', group: 2 },
  { id: 'desktop', label: 'Desktop & Dock', color: '#1c1c1e', keywords: 'dock size magnification position hot corners windows tiling stage', group: 2 },
  { id: 'displays', label: 'Displays', color: '#007aff', keywords: 'brightness night shift resolution scale', group: 2 },
  { id: 'screensaver', label: 'Screen Saver', color: '#30b0c7', keywords: 'idle', group: 2 },
  { id: 'spotlight', label: 'Spotlight', color: '#8e8e93', keywords: 'search results categories', group: 2 },
  { id: 'wallpaper', label: 'Wallpaper', color: '#30b0c7', keywords: 'background desktop picture photo golden gate', group: 2 },
  { id: 'notifications', label: 'Notifications', color: '#ff3b30', keywords: 'alerts banners badges', group: 3 },
  { id: 'sound', label: 'Sound', color: '#ff2d55', keywords: 'volume alert output startup', group: 3 },
  { id: 'focus', label: 'Focus', color: '#5e5ce6', keywords: 'do not disturb', group: 3 },
  { id: 'lockscreen', label: 'Lock Screen', color: '#1c1c1e', keywords: 'password sleep screen saver', group: 4 },
  { id: 'privacy', label: 'Privacy & Security', color: '#007aff', keywords: 'permissions location camera microphone files', group: 4 },
  { id: 'users', label: 'Users & Groups', color: '#8e8e93', keywords: 'account password name avatar login cloud', group: 4 },
  { id: 'internet', label: 'Internet Accounts', color: '#007aff', keywords: 'mail cloud accounts', group: 5 },
  { id: 'keyboard', label: 'Keyboard', color: '#8e8e93', keywords: 'shortcuts text replacement', group: 6 },
  { id: 'trackpad', label: 'Mouse & Trackpad', color: '#8e8e93', keywords: 'scroll natural double click pointer', group: 6 },
  { id: 'datetime', label: 'Date & Time', color: '#007aff', keywords: 'clock timezone 24-hour', group: 7 },
  { id: 'language', label: 'Language & Region', color: '#007aff', keywords: 'locale temperature units week', group: 7 },
  { id: 'loginitems', label: 'Login Items', color: '#8e8e93', keywords: 'startup open at login', group: 7 },
  { id: 'storage', label: 'Storage', color: '#8e8e93', keywords: 'disk space usage', group: 7 },
  { id: 'applications', label: 'Applications', color: '#007aff', keywords: 'apps uninstall installed', group: 7 },
  { id: 'softwareupdate', label: 'Software Update', color: '#8e8e93', keywords: 'upgrade version', group: 7 },
  { id: 'timemachine', label: 'Time Machine', color: '#34c759', keywords: 'backup export import restore', group: 7 },
  { id: 'about', label: 'About', color: '#8e8e93', keywords: 'system information hardware this mac', group: 7 },
];
