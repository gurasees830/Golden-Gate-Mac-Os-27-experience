import { lazy, type ComponentType } from 'react';
import type { AppDefinition, AppProps } from '../types';
import { WEB_APP_DEFS } from './webapps/catalog';

type Loader = () => Promise<{ default: ComponentType<AppProps> }>;
const loaders: Loader[] = [];
const L = (f: Loader) => {
  loaders.push(f);
  return lazy(f);
};

/** Download every app's code in the background, one at a time, so the first launch of an app is instant. */
export function preloadApps() {
  const idle: (cb: () => void) => void = (cb) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300));
  let i = 0;
  const next = () => {
    if (i >= loaders.length) return;
    loaders[i++]().catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}

/**
 * Central application registry. Every entry references a real, implemented
 * module. Catalog apps (with `store` and no `preinstalled`) are installed from
 * the App Store before they can launch.
 */
export const APPS: AppDefinition[] = [
  { id: 'finder', name: 'Finder', component: L(() => import('./finder/Finder')), window: { width: 980, height: 600, minWidth: 560, minHeight: 340 }, category: 'System', system: true, preinstalled: true },
  { id: 'launchpad', name: 'Launchpad', component: L(() => import('./misc/Empty')), window: { width: 10, height: 10, minWidth: 10, minHeight: 10 }, category: 'System', system: true, preinstalled: true, hidden: true },
  { id: 'safari', name: 'Safari', component: L(() => import('./safari/Safari')), window: { width: 1120, height: 720, minWidth: 520, minHeight: 360 }, category: 'Productivity', preinstalled: true, opens: ['text/html'],
    store: { subtitle: 'Browse with tabs, bookmarks and history', description: 'A tabbed web browser for the simulator with bookmarks, history, a start page and built-in help pages. Websites that allow embedding open inside the window; others open in a new browser tab.', version: '27.0', sizeMB: 48, whatsNew: 'Compact tab bar and a refreshed start page.', features: ['Tabs', 'Bookmarks', 'History', 'Start Page'], status: 'implemented' } },
  { id: 'messages', name: 'Messages', component: L(() => import('./messages/Messages')), window: { width: 880, height: 600, minWidth: 560, minHeight: 360 }, category: 'Social', preinstalled: true,
    store: { subtitle: 'Local message simulator', description: 'Chat with the built-in assistant or keep notes-to-self conversations. Messages stay in this browser; nothing is sent over any network.', version: '27.0', sizeMB: 22, whatsNew: 'Tapback reactions.', features: ['Conversations', 'Reactions', 'Search'], status: 'implemented' } },
  { id: 'mail', name: 'Mail', component: L(() => import('./mail/Mail')), window: { width: 1120, height: 680, minWidth: 720, minHeight: 400 }, category: 'Productivity', preinstalled: true,
    store: { subtitle: 'Local email client simulator', description: 'Mailboxes, compose, reply, flags and search — stored locally. Sending to your own local address delivers to your Inbox.', version: '27.0', sizeMB: 31, whatsNew: 'Draft autosave.', features: ['Mailboxes', 'Compose', 'Drafts', 'Search'], status: 'implemented' } },
  { id: 'maps', name: 'Maps', component: L(() => import('./maps/Maps')), window: { width: 1040, height: 680, minWidth: 560, minHeight: 380 }, category: 'Navigation', preinstalled: true,
    store: { subtitle: 'Offline world map', description: 'An offline vector world map with city search, guides of saved places and straight-line distance previews.', version: '27.0', sizeMB: 40, whatsNew: 'Dark map style.', features: ['City search', 'Guides', 'Distance'], status: 'implemented' } },
  { id: 'photos', name: 'Photos', component: L(() => import('./photos/Photos')), window: { width: 1060, height: 680, minWidth: 620, minHeight: 400 }, category: 'Photo & Video', preinstalled: true, opens: ['image/'],
    store: { subtitle: 'Your photo library', description: 'Import photos, organise albums, mark favourites, run slideshows and set any photo as your wallpaper.', version: '27.0', sizeMB: 55, whatsNew: 'Slideshows.', features: ['Albums', 'Favorites', 'Slideshow'], status: 'implemented' } },
  { id: 'facetime', name: 'FaceTime', component: L(() => import('./facetime/FaceTime')), window: { width: 780, height: 560, minWidth: 520, minHeight: 380 }, category: 'Social', preinstalled: true,
    store: { subtitle: 'Camera preview & call simulator', description: 'Preview your camera (with permission) and try the call interface. No calls are placed over any network.', version: '27.0', sizeMB: 18, whatsNew: 'Background blur.', features: ['Camera preview', 'Effects'], status: 'partial', requires: 'Camera permission' } },
  { id: 'calendar', name: 'Calendar', component: L(() => import('./calendar/Calendar')), window: { width: 1060, height: 700, minWidth: 640, minHeight: 440 }, category: 'Productivity', preinstalled: true,
    store: { subtitle: 'Day, week and month views', description: 'Events with alerts, colour-coded calendars and natural-language quick entry like “Lunch tomorrow at 1pm”.', version: '27.0', sizeMB: 26, whatsNew: 'Natural-language event creation.', features: ['Month/Week/Day', 'Alerts', 'Quick Add'], status: 'implemented' } },
  { id: 'contacts', name: 'Contacts', component: L(() => import('./contacts/Contacts')), window: { width: 840, height: 580, minWidth: 560, minHeight: 360 }, category: 'Productivity', preinstalled: true,
    store: { subtitle: 'People and groups', description: 'Create, edit, group and search contacts. Export vCards.', version: '27.0', sizeMB: 14, whatsNew: 'Groups.', features: ['Groups', 'vCard'], status: 'implemented' } },
  { id: 'reminders', name: 'Reminders', component: L(() => import('./reminders/Reminders')), window: { width: 880, height: 600, minWidth: 560, minHeight: 360 }, category: 'Productivity', preinstalled: true,
    store: { subtitle: 'Lists, due dates and priorities', description: 'Smart lists for Today, Scheduled, Flagged and Completed, with timed alerts.', version: '27.0', sizeMB: 16, whatsNew: 'Flags.', features: ['Smart lists', 'Alerts'], status: 'implemented' } },
  { id: 'notes', name: 'Notes', component: L(() => import('./notes/Notes')), window: { width: 980, height: 640, minWidth: 620, minHeight: 380 }, category: 'Productivity', preinstalled: true,
    store: { subtitle: 'Rich-text notes with folders', description: 'Formatted notes with checklists, folders, pinning and search. Autosaves as you type.', version: '27.0', sizeMB: 20, whatsNew: 'Checklists.', features: ['Rich text', 'Checklists', 'Folders'], status: 'implemented' } },
  { id: 'music', name: 'Music', component: L(() => import('./music/Music')), window: { width: 1060, height: 680, minWidth: 640, minHeight: 400 }, category: 'Music', preinstalled: true, opens: ['audio/'],
    store: { subtitle: 'Play your audio files', description: 'Import audio files, build playlists, shuffle and repeat. Includes two short demo tracks generated in your browser.', version: '27.0', sizeMB: 44, whatsNew: 'Generated demo tracks.', features: ['Playlists', 'Shuffle', 'Repeat'], status: 'implemented' } },
  { id: 'appstore', name: 'App Store', component: L(() => import('./appstore/AppStore')), window: { width: 1080, height: 700, minWidth: 720, minHeight: 440, singleton: true }, category: 'System', system: true, preinstalled: true },
  { id: 'settings', name: 'System Settings', component: L(() => import('./settings/Settings')), window: { width: 840, height: 640, minWidth: 700, minHeight: 420, singleton: true }, category: 'System', system: true, preinstalled: true },
  { id: 'terminal', name: 'Terminal', component: L(() => import('./terminal/Terminal')), window: { width: 740, height: 470, minWidth: 420, minHeight: 240, background: '#1e1e1e' }, category: 'Developer Tools', preinstalled: true,
    store: { subtitle: 'Shell for the virtual filesystem', description: 'A zsh-style terminal with ls, cd, mkdir, touch, cat, echo, open, mv, cp, rm and more — all operating on the simulator’s virtual filesystem. It does not run real host commands.', version: '2.15', sizeMB: 12, whatsNew: 'Tab completion.', features: ['Virtual FS commands', 'History', 'Tab completion'], status: 'implemented' } },
  { id: 'activity', name: 'Activity Monitor', component: L(() => import('./activity/ActivityMonitor')), window: { width: 880, height: 560, minWidth: 600, minHeight: 360 }, category: 'Utilities', preinstalled: true,
    store: { subtitle: 'What the simulator is doing', description: 'Running apps and windows, measured main-thread load and frame rate, browser-reported memory and simulator storage.', version: '27.0', sizeMB: 9, whatsNew: 'Frame-rate graph.', features: ['Processes', 'Measured load', 'Storage'], status: 'implemented' } },
  { id: 'textedit', name: 'TextEdit', component: L(() => import('./textedit/TextEdit')), window: { width: 720, height: 620, minWidth: 380, minHeight: 260 }, category: 'Productivity', preinstalled: true, opens: ['text/', 'application/json'],
    store: { subtitle: 'Simple documents', description: 'Create, open and save text documents with word counts, Save As and export.', version: '1.20', sizeMB: 8, whatsNew: 'Export as Markdown.', features: ['Save / Save As', 'Export'], status: 'implemented' } },
  { id: 'preview', name: 'Preview', component: L(() => import('./preview/Preview')), window: { width: 880, height: 660, minWidth: 420, minHeight: 320 }, category: 'Utilities', preinstalled: true, opens: ['image/', 'application/pdf', 'video/'],
    store: { subtitle: 'View images and PDFs', description: 'Zoom, fit, rotate and inspect images; page through PDF documents.', version: '11.0', sizeMB: 24, whatsNew: 'PDF thumbnails.', features: ['Images', 'PDF', 'Inspector'], status: 'implemented' } },
  { id: 'calculator', name: 'Calculator', component: L(() => import('./calculator/Calculator')), window: { width: 260, height: 418, minWidth: 260, minHeight: 418, resizable: false, singleton: true }, category: 'Utilities', preinstalled: true,
    store: { subtitle: 'Basic and scientific', description: 'A safe expression calculator with history, keyboard input and a scientific mode.', version: '11.0', sizeMB: 4, whatsNew: 'History sidebar.', features: ['Scientific', 'History'], status: 'implemented' } },
  { id: 'clock', name: 'Clock', component: L(() => import('./clock/Clock')), window: { width: 780, height: 560, minWidth: 520, minHeight: 380, singleton: true }, category: 'Utilities', preinstalled: true,
    store: { subtitle: 'World clock, alarms, stopwatch, timers', description: 'Alarms and timers notify you even when the Clock window is closed.', version: '27.0', sizeMB: 7, whatsNew: 'Multiple timers.', features: ['World Clock', 'Alarms', 'Stopwatch', 'Timers'], status: 'implemented' } },
  { id: 'about', name: 'About This Mac', component: L(() => import('./about/About')), window: { width: 300, height: 540, minWidth: 300, minHeight: 540, resizable: false, singleton: true }, category: 'System', system: true, preinstalled: true, hidden: true },
  { id: 'systemreport', name: 'System Information', component: L(() => import('./about/SystemReport')), window: { width: 860, height: 600, minWidth: 600, minHeight: 380, singleton: true }, category: 'System', system: true, preinstalled: true, hidden: true },
  { id: 'getinfo', name: 'Info', component: L(() => import('./finder/GetInfo')), window: { width: 290, height: 520, minWidth: 260, minHeight: 360 }, category: 'System', system: true, preinstalled: true, hidden: true },

  // ---------------------------------------------------------------- App Store catalog
  { id: 'weather', name: 'Weather', component: L(() => import('./weather/Weather')), window: { width: 920, height: 640, minWidth: 600, minHeight: 420 }, category: 'Weather',
    store: { subtitle: 'Forecasts for your cities', description: 'Current conditions, hourly and 10-day forecasts from the free Open-Meteo service when your network allows it. When live data can’t be reached, a clearly labelled demo mode is shown instead.', version: '2.1', latestVersion: '2.2', sizeMB: 28, whatsNew: 'Version 2.2: sunrise and sunset are now calculated for every saved city.', features: ['Live data (Open-Meteo)', 'Saved cities', 'Hourly & 10-day'], status: 'implemented' } },
  { id: 'podcasts', name: 'Podcasts', component: L(() => import('./podcasts/Podcasts')), window: { width: 980, height: 640, minWidth: 620, minHeight: 400 }, category: 'Entertainment',
    store: { subtitle: 'Listen to episodes you import', description: 'Import episode audio files, resume where you left off and change playback speed.', version: '1.0', sizeMB: 26, whatsNew: 'Playback speed control.', features: ['Resume', 'Speed'], status: 'implemented' } },
  { id: 'tv', name: 'TV', component: L(() => import('./tv/TV')), window: { width: 1000, height: 640, minWidth: 620, minHeight: 400 }, category: 'Entertainment', opens: ['video/'],
    store: { subtitle: 'Your video library', description: 'Import your own video files, see thumbnails and continue watching where you left off.', version: '1.0', sizeMB: 38, whatsNew: 'Continue watching.', features: ['Library', 'Resume playback'], status: 'implemented' } },
  { id: 'voicememos', name: 'Voice Memos', component: L(() => import('./voicememos/VoiceMemos')), window: { width: 720, height: 480, minWidth: 520, minHeight: 340 }, category: 'Utilities',
    store: { subtitle: 'Record with your microphone', description: 'Record audio with your microphone (requires permission), see a live waveform and save memos to your Documents.', version: '3.0', sizeMB: 11, whatsNew: 'Live waveform.', features: ['Recording', 'Playback'], status: 'implemented', requires: 'Microphone permission' } },
  { id: 'fontbook', name: 'Font Book', component: L(() => import('./fontbook/FontBook')), window: { width: 880, height: 600, minWidth: 560, minHeight: 380 }, category: 'Graphics & Design',
    store: { subtitle: 'Fonts on your computer', description: 'Detects which common fonts are installed on your computer and previews them. With permission (Chrome), lists every local font.', version: '11.0', sizeMB: 9, whatsNew: 'Local Font Access support.', features: ['Font detection', 'Preview'], status: 'implemented' } },
  { id: 'sketchbook', name: 'Sketchbook', component: L(() => import('./sketchbook/Sketchbook')), window: { width: 1000, height: 680, minWidth: 560, minHeight: 400 }, category: 'Graphics & Design',
    store: { subtitle: 'Draw and save to Pictures', description: 'Pens, markers, highlighter and eraser with undo, then save your drawing as a PNG in Pictures.', version: '1.2', sizeMB: 15, whatsNew: 'Highlighter tool.', features: ['Pens', 'Undo', 'PNG export'], status: 'implemented' } },
  { id: 'code', name: 'Code Studio', component: L(() => import('./code/CodeStudio')), window: { width: 1180, height: 740, minWidth: 640, minHeight: 400, background: '#1f1f1f' }, category: 'Developer Tools', preinstalled: true, opens: ['text/', 'application/json', 'application/javascript'],
    store: { subtitle: 'A VS Code–style editor for real projects', description: 'Open project folders, edit with Monaco (the editor inside VS Code) — IntelliSense, live TypeScript errors, multi-cursor and the command palette — then run JavaScript/TypeScript or preview web apps live. Import folders from your computer and download projects as ZIP.', version: '1.0', sizeMB: 64, whatsNew: 'New: projects, live preview, search and quick open.', features: ['Monaco editor', 'Projects & Explorer', 'Live preview', 'Run JS / TS', 'Search', 'Quick Open'], status: 'implemented' } },
  { id: 'codepad', name: 'Codepad', component: L(() => import('./codepad/Codepad')), window: { width: 980, height: 640, minWidth: 560, minHeight: 360 }, category: 'Developer Tools', opens: ['text/'],
    store: { subtitle: 'Code editor that runs JavaScript', description: 'Edit code files with line numbers and syntax colouring. Run JavaScript in a sandboxed frame and see console output.', version: '1.4', sizeMB: 19, whatsNew: 'Sandboxed Run.', features: ['Syntax colour', 'Run JS'], status: 'implemented' } },
  { id: 'archive', name: 'Archive Utility', component: L(() => import('./archive/ArchiveUtility')), window: { width: 520, height: 380, minWidth: 420, minHeight: 300, singleton: true }, category: 'Utilities', opens: ['application/zip'],
    store: { subtitle: 'Create and expand .zip files', description: 'Compress files and folders into real ZIP archives and expand archives you import.', version: '10.0', sizeMB: 6, whatsNew: 'Drag-and-drop compression.', features: ['Compress', 'Expand'], status: 'implemented' } },
  { id: 'screenshot', name: 'Screenshot', component: L(() => import('./screenshot/Screenshot')), window: { width: 460, height: 300, minWidth: 400, minHeight: 260, resizable: false, singleton: true }, category: 'Utilities',
    store: { subtitle: 'Capture the desktop or a window', description: 'Capture the whole simulator desktop or the front window, with an optional timer. Screenshots are saved to your Desktop.', version: '1.0', sizeMB: 5, whatsNew: 'Timer.', features: ['Desktop', 'Window', 'Timer'], status: 'implemented' } },
  { id: 'chess', name: 'Chess', component: L(() => import('./chess/Chess')), window: { width: 780, height: 640, minWidth: 600, minHeight: 520 }, category: 'Games',
    store: { subtitle: 'Play against the computer', description: 'Full chess rules with a computer opponent at three difficulty levels.', version: '3.18', sizeMB: 21, whatsNew: 'Hard difficulty.', features: ['Computer opponent', 'Undo'], status: 'implemented' } },
  { id: 'mines', name: 'Mines', component: L(() => import('./mines/Mines')), window: { width: 360, height: 470, minWidth: 360, minHeight: 470, resizable: false }, category: 'Games',
    store: { subtitle: 'Classic minesweeper', description: 'Clear the field without hitting a mine. Three difficulty levels and best times.', version: '1.0', sizeMB: 3, whatsNew: 'Best times.', features: ['3 levels', 'Best times'], status: 'implemented' } },
  { id: 'photobooth', name: 'Photo Booth', component: L(() => import('./photobooth/PhotoBooth')), window: { width: 780, height: 580, minWidth: 520, minHeight: 420 }, category: 'Photo & Video',
    store: { subtitle: 'Take photos with effects', description: 'Snap photos with your camera (requires permission), apply effects and save them to Pictures.', version: '13.0', sizeMB: 17, whatsNew: 'New effects.', features: ['Effects', 'Save to Pictures'], status: 'implemented', requires: 'Camera permission' } },
  { id: 'stickies', name: 'Stickies', component: L(() => import('./stickies/Stickies')), window: { width: 280, height: 280, minWidth: 180, minHeight: 140, chrome: 'none' }, category: 'Productivity',
    store: { subtitle: 'Sticky notes on your desktop', description: 'Colourful notes that stay on your desktop. Each note is its own window and is saved automatically.', version: '10.2', sizeMB: 2, whatsNew: 'Six colours.', features: ['Multiple notes', 'Colours'], status: 'implemented' } },
  ...WEB_APP_DEFS,
];
