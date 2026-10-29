import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Play, Upload, Film, X } from 'lucide-react';
import type { AppProps, FsNode } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useFs, MOVIES, importHostFiles, fileUrl } from '../../stores/fs';
import { EmptyState } from '../../components/ui';
import { useSettings } from '../../stores/settings';

const useTv = create<{ pos: Record<string, number>; dur: Record<string, number>; thumbs: Record<string, string>; set: (p: Partial<{ pos: Record<string, number>; dur: Record<string, number>; thumbs: Record<string, string> }>) => void }>()(
  persist((set) => ({ pos: {}, dur: {}, thumbs: {}, set: (p) => set(p) }), idb('app.tv')),
);
registerHydration(useTv);

function Poster({ n, onPlay }: { n: FsNode; onPlay: () => void }) {
  const tv = useTv();
  useEffect(() => {
    if (tv.thumbs[n.id]) return;
    let alive = true;
    void fileUrl(n.id).then((u) => {
      if (!u) return;
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.src = u;
      v.onloadeddata = () => {
        v.currentTime = Math.min(2, (v.duration || 4) / 3);
      };
      v.onseeked = () => {
        if (!alive) return;
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = Math.round((320 * v.videoHeight) / (v.videoWidth || 1)) || 180;
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        try {
          useTv.getState().set({ thumbs: { ...useTv.getState().thumbs, [n.id]: c.toDataURL('image/jpeg', 0.7) }, dur: { ...useTv.getState().dur, [n.id]: v.duration } });
        } catch {
          /* tainted */
        }
      };
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id]);
  const pct = tv.dur[n.id] ? (tv.pos[n.id] ?? 0) / tv.dur[n.id] : 0;
  return (
    <button className="border-0 bg-transparent p-0 text-left group" onClick={onPlay}>
      <div className="aspect-video rounded-[10px] overflow-hidden relative grid place-items-center" style={{ background: tv.thumbs[n.id] ? `center/cover url(${tv.thumbs[n.id]})` : 'linear-gradient(135deg,#2c2c34,#111)', boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}>
        {!tv.thumbs[n.id] && <Film size={30} className="text-white/40" />}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 grid place-items-center transition"><Play size={34} fill="#fff" color="#fff" className="opacity-0 group-hover:opacity-100" /></div>
        {pct > 0.01 && <div className="absolute left-2 right-2 bottom-2 h-[4px] rounded-full bg-white/30"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>}
      </div>
      <div className="text-[13px] font-medium mt-2 truncate">{n.name.replace(/\.[^.]+$/, '')}</div>
    </button>
  );
}

export default function TV({ win }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const tv = useTv();
  const [playing, setPlaying] = useState<string | null>((win.args?.fileId as string) ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const videos = useMemo(() => Object.values(nodes).filter((n) => n.kind === 'file' && n.mime.startsWith('video/') && !n.trashed).sort((a, b) => b.createdAt - a.createdAt), [nodes]);
  const cont = videos.filter((v) => tv.pos[v.id] && tv.dur[v.id] && tv.pos[v.id] < tv.dur[v.id] - 10);
  const vol = useSettings((s) => (s.sound.muted ? 0 : s.sound.volume));
  useEffect(() => {
    if (win.args?.fileId) setPlaying(win.args.fileId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);
  useEffect(() => {
    setUrl(null);
    if (playing) void fileUrl(playing).then(setUrl);
  }, [playing]);
  useEffect(() => {
    if (vid.current) vid.current.volume = vol;
  }, [vol, url]);
  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = true;
    input.onchange = () => input.files && void importHostFiles(input.files, MOVIES);
    input.click();
  };
  return (
    <div className="flex flex-col h-full relative" style={{ background: '#111', color: '#fff' }}>
      <TitleBar showTitle={false} className="!gap-3" style={{ background: '#1a1a1d' }}>
        <div className="font-bold text-[14px] ml-2">TV</div>
        <div className="flex-1" />
        <button className="btn" data-no-drag onClick={doImport}><Upload size={13} /> Import Videos…</button>
      </TitleBar>
      <div className="flex-1 scroll px-8 py-5">
        {videos.length === 0 ? (
          <EmptyState icon={<Film size={44} />} title="Your Library Is Empty" subtitle="Import your own video files. They stay in this browser." action={<button className="btn" onClick={doImport}>Import Videos…</button>} />
        ) : (
          <>
            {cont.length > 0 && (
              <>
                <h2 className="text-[20px] font-bold mb-3">Continue Watching</h2>
                <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>{cont.map((v) => <Poster key={v.id} n={v} onPlay={() => setPlaying(v.id)} />)}</div>
              </>
            )}
            <h2 className="text-[20px] font-bold mb-3">Library</h2>
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>{videos.map((v) => <Poster key={v.id} n={v} onPlay={() => setPlaying(v.id)} />)}</div>
          </>
        )}
      </div>
      {playing && (
        <div className="absolute inset-0 z-20 bg-black flex flex-col">
          <div className="h-[44px] flex items-center px-3 gap-2">
            <button className="tb-btn" style={{ color: '#fff' }} aria-label="Close player" onClick={() => setPlaying(null)}><X size={16} /></button>
            <span className="text-[13px] truncate">{nodes[playing]?.name}</span>
          </div>
          {url ? (
            <video
              ref={vid}
              src={url}
              controls
              autoPlay
              className="flex-1 min-h-0 w-full"
              onLoadedMetadata={(e) => {
                const p = tv.pos[playing];
                if (p && p < e.currentTarget.duration - 5) e.currentTarget.currentTime = p;
              }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (Math.floor(t) % 5 === 0) useTv.getState().set({ pos: { ...useTv.getState().pos, [playing]: t }, dur: { ...useTv.getState().dur, [playing]: e.currentTarget.duration } });
              }}
            />
          ) : (
            <div className="flex-1 grid place-items-center"><div className="spinner" /></div>
          )}
        </div>
      )}
    </div>
  );
}
