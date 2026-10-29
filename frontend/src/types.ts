import type { ComponentType, ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type AppId = string;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TileMode = 'left' | 'right' | 'fill' | null;

export interface WindowState {
  id: string;
  appId: AppId;
  title: string;
  bounds: Bounds;
  z: number;
  minimized: boolean;
  /** Hidden with Hide (⌘H) or Show Desktop: not minimized, just out of sight. */
  hidden?: boolean;
  maximized: boolean;
  fullscreen: boolean;
  prevBounds?: Bounds;
  args?: Record<string, unknown>;
  dirty?: boolean;
  createdAt: number;
}

export interface MenuItem {
  label?: string;
  shortcut?: string; // e.g. "mod+s", "mod+shift+n"
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
  icon?: ReactNode;
  danger?: boolean;
}

export interface MenuDef {
  title: string;
  items: MenuItem[];
}

export type FsKind = 'folder' | 'file';

export interface FsNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: FsKind;
  mime: string;
  size: number;
  createdAt: number;
  modifiedAt: number;
  trashed: boolean;
  trashedAt?: number;
  originalParentId?: string;
  deskPos?: { x: number; y: number };
  tags?: string[];
  system?: boolean; // protected system folder
  assetUrl?: string; // bundled asset instead of stored content
  appId?: string; // pseudo-node representing an application (Applications folder)
}

export interface AppProps {
  win: WindowState;
}

export type AppCategory =
  | 'Productivity'
  | 'Utilities'
  | 'Entertainment'
  | 'Social'
  | 'Developer Tools'
  | 'Graphics & Design'
  | 'Games'
  | 'Reference'
  | 'Photo & Video'
  | 'Music'
  | 'Weather'
  | 'Navigation'
  | 'System';

export interface StoreListing {
  subtitle: string;
  description: string;
  version: string;
  latestVersion?: string; // newer version → update available
  sizeMB: number;
  whatsNew: string;
  features: string[];
  status: 'implemented' | 'partial';
  requires?: string; // e.g. "Camera permission"
  keywords?: string; // extra search terms ("social media", "video"…)
}

export interface AppDefinition {
  id: AppId;
  name: string;
  component: ComponentType<AppProps>;
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    resizable?: boolean;
    singleton?: boolean;
    chrome?: 'standard' | 'none'; // 'none' = app draws its own titlebar area
    background?: string;
  };
  category: AppCategory;
  system?: boolean; // cannot be uninstalled
  preinstalled?: boolean;
  hidden?: boolean; // utility windows (About, Get Info) not shown in Launchpad
  opens?: string[]; // mime prefixes this app can open
  store?: StoreListing;
  helpTopic?: string;
}

export interface AppNotification {
  id: string;
  appId: AppId;
  title: string;
  body?: string;
  time: number;
  read: boolean;
  open?: { appId: AppId; args?: Record<string, unknown> };
}

export interface DialogButton {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export interface DialogSpec {
  id: string;
  title: string;
  message?: string;
  icon?: AppId | 'warning' | 'info';
  buttons: DialogButton[];
  input?: { placeholder?: string; value?: string; type?: string };
  checkbox?: { label: string; checked: boolean };
  windowId?: string; // render as a sheet inside a window
  resolve: (result: { value: string; input?: string; checked?: boolean }) => void;
}
