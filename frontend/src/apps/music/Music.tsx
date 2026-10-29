import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, Clock, ListMusic, Music2, Plus, Upload, Sparkles } from 'lucide-react';
import type { AppProps, FsNode } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { idb, registerHydration, uid } from '../../lib/persist';
import { useFs, MUSIC, fileUrl, importHostFiles } from '../../stores/fs';
import { useMedia } from '../../stores/media';
import { SearchField, EmptyState, Slider } from '../../components/ui';
import { promptDialog, useSystem } from '../../stores/system';
import { renderDemoTrack } from '../../lib/demoAudio';
import { moveToTrash, openApp } from '../../shell/actions';
import { pt } from '../../lib/screen';
import { useWindows } from '../../stores/windows';

interface MusicMeta {
  playlists: { id: string; name: string; items: string[] }[];
  durations: Record<string, number>;
  plays: Record<string, number>;
  demoGenerated: boolean;
  set: (p: Partial<MusicMeta>) => void;
}
export const useMusicMeta = create<MusicMeta>()(persist((set) => ({ playlists: [], durations: {}, plays: {}, demoGenerated: false, set: (p) => set(p) }), idb<MusicMeta>('app.music')));
registerHydration(useMusicMeta);

export function parseTrack(n: FsNode) {
  const base = n.name.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: 'Unknown Artist', title: base };
}
let demoBusy = false;
const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

function useDuration(id: string) {
  const d = useMusicMeta((s) => s.durations[id]);
  useEffect(() => {
    if (d) return;
    let alive = true;
    void fileUrl(id).then((u) => {
      if (!u || !alive) return;
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration)) useMusicMeta.getState().set({ durations: { ...useMusicMeta.getState().durations, [id]: a.duration } });
      };
      a.src = u;
    });
    return () => {
      alive = false;
    };
  }, [id, d]);
  return d;
}

function Row({ n, i, active, playing, onPlay, onContext }: { n: FsNode; i: number; active: boolean; playing: boolean; onPlay: () => void; onContext: (e: React.MouseEvent) => void }) {
  const d = useDuration(n.id);
  const t = parseTrack(n);
  return (
    <div className={`list-row ${i % 2 ? 'alt' : ''} gap-3`} style={{ height: 30, color: active ? 'var(--accent)' : undefined }} onDoubleClick={onPlay} onContextMenu={onContext}>
      <span className="w-[22px] text-center text-[11px] opacity-60">{active && playing ? <Volume2 size={12} className="inline" /> : i + 1}</span>
      <span className="flex-1 truncate font-medium">{t.title}</span>
      <span className="w-[200px] truncate opacity-70">{t.artist}</span>
      <span className="w-[60px] text-right tabular-nums opacity-70">{d ? fmt(d) : '–:––'}</span>
    </div>
  );
}

