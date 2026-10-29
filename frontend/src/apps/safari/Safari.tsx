import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LayoutGrid, ChevronLeft, ChevronRight, RotateCw, Plus, X, Share, PanelLeft, Star, BookOpen, History as HistoryIcon, Shield, ExternalLink, Download, Lock, Globe } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindow, useWindowTitle } from '../../shell/windowContext';
import { useFocusedWindowId } from '../../stores/windows';
import { idb, registerHydration, uid } from '../../lib/persist';
import { isFramed } from '../../lib/env';
import { useOffline } from '../../lib/network';
import { useSettings } from '../../stores/settings';
import { useFs, DOWNLOADS } from '../../stores/fs';
import { useSystem } from '../../stores/system';
import { copyText } from '../../lib/download';
import { HelpPage } from './HelpPage';
import { openApp } from '../../shell/actions';
import { GOOGLE_URL, SEARCH_URL, searchQuery, searchWikipedia, siteFromText, isYoutubeHome, knownToBlockFraming, youtubeId, youtubeQuery, type WikiResult } from './web';
import { YouTubeHome, YouTubeWatch } from './YouTube';

interface Tab {
  id: string;
  history: string[];
  index: number;
  title: string;
  loading: boolean;
}
interface Bookmark {
  url: string;
  title: string;
}
interface SafariData {
  bookmarks: Bookmark[];
  history: { url: string; title: string; time: number }[];
  readingList: Bookmark[];
  set: (p: Partial<SafariData>) => void;
}
const useSafari = create<SafariData>()(
  persist(
    (set) => ({
      bookmarks: [
        { url: 'golden-gate://help', title: 'Golden Gate Help' },
        { url: 'https://www.youtube.com/', title: 'YouTube' },
        { url: 'https://www.google.com/search?igu=1&q=Golden+Gate+Bridge', title: 'Google' },
        { url: 'https://en.wikipedia.org/wiki/Golden_Gate_Bridge', title: 'Wikipedia' },
        { url: 'https://developer.mozilla.org', title: 'MDN Web Docs' },
        { url: 'https://github.com', title: 'GitHub' },
        { url: 'https://www.openstreetmap.org', title: 'OpenStreetMap' },
        { url: 'https://spring.io/projects/spring-boot', title: 'Spring Boot' },
        { url: 'https://react.dev', title: 'React' },
      ],
      history: [],
      readingList: [],
      set: (p) => set(p),
    }),
    idb<SafariData>('app.safari'),
  ),
);
registerHydration(useSafari);

const START = 'golden-gate://start';

