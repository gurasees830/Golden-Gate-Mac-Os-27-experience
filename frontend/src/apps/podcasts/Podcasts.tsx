import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Play, Pause, RotateCcw, RotateCw, Upload, Podcast, Trash2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useFs, MUSIC, importHostFiles } from '../../stores/fs';
import { useMedia } from '../../stores/media';
import { EmptyState } from '../../components/ui';
import { moveToTrash } from '../../shell/actions';

const useProgress = create<{ pos: Record<string, number>; dur: Record<string, number>; set: (p: Partial<{ pos: Record<string, number>; dur: Record<string, number> }>) => void }>()(persist((set) => ({ pos: {}, dur: {}, set: (p) => set(p) }), idb('app.podcasts')));
registerHydration(useProgress);

async function podcastFolder(): Promise<string> {
  const fs = useFs.getState();
  const ex = Object.values(fs.nodes).find((n) => n.parentId === MUSIC && n.name === 'Podcasts' && !n.trashed);
  return ex ? ex.id : (await fs.createFolder(MUSIC, 'Podcasts')).id;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Podcasts(_: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const media = useMedia();
  const prog = useProgress();
  const folderId = useMemo(() => Object.values(nodes).find((n) => n.parentId === MUSIC && n.name === 'Podcasts' && !n.trashed)?.id, [nodes]);
  const episodes = useMemo(() => Object.values(nodes).filter((n) => n.parentId === folderId && !n.trashed && n.mime.startsWith('audio/')).sort((a, b) => b.createdAt - a.createdAt), [nodes, folderId]);

  // remember the playback position
  useEffect(() => {
    if (media.source !== 'podcasts') return;
    const id = media.queue[media.index];
    if (!id) return;
    const t = setTimeout(() => prog.set({ pos: { ...useProgress.getState().pos, [id]: media.position }, dur: { ...useProgress.getState().dur, [id]: media.duration } }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(media.position / 5), media.source]);

  const doImport = async () => {
    const id = await podcastFolder();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = () => input.files && void importHostFiles(input.files, id);
    input.click();
  };
  const current = media.source === 'podcasts' ? media.queue[media.index] : null;
  const play = (i: number) => {
    const id = episodes[i].id;
    if (current === id) return media.toggle();
    const at = prog.pos[id] && prog.dur[id] && prog.pos[id] < prog.dur[id] - 5 ? prog.pos[id] : 0;
    void media.playQueue(episodes.map((e) => e.id), i, 'podcasts', at);
  };

  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar className="chrome hairline-b" showTitle={false}>
        <div className="font-bold text-[14px] ml-2">Podcasts</div>
        <div className="flex-1" />
        {current && (
          <div className="flex items-center gap-2" data-no-drag>
            <button className="tb-btn" aria-label="Back 15 seconds" onClick={() => media.seek(Math.max(0, media.position - 15))}><RotateCcw size={15} /></button>
            <button className="tb-btn" aria-label={media.playing ? 'Pause' : 'Play'} onClick={media.toggle}>{media.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button className="tb-btn" aria-label="Forward 30 seconds" onClick={() => media.seek(Math.min(media.duration, media.position + 30))}><RotateCw size={15} /></button>
            <select className="popup" value={media.rate} onChange={(e) => media.setRate(Number(e.target.value))} aria-label="Playback speed">
              {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
            <span className="text-[11.5px] tabular-nums muted w-[90px]">{fmt(media.position)} / {fmt(media.duration)}</span>
          </div>
        )}
        <button className="btn" data-no-drag onClick={() => void doImport()}><Upload size={13} /> Add Episodes…</button>
      </TitleBar>
      <div className="flex-1 scroll px-6 py-4">
        <h1 className="text-[26px] font-bold mb-3">Library</h1>
        {episodes.length === 0 ? (
          <EmptyState icon={<Podcast size={44} />} title="No Episodes" subtitle="Add podcast episode audio files from your computer. Golden Gate remembers where you stopped listening." action={<button className="btn" onClick={() => void doImport()}>Add Episodes…</button>} />
        ) : (
          episodes.map((e, i) => {
            const pos = prog.pos[e.id] ?? 0;
            const dur = prog.dur[e.id] ?? 0;
            const pct = dur ? Math.min(1, pos / dur) : 0;
            return (
              <div key={e.id} className="flex items-center gap-4 py-3 hairline-b">
                <div className="w-[56px] h-[56px] rounded-[10px] grid place-items-center flex-none" style={{ background: `linear-gradient(135deg, hsl(${(e.name.length * 37) % 360} 70% 55%), hsl(${(e.name.length * 37 + 60) % 360} 70% 40%))` }}>
                  <Podcast size={24} color="#fff" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] muted">{new Date(e.createdAt).toLocaleDateString()}</div>
                  <div className="font-semibold truncate">{e.name.replace(/\.[^.]+$/, '')}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {pct > 0 && <div className="w-[100px] h-[3px] rounded-full bg-[var(--field)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${pct * 100}%` }} /></div>}
                    <span className="text-[11px] muted">{dur ? (pct >= 0.98 ? 'Played' : `${fmt(Math.max(0, dur - pos))} left`) : ''}</span>
                  </div>
                </div>
                <button className="btn pill" onClick={() => play(i)}>{current === e.id && media.playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}{current === e.id && media.playing ? 'Pause' : pos > 0 ? 'Resume' : 'Play'}</button>
                <button className="tb-btn" aria-label="Delete episode" onClick={() => void moveToTrash([e.id])}><Trash2 size={14} /></button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