export default function Music({ win }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const meta = useMusicMeta();
  const media = useMedia();
  const [view, setView] = useState('songs');
  const [q, setQ] = useState('');
  const [generating, setGenerating] = useState(false);

  const songs = useMemo(() => Object.values(nodes).filter((n) => n.kind === 'file' && n.mime.startsWith('audio/') && !n.trashed && nodes[n.parentId ?? '']?.name !== 'Podcasts').sort((a, b) => parseTrack(a).title.localeCompare(parseTrack(b).title)), [nodes]);
  const playlist = meta.playlists.find((p) => p.id === view);
  const list = useMemo(() => {
    let l = view === 'recent' ? [...songs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25) : playlist ? playlist.items.map((id) => nodes[id]).filter((n) => n && !n.trashed) : songs;
    if (q) l = l.filter((n) => n.name.toLowerCase().includes(q.toLowerCase()));
    return l;
  }, [view, songs, playlist, q, nodes]);

  // generate the two demo tracks on first launch
  useEffect(() => {
    if (meta.demoGenerated || demoBusy) return;
    demoBusy = true;
    setGenerating(true);
    void (async () => {
      try {
        const folder = await useFs.getState().createFolder(MUSIC, 'Golden Gate Demos');
        const a = await renderDemoTrack('golden-hour');
        await useFs.getState().createFile(folder.id, 'Golden Gate Ensemble - Golden Hour.wav', a, 'audio/wav');
        const b = await renderDemoTrack('fog-city');
        await useFs.getState().createFile(folder.id, 'Golden Gate Ensemble - Fog City.wav', b, 'audio/wav');
        useMusicMeta.getState().set({ demoGenerated: true });
      } catch {
        useMusicMeta.getState().set({ demoGenerated: true });
      } finally {
        demoBusy = false;
        setGenerating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.demoGenerated]);

  // play a file passed in by Finder
  useEffect(() => {
    const fid = win.args?.fileId as string | undefined;
    if (fid && nodes[fid]) void media.playQueue([fid], 0, 'music');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce, win.args?.fileId]);

  // stop playback when the last Music window closes
  useEffect(() => () => {
    if (!useWindows.getState().windows.some((w) => w.appId === 'music' && w.id !== win.id) && useMedia.getState().source === 'music') useMedia.getState().stop();
  }, [win.id]);

  const play = (i: number) => {
    void media.playQueue(list.map((n) => n.id), i, 'music');
    const id = list[i].id;
    meta.set({ plays: { ...meta.plays, [id]: (meta.plays[id] ?? 0) + 1 } });
  };
  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = () => input.files && void importHostFiles(input.files, MUSIC).then((f) => useSystem.getState().showToast(`Added ${f.length} song${f.length === 1 ? '' : 's'}.`));
    input.click();
  };
  const newPlaylist = async (withId?: string) => {
    const name = await promptDialog('New Playlist', 'Playlist name:', 'Untitled Playlist');
    if (!name) return;
    const p = { id: uid('pl'), name, items: withId ? [withId] : [] };
    meta.set({ playlists: [...meta.playlists, p] });
    setView(p.id);
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New Playlist', shortcut: 'mod+n', action: () => void newPlaylist() }, { label: 'Import…', shortcut: 'mod+o', action: doImport }] },
      { title: 'Controls', items: [{ label: media.playing ? 'Pause' : 'Play', shortcut: 'space', action: media.toggle }, { label: 'Next', shortcut: 'mod+arrowright', action: media.next }, { label: 'Previous', shortcut: 'mod+arrowleft', action: media.prev }, { separator: true }, { label: 'Shuffle', checked: media.shuffle, action: () => media.set({ shuffle: !media.shuffle }) }, { label: 'Repeat', submenu: (['off', 'all', 'one'] as const).map((r) => ({ label: r === 'off' ? 'Off' : r === 'all' ? 'All' : 'One', checked: media.repeat === r, action: () => media.set({ repeat: r }) })) }] },
    ],
    [media.playing, media.shuffle, media.repeat, view],
  );

  const current = media.source === 'music' ? nodes[media.queue[media.index]] : undefined;
  const ct = current ? parseTrack(current) : null;
  const ctx = (e: React.MouseEvent, n: FsNode) => {
    const p = pt(e);
    useSystem.getState().openContextMenu({ clientX: p.x, clientY: p.y }, [
      { label: 'Play', action: () => play(list.findIndex((x) => x.id === n.id)) },
      { label: 'Add to Playlist', submenu: [...meta.playlists.map((pl) => ({ label: pl.name, action: () => meta.set({ playlists: meta.playlists.map((x) => (x.id === pl.id ? { ...x, items: [...x.items, n.id] } : x)) }) })), { separator: true }, { label: 'New Playlist…', action: () => void newPlaylist(n.id) }] },
      ...(playlist ? [{ label: 'Remove from Playlist', action: () => meta.set({ playlists: meta.playlists.map((x) => (x.id === playlist.id ? { ...x, items: x.items.filter((i) => i !== n.id) } : x)) }) }] : []),
      { separator: true },
      { label: 'Show in Finder', action: () => openApp('finder', { folderId: n.parentId }, { forceNew: true }) },
      { label: 'Delete from Library', action: () => void moveToTrash([n.id]) },
    ]);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[210px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2"><SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search music" /></div>
        <div className="scroll flex-1 px-[10px]">
          <div className="sb-heading">Library</div>
          {[
            { id: 'recent', label: 'Recently Added', icon: <Clock size={15} /> },
            { id: 'songs', label: 'Songs', icon: <Music2 size={15} /> },
          ].map((s) => (
            <div key={s.id} className={`sb-item ${view === s.id ? 'active' : ''}`} onClick={() => setView(s.id)}>
              <span className="sb-ico" style={{ color: '#fa2d48' }}>{s.icon}</span>{s.label}
            </div>
          ))}
          <div className="sb-heading flex justify-between items-center">Playlists <button className="border-0 bg-transparent p-0 opacity-70" aria-label="New playlist" onClick={() => void newPlaylist()}><Plus size={13} /></button></div>
          {meta.playlists.map((p) => (
            <div key={p.id} className={`sb-item ${view === p.id ? 'active' : ''}`} onClick={() => setView(p.id)} onContextMenu={(e) => { const c = pt(e); useSystem.getState().openContextMenu({ clientX: c.x, clientY: c.y }, [{ label: 'Delete Playlist', action: () => { meta.set({ playlists: meta.playlists.filter((x) => x.id !== p.id) }); setView('songs'); } }]); }}>
              <span className="sb-ico" style={{ color: '#fa2d48' }}><ListMusic size={15} /></span><span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
        <button className="btn ghost m-2 !justify-start" onClick={doImport}><Upload size={13} /> Import Music…</button>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="chrome hairline-b !gap-3" style={{ paddingLeft: 14 }}>
          <div className="flex items-center gap-1" data-no-drag>
            <button className={`tb-btn ${media.shuffle ? 'active' : ''}`} aria-label="Shuffle" onClick={() => media.set({ shuffle: !media.shuffle })}><Shuffle size={14} style={{ color: media.shuffle ? 'var(--accent)' : undefined }} /></button>
            <button className="tb-btn" aria-label="Previous" onClick={media.prev}><SkipBack size={17} fill="currentColor" /></button>
            <button className="tb-btn" aria-label={media.playing ? 'Pause' : 'Play'} onClick={() => (media.queue.length && media.source === 'music' ? media.toggle() : list.length && play(0))}>{media.playing && media.source === 'music' ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button>
            <button className="tb-btn" aria-label="Next" onClick={media.next}><SkipForward size={17} fill="currentColor" /></button>
            <button className="tb-btn" aria-label="Repeat" onClick={() => media.set({ repeat: media.repeat === 'off' ? 'all' : media.repeat === 'all' ? 'one' : 'off' })}>{media.repeat === 'one' ? <Repeat1 size={14} style={{ color: 'var(--accent)' }} /> : <Repeat size={14} style={{ color: media.repeat === 'all' ? 'var(--accent)' : undefined }} />}</button>
          </div>
          <div className="flex-1 min-w-0 h-[40px] rounded-[8px] flex items-center gap-3 px-2" data-no-drag style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 .5px var(--separator)' }}>
            <div className="w-[30px] h-[30px] rounded-[5px] grid place-items-center flex-none" style={{ background: 'linear-gradient(135deg,#ff6f88,#f7213d)' }}><Music2 size={15} color="#fff" /></div>
            <div className="flex-1 min-w-0 text-center">
              {ct ? (
                <>
                  <div className="text-[12px] font-semibold truncate">{ct.title}</div>
                  <div className="flex items-center gap-2 text-[10px] tabular-nums opacity-70">
                    <span>{fmt(media.position)}</span>
                    <input type="range" aria-label="Seek" className="slider flex-1 !h-[3px]" min={0} max={media.duration || 1} step={0.1} value={media.position} style={{ ['--pct' as string]: `${(media.position / (media.duration || 1)) * 100}%` }} onChange={(e) => media.seek(Number(e.target.value))} />
                    <span>-{fmt(Math.max(0, media.duration - media.position))}</span>
                  </div>
                </>
              ) : (
                <div className="text-[12px] muted">{generating ? 'Creating demo tracks…' : 'Not Playing'}</div>
              )}
            </div>
          </div>
          <div className="w-[100px] flex items-center gap-1" data-no-drag><Volume2 size={13} className="opacity-60" /><Slider value={media.volume} onChange={media.setVolume} ariaLabel="Music volume" /></div>
        </TitleBar>
        {media.error && <div className="px-4 py-2 text-[12px] text-[#ff3b30] hairline-b">{media.error}</div>}
        <div className="px-5 pt-4 pb-2 text-[24px] font-bold">{playlist?.name ?? (view === 'recent' ? 'Recently Added' : 'Songs')}</div>
        <div className="flex px-3 text-[11px] muted font-medium hairline-b pb-1 gap-3">
          <span className="w-[22px]" /><span className="flex-1">Title</span><span className="w-[200px]">Artist</span><span className="w-[60px] text-right">Time</span>
        </div>
        <div className="flex-1 scroll px-[6px] py-1">
          {list.length === 0 && (generating ? <div className="flex flex-col items-center gap-2 mt-16 muted"><Sparkles size={28} /><div>Composing two demo tracks in your browser…</div></div> : <EmptyState icon={<Music2 size={40} />} title="No Songs" subtitle="Import audio files from your computer, or drag them into the Music folder." action={<button className="btn" onClick={doImport}>Import Music…</button>} />)}
          {list.map((n, i) => (
            <Row key={n.id} n={n} i={i} active={current?.id === n.id} playing={media.playing} onPlay={() => play(i)} onContext={(e) => ctx(e, n)} />
          ))}
        </div>
        <div className="h-[22px] hairline-t text-[11px] muted flex items-center justify-center">{list.length} songs · playback uses your browser’s audio</div>
      </div>
    </div>
  );
}