function normalize(input: string): string {
  const t = input.trim();
  if (!t) return START;
  if (/^golden-gate:\/\//.test(t)) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t) && !t.includes(' ')) return `https://${t}`;
  return siteFromText(t) ?? SEARCH_URL(t);
}

function displayHost(url: string) {
  try {
    const u = new URL(url);
    const q = searchQuery(url);
    if (q) return q;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function titleFor(url: string) {
  if (url === START) return 'Start Page';
  if (url.startsWith('golden-gate://search')) return `${searchQuery(url) || 'Search'} - Search`;
  if (url.startsWith('golden-gate://help')) return 'Golden Gate Help';
  if (url.startsWith('golden-gate://history')) return 'History';
  if (url.startsWith('golden-gate://bookmarks')) return 'Bookmarks';
  try {
    const u = new URL(url);
    const q = searchQuery(url);
    if (q) return `${q} - Search`;
    if (youtubeId(url)) return 'YouTube';
    if (isYoutubeHome(url)) return youtubeQuery(url) ? `${youtubeQuery(url)} - YouTube` : 'YouTube';
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  if (url.startsWith('golden-gate://')) return <Globe size={size - 2} className="text-[var(--accent)]" />;
  let host = '?';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  const hue = [...host].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className="rounded-[4px] grid place-items-center text-white font-bold flex-none" style={{ width: size, height: size, fontSize: size * 0.6, background: `hsl(${hue} 60% 48%)` }}>
      {host[0]?.toUpperCase()}
    </span>
  );
}

export default function Safari({ win }: AppProps) {
  const data = useSafari();
  const initial = (win.args?.url as string) ?? START;
  const [tabs, setTabs] = useState<Tab[]>([{ id: uid('tab'), history: [initial], index: 0, title: titleFor(initial), loading: false }]);
  const [active, setActive] = useState(tabs[0].id);
  const [addr, setAddr] = useState('');
  const [editing, setEditing] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [sideTab, setSideTab] = useState<'bookmarks' | 'reading' | 'history'>('bookmarks');
  const [overview, setOverview] = useState(false);
  const [closed, setClosed] = useState<Tab[]>([]);
  const [download, setDownload] = useState<{ name: string; progress: number } | null>(null);
  const addrRef = useRef<HTMLInputElement>(null);
  const justFocused = useRef(false);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const url = tab.history[tab.index];
  const offline = useOffline();
  useWindowTitle(tab.title);

  useEffect(() => {
    const u = win.args?.url as string | undefined;
    if (u && win.args?._nonce) newTab(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  useEffect(() => {
    if (!editing) setAddr(url === START ? '' : url);
  }, [url, editing]);

  const updateTab = (id: string, fn: (t: Tab) => Tab) =>
    setTabs((ts) => {
      let changed = false;
      const next = ts.map((t) => {
        if (t.id !== id) return t;
        const r = fn(t);
        if (r !== t) changed = true;
        return r;
      });
      return changed ? next : ts; // identical state → React skips the re-render
    });
  const navigate = (raw: string) => {
    const u = normalize(raw);
    updateTab(active, (t) => ({ ...t, history: [...t.history.slice(0, t.index + 1), u], index: t.index + 1, title: titleFor(u), loading: !u.startsWith('golden-gate://') }));
    if (!u.startsWith('golden-gate://start')) useSafari.getState().set({ history: [{ url: u, title: titleFor(u), time: Date.now() }, ...useSafari.getState().history.filter((h) => h.url !== u)].slice(0, 300) });
    setEditing(false);
    addrRef.current?.blur();
  };
  const newTab = (u = START) => {
    const t: Tab = { id: uid('tab'), history: [u], index: 0, title: titleFor(u), loading: false };
    setTabs((ts) => [...ts, t]);
    setActive(t.id);
    if (u === START) setTimeout(() => addrRef.current?.focus(), 30);
  };
  const rememberClosed = (t: Tab) => {
    if (t.history[t.index] !== START) setClosed((c) => [t, ...c].slice(0, 12));
  };
  const closeTab = (id: string) => {
    const gone = tabs.find((t) => t.id === id);
    if (gone) rememberClosed(gone);
    if (tabs.length === 1) {
      updateTab(id, () => ({ id, history: [START], index: 0, title: 'Start Page', loading: false }));
      return;
    }
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (active === id) setActive(rest[Math.min(i, rest.length - 1)].id);
  };
  const selectTab = (i: number) => {
    const t = tabs[i === 9 ? tabs.length - 1 : i]; // ⌘9 is always the last tab, as in Safari
    if (t) setActive(t.id);
  };
  const cycleTab = (dir: 1 | -1) => {
    const i = tabs.findIndex((t) => t.id === active);
    setActive(tabs[(i + dir + tabs.length) % tabs.length].id);
  };
  const reopenClosed = (n = 0) => {
    const t = closed[n];
    if (!t) return;
    setClosed((c) => c.filter((_, k) => k !== n));
    const revived = { ...t, id: uid('tab'), loading: false };
    setTabs((ts) => [...ts, revived]);
    setActive(revived.id);
  };
  const focusedId = useFocusedWindowId();
  const { win: thisWin } = useWindow();
  const keys = useRef({ selectTab, cycleTab, setOverview });
  keys.current = { selectTab, cycleTab, setOverview };
  // Browsers keep Ctrl/⌘+1…9, Ctrl+Tab and Ctrl+Shift+[ for their own tabs, so Option/Alt works too.
  useEffect(() => {
    if (focusedId !== thisWin.id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return keys.current.setOverview(false);
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const c = e.code;
      if (/^Digit[1-9]$/.test(c)) keys.current.selectTab(Number(c.slice(5)) - 1);
      else if (c === 'BracketRight') keys.current.cycleTab(1);
      else if (c === 'BracketLeft') keys.current.cycleTab(-1);
      else if (c === 'Backslash') keys.current.setOverview((o) => !o);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusedId, thisWin.id]);
  const isBookmarked = data.bookmarks.some((b) => b.url === url);
  const toggleBookmark = () => data.set({ bookmarks: isBookmarked ? data.bookmarks.filter((b) => b.url !== url) : [...data.bookmarks, { url, title: tab.title }] });

  const simulateDownload = (name: string, content: string) => {
    setDownload({ name, progress: 0 });
    let p = 0;
    const t = setInterval(() => {
      p += 0.2;
      setDownload({ name, progress: Math.min(1, p) });
      if (p >= 1) {
        clearInterval(t);
        void useFs.getState().createFile(DOWNLOADS, name, content).then(() => {
          useSystem.getState().set({ dockBounce: { ...useSystem.getState().dockBounce, downloads: Date.now() } });
          setTimeout(() => setDownload(null), 1500);
        });
      }
    }, 180);
  };

  useMenus(
    [
      {
        title: 'File',
        items: [
          { label: 'New Window', shortcut: 'mod+n', action: () => openApp('safari', undefined, { forceNew: true }) },
          { label: 'New Tab', shortcut: 'mod+t', action: () => newTab() },
          { label: 'Open Location…', shortcut: 'mod+l', action: () => addrRef.current?.focus() },
          { separator: true },
          { label: 'Close Tab', shortcut: 'mod+w', action: () => closeTab(active) },
          { label: 'Reopen Last Closed Tab', shortcut: 'mod+shift+t', disabled: !closed.length, action: () => reopenClosed(0) },
        ],
      },
      { title: 'View', items: [
        { label: sidebar ? 'Hide Sidebar' : 'Show Sidebar', shortcut: 'mod+shift+l', action: () => setSidebar(!sidebar) },
        { label: overview ? 'Hide Tab Overview' : 'Show Tab Overview', shortcut: 'mod+shift+\\', action: () => setOverview(!overview) },
        { label: 'Show Next Tab', shortcut: 'ctrl+tab', disabled: tabs.length < 2, action: () => cycleTab(1) },
        { label: 'Show Previous Tab', shortcut: 'ctrl+shift+tab', disabled: tabs.length < 2, action: () => cycleTab(-1) },
        { label: 'Show Next Tab (Alt)', shortcut: 'mod+shift+]', disabled: tabs.length < 2, action: () => cycleTab(1) },
        { label: 'Show Previous Tab (Alt)', shortcut: 'mod+shift+[', disabled: tabs.length < 2, action: () => cycleTab(-1) },
        { label: 'Select Tab', submenu: Array.from({ length: 9 }, (_, i) => ({ label: i === 8 ? 'Last Tab' : `Tab ${i + 1}`, shortcut: `mod+${i + 1}`, disabled: i < 8 && i >= tabs.length, action: () => selectTab(i) })) },
        { separator: true },
        { label: 'Reload Page', shortcut: 'mod+r', action: () => updateTab(active, (t) => ({ ...t, loading: !url.startsWith('golden-gate://') })) }] },
      {
        title: 'History',
        items: [
          { label: 'Back', shortcut: 'mod+[', disabled: tab.index === 0, action: () => updateTab(active, (t) => ({ ...t, index: t.index - 1, title: titleFor(t.history[t.index - 1]) })) },
          { label: 'Forward', shortcut: 'mod+]', disabled: tab.index >= tab.history.length - 1, action: () => updateTab(active, (t) => ({ ...t, index: t.index + 1, title: titleFor(t.history[t.index + 1]) })) },
          { label: 'Home', shortcut: 'mod+shift+h', action: () => navigate(START) },
          { label: 'Show All History', shortcut: 'mod+y', action: () => navigate('golden-gate://history') },
          { label: 'Recently Closed Tabs', disabled: !closed.length, submenu: closed.map((t, n) => ({ label: t.title, action: () => reopenClosed(n) })) },
          { separator: true },
          { label: 'Clear History…', action: () => data.set({ history: [] }) },
        ],
      },
      { title: 'Bookmarks', items: [{ label: isBookmarked ? 'Remove Bookmark' : 'Add Bookmark…', shortcut: 'mod+d', action: toggleBookmark }, { label: 'Add to Reading List', shortcut: 'mod+shift+d', action: () => data.set({ readingList: [{ url, title: tab.title }, ...data.readingList.filter((r) => r.url !== url)] }) }, { label: 'Show Bookmarks', shortcut: 'mod+alt+b', action: () => navigate('golden-gate://bookmarks') }] },
    ],
    [tabs, active, url, sidebar, overview, closed, isBookmarked, data.bookmarks.length],
  );

  const external = !url.startsWith('golden-gate://');
  const ytId = external ? youtubeId(url) : null;
  const ytHome = external && isYoutubeHome(url);
  const canEmbed = external && !isFramed && !knownToBlockFraming(url);
  const doneLoading = () => updateTab(active, (t) => (t.loading ? { ...t, loading: false } : t));

  return (
    <div className="flex flex-col h-full app-surface relative">
      <TitleBar showTitle={false} className="chrome !gap-2" height={52}>
        <div className="tb-group" data-no-drag>
          <button className={`tb-btn ${sidebar ? 'active' : ''}`} aria-label="Sidebar" onClick={() => setSidebar(!sidebar)}><PanelLeft size={16} /></button>
          <button className="tb-btn" aria-label="Back" disabled={tab.index === 0} onClick={() => updateTab(active, (t) => ({ ...t, index: t.index - 1, title: titleFor(t.history[t.index - 1]) }))}><ChevronLeft size={17} /></button>
          <button className="tb-btn" aria-label="Forward" disabled={tab.index >= tab.history.length - 1} onClick={() => updateTab(active, (t) => ({ ...t, index: t.index + 1, title: titleFor(t.history[t.index + 1]) }))}><ChevronRight size={17} /></button>
        </div>
        <div className="flex-1 flex justify-center min-w-0" data-no-drag>
          <form
            className="search-field !h-[34px] relative"
            style={{ width: 'min(560px, 100%)' }}
            onSubmit={(e) => {
              e.preventDefault();
              navigate(addr);
            }}
          >
            {external && !editing ? <Lock size={12} className="flex-none opacity-60" /> : <Globe size={13} className="flex-none opacity-60" />}
            <input
              ref={addrRef}
              aria-label="Address and search"
              value={editing ? addr : url === START ? '' : url.startsWith('golden-gate://') ? titleFor(url) : displayHost(url)}
              placeholder="Search or enter website name"
              className="text-center focus:text-left"
              onFocus={(e) => {
                setEditing(true);
                setAddr(url === START ? '' : url);
                justFocused.current = true;
                setTimeout(() => e.target.select(), 0);
              }}
              onMouseUp={(e) => {
                // first click selects the whole address, as in Safari
                if (justFocused.current) {
                  e.preventDefault();
                  justFocused.current = false;
                  (e.target as HTMLInputElement).select();
                }
              }}
              onBlur={() => setEditing(false)}
              onChange={(e) => setAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && addrRef.current?.blur()}
            />
            {!editing && external && (
              <button type="button" className="border-0 bg-transparent p-0 opacity-70" aria-label="Reload" onClick={() => updateTab(active, (t) => ({ ...t, loading: true }))}><RotateCw size={13} /></button>
            )}
            {tab.loading && <div className="absolute left-3 right-3 bottom-[2px] h-[2px] rounded bg-[var(--accent)] origin-left" style={{ animation: 'gg-load 1.2s ease-out forwards' }} />}
          </form>
        </div>
        <div className="tb-group" data-no-drag>
          {download && (
            <button className="tb-btn" aria-label="Downloads" onClick={() => openApp('finder', { folderId: DOWNLOADS }, { forceNew: true })}>
              <Download size={15} style={{ color: download.progress >= 1 ? '#34c759' : undefined }} />
            </button>
          )}
          <button className="tb-btn" aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'} onClick={toggleBookmark}><Star size={15} fill={isBookmarked ? 'currentColor' : 'none'} /></button>
          <button className="tb-btn" aria-label="Share" onClick={() => void copyText(url, 'Link copied.')}><Share size={15} /></button>
          <button className={`tb-btn ${overview ? 'active' : ''}`} aria-label="Show tab overview" onClick={() => setOverview(!overview)}><LayoutGrid size={15} /></button>
          <button className="tb-btn" aria-label="New tab" onClick={() => newTab()}><Plus size={17} /></button>
        </div>
      </TitleBar>
      {tabs.length > 1 && (
        <div className="flex gap-1 px-2 pb-[6px] chrome hairline-b">
          {tabs.map((t) => (
            <div key={t.id} className="group flex-1 min-w-0 max-w-[260px] h-[28px] rounded-[8px] flex items-center gap-2 px-2 text-[12px]" style={{ background: t.id === active ? 'var(--bg)' : 'var(--hover)', boxShadow: t.id === active ? '0 0 0 .5px var(--separator), 0 1px 2px rgba(0,0,0,.08)' : undefined }} onClick={() => setActive(t.id)}>
              <button className="border-0 bg-transparent p-0 opacity-0 group-hover:opacity-70" aria-label="Close tab" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}><X size={12} /></button>
              <Favicon url={t.history[t.index]} size={14} />
              <span className="truncate flex-1 text-center">{t.title}</span>
            </div>
          ))}
        </div>
      )}
      {tabs.length === 1 && <div className="hairline-b" />}
      <div className="flex-1 min-h-0 flex">
        {sidebar && (
          <div className="w-[240px] flex-none sidebar hairline-r flex flex-col">
            <div className="flex p-2 gap-1">
              {(['bookmarks', 'reading', 'history'] as const).map((s) => (
                <button key={s} className={`tb-btn flex-1 ${sideTab === s ? 'active' : ''}`} aria-label={s} onClick={() => setSideTab(s)}>
                  {s === 'bookmarks' ? <Star size={14} /> : s === 'reading' ? <BookOpen size={14} /> : <HistoryIcon size={14} />}
                </button>
              ))}
            </div>
            <div className="scroll flex-1 px-2">
              {(sideTab === 'bookmarks' ? data.bookmarks : sideTab === 'reading' ? data.readingList : data.history.slice(0, 80)).map((b, i) => (
                <div key={`${b.url}${i}`} className="sb-item" onClick={() => navigate(b.url)}>
                  <Favicon url={b.url} size={14} />
                  <span className="truncate">{b.title}</span>
                </div>
              ))}
              {sideTab === 'reading' && !data.readingList.length && <div className="text-[12px] muted p-2">Add pages with Bookmarks ▸ Add to Reading List.</div>}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0 relative">
          {offline && external ? (
            <ErrorPage title="You Are Not Connected to the Internet" body="Golden Gate’s simulated Wi‑Fi is off. Turn it on from the menu bar or Control Center." />
          ) : url === START ? (
            <StartPage onGo={navigate} />
          ) : url.startsWith('golden-gate://help') ? (
            <HelpPage anchor={url.split('#')[1]} onDownload={simulateDownload} onGo={navigate} />
          ) : searchQuery(url) !== null ? (
            <SearchPage key={url} query={searchQuery(url)!} onGo={navigate} />
          ) : url.startsWith('golden-gate://history') ? (
            <ListPage title="History" items={data.history.map((h) => ({ url: h.url, title: h.title, sub: new Date(h.time).toLocaleString() }))} onGo={navigate} onClear={() => data.set({ history: [] })} />
          ) : url.startsWith('golden-gate://bookmarks') ? (
            <ListPage title="Bookmarks" items={data.bookmarks.map((b) => ({ url: b.url, title: b.title, sub: b.url }))} onGo={navigate} />
          ) : ytId ? (
            <LoadedAfter key={url} onLoaded={doneLoading}>
              <YouTubeWatch id={ytId} url={url} onGo={navigate} />
            </LoadedAfter>
          ) : ytHome ? (
            <LoadedAfter key={url} onLoaded={doneLoading}>
              <YouTubeHome query={youtubeQuery(url)} onGo={navigate} />
            </LoadedAfter>
          ) : canEmbed ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center gap-2 px-3 h-[28px] text-[11.5px] muted hairline-b flex-none" style={{ background: 'var(--bg-2)' }}>
                <span className="truncate flex-1">If this page stays blank, {displayHost(url)} doesn’t allow being shown inside other sites.</span>
                <a className="flex items-center gap-1 no-underline text-[var(--accent)]" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> Open in New Tab</a>
              </div>
              <iframe key={`${url}-${tab.loading}`} title={tab.title} src={url} className="w-full flex-1 border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onLoad={doneLoading} />
            </div>
          ) : (
            <ExternalPage url={url} onLoaded={() => updateTab(active, (t) => (t.loading ? { ...t, loading: false } : t))} />
          )}
        </div>
      </div>
      {overview && (
        <div className="absolute inset-0 z-20 scroll p-6" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(30px)' }} onClick={() => setOverview(false)}>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {tabs.map((t, i) => (
              <div key={t.id} role="button" tabIndex={0} aria-label={`Tab ${i + 1}: ${t.title}`} className="group card p-3 flex flex-col gap-2 cursor-default" style={{ outline: t.id === active ? '2px solid var(--accent)' : undefined }} onClick={(e) => { e.stopPropagation(); setActive(t.id); setOverview(false); }}>
                <div className="flex items-center gap-2">
                  <Favicon url={t.history[t.index]} size={16} />
                  <span className="truncate flex-1 text-[12.5px] font-medium">{t.title}</span>
                  <button className="border-0 bg-transparent p-0 opacity-0 group-hover:opacity-70" aria-label="Close tab" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}><X size={13} /></button>
                </div>
                <div className="text-[11px] muted truncate">{t.history[t.index] === START ? 'Start Page' : t.history[t.index]}</div>
              </div>
            ))}
            <button className="card p-3 border-0 grid place-items-center muted" aria-label="New tab" onClick={(e) => { e.stopPropagation(); setOverview(false); newTab(); }}><Plus size={22} /></button>
          </div>
          {closed.length > 0 && (
            <div className="mt-6" onClick={(e) => e.stopPropagation()}>
              <div className="text-[12px] font-semibold muted mb-2">Recently Closed</div>
              {closed.slice(0, 6).map((t, n) => (
                <button key={t.id + n} className="sb-item w-full border-0 bg-transparent text-left" onClick={() => { reopenClosed(n); setOverview(false); }}>
                  <Favicon url={t.history[t.index]} size={14} /> <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes gg-load { from { transform: scaleX(0) } to { transform: scaleX(.9) } }`}</style>
    </div>
  );
}

function SearchPage({ query, onGo }: { query: string; onGo: (u: string) => void }) {
  const [results, setResults] = useState<WikiResult[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    searchWikipedia(query).then((r) => live && setResults(r)).catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query]);
  const q = encodeURIComponent(query);
  return (
    <div className="h-full scroll" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[760px] mx-auto py-8 px-6">
        <h1 className="text-[22px] font-bold mb-1">Results for “{query}”</h1>
        <div className="flex flex-wrap gap-2 mb-6">
          <button className="btn" onClick={() => onGo(`https://www.youtube.com/results?search_query=${q}`)}>Search YouTube</button>
          <a className="btn no-underline" href={GOOGLE_URL(query)} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Google</a>
          <a className="btn no-underline" href={`https://duckduckgo.com/?q=${q}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> DuckDuckGo</a>
          <a className="btn no-underline" href={`https://www.bing.com/search?q=${q}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Bing</a>
        </div>
        <div className="text-[12px] muted mb-3">Web search engines don’t allow being shown inside other pages, so these open in a new browser tab. Results below come from Wikipedia.</div>
        {!results && !error && <div className="muted text-[13px]">Searching…</div>}
        {error && <div className="muted text-[13px]">Couldn’t reach Wikipedia: {error}</div>}
        {results?.length === 0 && <div className="muted text-[13px]">No Wikipedia results.</div>}
        {results?.map((r) => (
          <button key={r.url} className="block w-full text-left border-0 bg-transparent p-0 mb-5" onClick={() => onGo(r.url)}>
            <div className="text-[12px] muted truncate">{r.url}</div>
            <div className="text-[16px] font-medium text-[var(--accent)]">{r.title}</div>
            <div className="text-[13px] leading-snug">{r.snippet}…</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadedAfter({ onLoaded, children }: { onLoaded: () => void; children: React.ReactNode }) {
  const cb = useRef(onLoaded);
  cb.current = onLoaded;
  useEffect(() => {
    const t = setTimeout(() => cb.current(), 350);
    return () => clearTimeout(t);
  }, []);
  return <>{children}</>;
}

function ErrorPage({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center p-8" style={{ background: 'var(--bg-2)' }}>
      <div className="text-center max-w-[460px]">
        <div className="text-[22px] font-bold mb-2">{title}</div>
        <div className="text-[13px] muted leading-relaxed">{body}</div>
        {children}
      </div>
    </div>
  );
}

function ExternalPage({ url, onLoaded }: { url: string; onLoaded: () => void }) {
  useEffect(() => {
    const t = setTimeout(onLoaded, 500);
    return () => clearTimeout(t);
  }, [url, onLoaded]);
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return (
    <ErrorPage
      title="This page opens outside the simulator"
      body={
        isFramed
          ? `Golden Gate is running inside a hosted preview, which blocks other websites from loading inside it. ${host} can still open in a new browser tab.`
          : `${host} doesn’t allow other sites to embed it, and Golden Gate never bypasses that protection. Open it in a new browser tab instead.`
      }
    >
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn primary lg mt-5 inline-flex no-underline">
        <ExternalLink size={14} /> Open {host} in a New Tab
      </a>
      <div className="text-[11.5px] faint mt-3 break-all">{url}</div>
    </ErrorPage>
  );
}

function StartPage({ onGo }: { onGo: (u: string) => void }) {
  const data = useSafari();
  const freq = useMemo(() => {
    const counts = new Map<string, { url: string; title: string; n: number }>();
    for (const h of data.history) {
      if (h.url.startsWith('golden-gate://')) continue;
      const c = counts.get(h.url) ?? { url: h.url, title: h.title, n: 0 };
      c.n++;
      counts.set(h.url, c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [data.history]);
  return (
    <div className="h-full scroll" style={{ background: 'linear-gradient(var(--bg-2), var(--bg))' }}>
      <div className="max-w-[760px] mx-auto py-12 px-6">
        <h2 className="text-[19px] font-bold mb-4">Favorites</h2>
        <div className="grid grid-cols-6 gap-5 mb-10">
          {data.bookmarks.slice(0, 12).map((b) => (
            <button key={b.url} className="flex flex-col items-center gap-2 border-0 bg-transparent" onClick={() => onGo(b.url)}>
              <div className="w-[64px] h-[64px] rounded-[14px] grid place-items-center" style={{ background: 'var(--bg)', boxShadow: '0 0 0 .5px var(--separator), 0 2px 8px rgba(0,0,0,.08)' }}>
                <Favicon url={b.url} size={36} />
              </div>
              <span className="text-[11.5px] text-center truncate max-w-[90px]">{b.title}</span>
            </button>
          ))}
        </div>
        {freq.length > 0 && (
          <>
            <h2 className="text-[19px] font-bold mb-4">Frequently Visited</h2>
            <div className="grid grid-cols-3 gap-3 mb-10">
              {freq.map((f) => (
                <button key={f.url} className="card p-3 flex items-center gap-3 border-0 text-left" onClick={() => onGo(f.url)}>
                  <Favicon url={f.url} size={28} />
                  <span className="truncate text-[12.5px]">{f.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <h2 className="text-[19px] font-bold mb-4">Privacy Report</h2>
        <div className="card p-4 flex items-center gap-4 mb-10">
          <Shield size={32} className="text-[#34c759]" />
          <div className="text-[13px]">Golden Gate doesn’t track you. Pages you visit are kept only in this browser’s history, which you can clear from the History menu.</div>
        </div>
        {data.readingList.length > 0 && (
          <>
            <h2 className="text-[19px] font-bold mb-4">Reading List</h2>
            {data.readingList.map((r) => (
              <button key={r.url} className="w-full card p-3 mb-2 flex items-center gap-3 border-0 text-left" onClick={() => onGo(r.url)}>
                <Favicon url={r.url} size={22} />
                <span className="truncate">{r.title}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ListPage({ title, items, onGo, onClear }: { title: string; items: { url: string; title: string; sub: string }[]; onGo: (u: string) => void; onClear?: () => void }) {
  return (
    <div className="h-full scroll p-8 max-w-[800px] mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-[24px] font-bold">{title}</h1>
        {onClear && <button className="btn" onClick={onClear}>Clear History…</button>}
      </div>
      {items.length === 0 && <div className="muted">Nothing here yet.</div>}
      {items.map((i, k) => (
        <div key={k} className="flex items-center gap-3 py-2 hairline-b cursor-default" onClick={() => onGo(i.url)}>
          <Favicon url={i.url} />
          <span className="flex-1 truncate">{i.title}</span>
          <span className="text-[11.5px] muted truncate max-w-[300px]">{i.sub}</span>
        </div>
      ))}
    </div>
  );
}
