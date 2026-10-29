import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Brush, Briefcase, Gamepad2, Code2, LayoutGrid, RefreshCw, User, ChevronLeft, Star, Check, X, Info } from 'lucide-react';
import type { AppDefinition, AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { allApps, getApp, storeMatch } from '../../lib/appRegistry';
import { useApps, isInstalled, startInstall, cancelInstall, hasUpdate, installedVersion } from '../../stores/apps';
import { useSettings } from '../../stores/settings';
import { AppIcon } from '../../icons/AppIcon';
import { SearchField, ProgressRing, Avatar, EmptyState } from '../../components/ui';
import { openApp } from '../../shell/actions';
import { uninstallApp } from '../../shell/Launchpad';

type Tab = 'discover' | 'create' | 'work' | 'play' | 'develop' | 'categories' | 'updates' | 'account';
const TAB_CATS: Record<string, string[]> = {
  create: ['Graphics & Design', 'Photo & Video', 'Music'],
  work: ['Productivity', 'Utilities', 'Reference', 'Navigation', 'Weather'],
  play: ['Games', 'Entertainment', 'Social'],
  develop: ['Developer Tools'],
};

function storeApps() {
  return allApps().filter((a) => a.store);
}

export function GetButton({ app, big }: { app: AppDefinition; big?: boolean }) {
  const apps = useApps();
  const job = apps.jobs[app.id];
  const installed = isInstalled(app.id, apps);
  const update = installed && hasUpdate(app.id);
  if (job)
    return (
      <button className="border-0 bg-transparent p-0 relative grid place-items-center" aria-label={`Cancel ${job.kind}`} onClick={() => cancelInstall(app.id)} title="Click to cancel">
        <ProgressRing value={job.progress} size={big ? 32 : 28} />
        <span className="absolute w-[8px] h-[8px] rounded-[2px] bg-[var(--accent)]" />
      </button>
    );
  const cls = `btn pill ${big ? '!h-[28px] !px-5' : '!h-[24px] !px-4'} font-semibold`;
  if (update) return <button className={`${cls} primary`} onClick={() => startInstall(app.id, 'update')}>Update</button>;
  if (installed) return <button className={cls} style={{ background: 'var(--field)', color: 'var(--accent)' }} onClick={() => openApp(app.id)}>Open</button>;
  return (
    <button className={cls} style={{ background: 'var(--field)', color: 'var(--accent)' }} onClick={() => startInstall(app.id)}>
      Get
    </button>
  );
}

export default function AppStore({ win }: AppProps) {
  const [tab, setTab] = useState<Tab>((win.args?.tab as Tab) ?? 'discover');
  const [detail, setDetail] = useState<string | null>((win.args?.appId as string) ?? null);
  const [q, setQ] = useState('');
  const user = useSettings((s) => s.user);
  const apps = useApps();

  useEffect(() => {
    if (win.args?.appId) setDetail(win.args.appId as string);
    if (win.args?.tab) setTab(win.args.tab as Tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const updates = storeApps().filter((a) => hasUpdate(a.id));
  useMenus([{ title: 'Store', items: [{ label: 'Discover', action: () => { setTab('discover'); setDetail(null); } }, { label: 'Updates', action: () => { setTab('updates'); setDetail(null); } }, { label: 'Purchased', action: () => { setTab('account'); setDetail(null); } }] }], []);

  const results = useMemo(() => (q ? storeApps().map((a) => ({ a, s: storeMatch(a, q) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name)).map((x) => x.a) : []), [q]);

  const nav: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'discover', label: 'Discover', icon: <Sparkles size={16} /> },
    { id: 'create', label: 'Create', icon: <Brush size={16} /> },
    { id: 'work', label: 'Work', icon: <Briefcase size={16} /> },
    { id: 'play', label: 'Play', icon: <Gamepad2 size={16} /> },
    { id: 'develop', label: 'Develop', icon: <Code2 size={16} /> },
    { id: 'categories', label: 'Categories', icon: <LayoutGrid size={16} /> },
    { id: 'updates', label: 'Updates', icon: <RefreshCw size={16} /> },
  ];

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[210px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2">
          <SearchField width="100%" value={q} onChange={(e) => { setQ(e.target.value); setDetail(null); }} onClear={() => setQ('')} aria-label="Search the App Store" />
        </div>
        <div className="px-[10px] flex-1">
          {nav.map((n) => (
            <div key={n.id} className={`sb-item accent ${tab === n.id && !q && !detail ? 'active' : ''}`} onClick={() => { setTab(n.id); setDetail(null); setQ(''); }}>
              <span className="sb-ico">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.id === 'updates' && updates.length > 0 && <span className="badge !min-w-[18px] !h-[18px]">{updates.length}</span>}
            </div>
          ))}
        </div>
        <div className={`m-2 p-2 rounded-[10px] flex items-center gap-2 ${tab === 'account' && !detail ? 'bg-[var(--press)]' : ''}`} onClick={() => { setTab('account'); setDetail(null); setQ(''); }}>
          <Avatar name={user.fullName} color={user.avatarColor} image={user.avatarImage} size={28} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{user.fullName}</div>
            <div className="text-[11px] muted">Local account</div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="!h-[44px]" height={44}>
          {detail && (
            <button className="btn ghost" data-no-drag onClick={() => setDetail(null)}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
        </TitleBar>
        <div className="flex-1 scroll px-7 pb-8">
          {detail ? (
            <Detail id={detail} />
          ) : q ? (
            <>
              <h1 className="text-[26px] font-bold mb-4">Results for “{q}”</h1>
              {results.length === 0 ? <EmptyState title="No Results" /> : <Grid apps={results} onOpen={setDetail} />}
            </>
          ) : tab === 'discover' ? (
            <Discover onOpen={setDetail} />
          ) : tab in TAB_CATS ? (
            <>
              <h1 className="text-[26px] font-bold mb-4 capitalize">{tab}</h1>
              <Grid apps={storeApps().filter((a) => TAB_CATS[tab].includes(a.category))} onOpen={setDetail} />
            </>
          ) : tab === 'categories' ? (
            <>
              <h1 className="text-[26px] font-bold mb-4">Categories</h1>
              {[...new Set(storeApps().map((a) => a.category))].sort().map((c) => (
                <div key={c} className="mb-6">
                  <h2 className="text-[17px] font-bold mb-2">{c}</h2>
                  <Grid apps={storeApps().filter((a) => a.category === c)} onOpen={setDetail} />
                </div>
              ))}
            </>
          ) : tab === 'updates' ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-[26px] font-bold">Updates</h1>
                {updates.length > 1 && <button className="btn primary pill" onClick={() => updates.forEach((a) => startInstall(a.id, 'update'))}>Update All</button>}
              </div>
              {updates.length === 0 ? (
                <EmptyState title="All Apps Are Up to Date" subtitle="Updates for apps you installed appear here." />
              ) : (
                updates.map((a) => (
                  <div key={a.id} className="flex gap-4 py-4 hairline-b">
                    <AppIcon id={a.id} size={64} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px]">{a.name}</div>
                      <div className="text-[12px] muted">Version {a.store!.latestVersion} · installed {installedVersion(a.id)}</div>
                      <div className="text-[12.5px] mt-1">{a.store!.whatsNew}</div>
                    </div>
                    <GetButton app={a} />
                  </div>
                ))
              )}
            </>
          ) : (
            <Account apps={apps} onOpen={setDetail} />
          )}
        </div>
      </div>
    </div>
  );
}

function Discover({ onOpen }: { onOpen: (id: string) => void }) {
  const catalog = storeApps().filter((a) => !a.preinstalled);
  const hero = [
    { id: 'weather', eyebrow: 'GET STARTED', title: 'Real forecasts, right on your desktop', grad: 'linear-gradient(135deg,#1e6fd9,#5ab0ff 60%,#ffd59a)' },
    { id: 'sketchbook', eyebrow: 'CREATE', title: 'Sketch ideas with pens and markers', grad: 'linear-gradient(135deg,#ff7a45,#ffcf4a)' },
    { id: 'chess', eyebrow: 'PLAY', title: 'Challenge the computer to a game', grad: 'linear-gradient(135deg,#3d2a1a,#a5743c)' },
  ];
  return (
    <>
      <h1 className="text-[26px] font-bold mb-4">Discover</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {hero.map((h) => {
          const a = getApp(h.id)!;
          return (
            <div key={h.id} className="rounded-[16px] p-5 text-white relative overflow-hidden cursor-default min-h-[200px] flex flex-col" style={{ background: h.grad }} onClick={() => onOpen(h.id)}>
              <div className="text-[11px] font-bold opacity-80">{h.eyebrow}</div>
              <div className="text-[20px] font-bold leading-tight mt-1 max-w-[85%]">{h.title}</div>
              <div className="absolute right-[-20px] bottom-[-20px] opacity-90 rotate-[-12deg]">
                <AppIcon id={h.id} size={130} />
              </div>
              <div className="mt-auto flex items-center gap-2 relative z-10" onClick={(e) => e.stopPropagation()}>
                <AppIcon id={h.id} size={36} />
                <div className="text-[12.5px] font-semibold">{a.name}</div>
                <GetButton app={a} />
              </div>
            </div>
          );
        })}
      </div>
      <h2 className="text-[19px] font-bold mb-3">Apps We Love</h2>
      <Grid apps={catalog.filter((a) => !a.id.startsWith('web.'))} onOpen={onOpen} />
      <h2 className="text-[19px] font-bold mt-8 mb-1">Social</h2>
      <p className="text-[12px] muted mb-3">The real services, signed in with your own accounts. They open in their own browser window.</p>
      <Grid apps={catalog.filter((a) => a.id.startsWith('web.') && a.category === 'Social')} onOpen={onOpen} />
      <h2 className="text-[19px] font-bold mt-8 mb-3">Web Apps for Work, Play and Code</h2>
      <Grid apps={catalog.filter((a) => a.id.startsWith('web.') && a.category !== 'Social')} onOpen={onOpen} />
      <h2 className="text-[19px] font-bold mt-8 mb-3">Built In</h2>
      <Grid apps={storeApps().filter((a) => a.preinstalled)} onOpen={onOpen} />
      <p className="text-[11.5px] muted mt-8 max-w-[640px]">
        Every app here works. Golden Gate apps are modules of this simulator; web apps open the real website. “Installing” adds them to Launchpad and the Dock menu — nothing is downloaded to or installed on your computer.
      </p>
    </>
  );
}

function Grid({ apps, onOpen }: { apps: AppDefinition[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {apps.map((a) => (
        <div key={a.id} className="flex items-center gap-3 py-3 hairline-b cursor-default" onClick={() => onOpen(a.id)}>
          <AppIcon id={a.id} size={56} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.5px] truncate">{a.name}</div>
            <div className="text-[12px] muted truncate">{a.store!.subtitle}</div>
            {a.store!.status === 'partial' && <div className="text-[10.5px] text-[#ff9500]">Partly limited in browsers</div>}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <GetButton app={a} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Stars({ value, onChange, size = 14 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="inline-flex gap-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} aria-label={`${i} stars`} disabled={!onChange} className="border-0 bg-transparent p-0" onClick={() => onChange?.(i)}>
          <Star size={size} fill={i <= value ? '#ff9500' : 'none'} color="#ff9500" />
        </button>
      ))}
    </span>
  );
}

function Detail({ id }: { id: string }) {
  const app = getApp(id);
  const apps = useApps();
  const rating = apps.ratings[id];
  const [stars, setStars] = useState(rating?.stars ?? 0);
  const [title, setTitle] = useState(rating?.title ?? '');
  const [review, setReview] = useState(rating?.review ?? '');
  if (!app?.store) return <EmptyState title="App not found" />;
  const st = app.store;
  const installed = isInstalled(id, apps);
  const lastInstall = apps.history.find((h) => h.appId === id && h.action !== 'uninstall');
  return (
    <div className="pt-2">
      <div className="flex gap-6 items-start">
        <AppIcon id={id} size={128} />
        <div className="flex-1 min-w-0 pt-2">
          <div className="text-[28px] font-bold leading-tight">{app.name}</div>
          <div className="text-[14px] muted">{st.subtitle}</div>
          <div className="flex items-center gap-3 mt-4">
            <GetButton app={app} big />
            {installed && !app.system && (
              <button className="btn pill" onClick={() => void uninstallApp(app)}>Delete…</button>
            )}
          </div>
          <div className="text-[11.5px] muted mt-2">{st.status === 'implemented' ? 'Fully working in this simulator' : 'Works with limits in some browsers'}{st.requires ? ` · Needs ${st.requires}` : ''}</div>
        </div>
      </div>
      <div className="grid grid-cols-4 hairline-t hairline-b my-6 py-3 text-center">
        {[
          ['RATING', rating ? `${rating.stars}.0` : '—', rating ? 'Your rating' : 'No ratings yet'],
          ['CATEGORY', app.category, ''],
          ['DEVELOPER', 'Golden Gate', 'Simulator Project'],
          ['SIZE', `${st.sizeMB} MB`, 'simulated'],
        ].map(([k, v, s], i) => (
          <div key={k} className={i ? 'hairline-l' : ''}>
            <div className="text-[10.5px] font-semibold muted">{k}</div>
            <div className="text-[17px] font-bold">{v}</div>
            <div className="text-[11px] muted">{s}</div>
          </div>
        ))}
      </div>
      <h2 className="text-[17px] font-bold mb-2">Preview</h2>
      <div className="flex gap-3 overflow-x-auto scroll pb-2 mb-6">
        {st.features.map((f, i) => (
          <div key={f} className="flex-none w-[280px] h-[170px] rounded-[14px] p-4 flex flex-col justify-between text-white relative overflow-hidden" style={{ background: `linear-gradient(${135 + i * 30}deg, hsl(${(i * 70 + id.length * 30) % 360} 70% 45%), hsl(${(i * 70 + id.length * 30 + 40) % 360} 80% 60%))` }}>
            <div className="text-[16px] font-bold max-w-[70%]">{f}</div>
            <div className="absolute right-3 bottom-3 opacity-90">
              <AppIcon id={id} size={64} />
            </div>
            <div className="text-[11px] opacity-85">{app.name}</div>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed max-w-[680px]">{st.description}</p>
      <h2 className="text-[17px] font-bold mt-6 mb-1">What’s New</h2>
      <div className="text-[12px] muted mb-1">Version {st.latestVersion ?? st.version}</div>
      <p className="text-[13px]">{st.whatsNew}</p>
      <h2 className="text-[17px] font-bold mt-6 mb-2">Ratings & Reviews</h2>
      {installed ? (
        <div className="card p-4 max-w-[560px] flex flex-col gap-2">
          <div className="flex items-center gap-3 text-[12.5px]">Tap to rate: <Stars value={stars} onChange={setStars} size={18} /></div>
          <input className="field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="field" rows={3} placeholder="Review (optional)" value={review} onChange={(e) => setReview(e.target.value)} />
          <div className="flex justify-between items-center">
            <span className="text-[11px] muted">Reviews are stored only in your browser.</span>
            <button className="btn primary" disabled={!stars} onClick={() => useApps.setState((s) => ({ ratings: { ...s.ratings, [id]: { stars, title, review, time: Date.now() } } }))}>{rating ? 'Update' : 'Submit'}</button>
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] muted">Install {app.name} to rate it. There are no ratings yet.</div>
      )}
      {rating && (
        <div className="card p-4 max-w-[560px] mt-3">
          <div className="flex justify-between"><span className="font-semibold">{rating.title || 'Your review'}</span><Stars value={rating.stars} /></div>
          {rating.review && <div className="text-[12.5px] mt-1">{rating.review}</div>}
          <div className="text-[11px] muted mt-1">You · {new Date(rating.time).toLocaleDateString()}</div>
        </div>
      )}
      <h2 className="text-[17px] font-bold mt-6 mb-2">Information</h2>
      <div className="grid grid-cols-3 gap-y-3 gap-x-6 text-[12.5px] max-w-[680px]">
        {[
          ['Provider', 'Golden Gate Simulator Project'],
          ['Size', `${st.sizeMB} MB (simulated)`],
          ['Category', app.category],
          ['Compatibility', 'Golden Gate 27 in any modern browser'],
          ['Version', installedVersion(id) ?? st.version],
          ['Installed', installed ? (lastInstall ? new Date(lastInstall.time).toLocaleDateString() : 'Built in') : 'No'],
          ['Languages', 'English'],
          ['Age Rating', '4+'],
          ['Copyright', '© Golden Gate Simulator'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="muted text-[11px]">{k}</div>
            <div>{v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11.5px] muted mt-6"><Info size={13} /> Installing enables this app inside the simulator. Nothing is downloaded to your computer.</div>
    </div>
  );
}

function Account({ apps, onOpen }: { apps: ReturnType<typeof useApps.getState>; onOpen: (id: string) => void }) {
  const user = useSettings((s) => s.user);
  return (
    <>
      <div className="flex items-center gap-4 mb-6 mt-2">
        <Avatar name={user.fullName} color={user.avatarColor} image={user.avatarImage} size={64} />
        <div>
          <div className="text-[22px] font-bold">{user.fullName}</div>
          <div className="text-[12px] muted">Local account · apps are enabled in this browser only</div>
        </div>
      </div>
      <h2 className="text-[17px] font-bold mb-2">Installed from the App Store</h2>
      {apps.installed.length === 0 ? <div className="text-[12.5px] muted mb-6">Nothing yet — find something on Discover.</div> : <Grid apps={apps.installed.map((id) => getApp(id)!).filter(Boolean)} onOpen={onOpen} />}
      <h2 className="text-[17px] font-bold mt-6 mb-2">History</h2>
      {apps.history.length === 0 && <div className="text-[12.5px] muted">No installs, updates or removals yet.</div>}
      {apps.history.slice(0, 40).map((h, i) => (
        <div key={i} className="flex items-center gap-3 py-2 hairline-b text-[12.5px]">
          <AppIcon id={h.appId} size={28} />
          <span className="flex-1">{getApp(h.appId)?.name ?? h.appId}</span>
          <span className="flex items-center gap-1 muted">{h.action === 'uninstall' ? <X size={12} /> : <Check size={12} />} {h.action === 'install' ? 'Installed' : h.action === 'update' ? `Updated to ${h.version}` : 'Deleted'}</span>
          <span className="muted w-[150px] text-right">{new Date(h.time).toLocaleString()}</span>
        </div>
      ))}
      <div className="mt-6 text-[11.5px] muted flex items-center gap-2"><User size={13} /> This is not an Apple Account. No payment or sign-in is ever requested.</div>
    </>
  );
}
