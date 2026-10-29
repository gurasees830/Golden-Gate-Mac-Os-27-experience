import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Play, Search } from 'lucide-react';
import { FEATURED_VIDEOS, getYtKey, searchYoutube, setYtKey, type VideoResult } from './web';

const RED = '#ff0033';

function Thumb({ id, hue, src }: { id: string; hue?: number; src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative w-full aspect-video rounded-[12px] overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${hue ?? 220} 55% 35%), hsl(${(hue ?? 220) + 40} 60% 18%))` }}>
      {!failed && <img src={src || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} />}
      <div className="absolute inset-0 grid place-items-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
        <span className="w-[54px] h-[38px] rounded-[12px] grid place-items-center" style={{ background: RED }}><Play size={18} fill="#fff" color="#fff" /></span>
      </div>
    </div>
  );
}

/** Hosts that can serve the embedded player; the second is the fallback if the first refuses to play. */
const PLAYER_HOSTS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];

/** A watch page that plays the video through YouTube's official embedded player. */
export function YouTubeWatch({ id, url, onGo }: { id: string; url: string; onGo: (u: string) => void }) {
  const [host, setHost] = useState(0);
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setHost(0);
    setFailed(false);
  }, [id]);
  // With enablejsapi the player reports errors (e.g. 101/150: the owner disabled embedding; 153: no referrer).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data) as { event?: string; info?: number };
        if (m.event === 'onError') {
          if (host < PLAYER_HOSTS.length - 1 && m.info === 153) setHost(host + 1);
          else setFailed(true);
        }
      } catch {
        /* not a player message */
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [host]);
  const origin = encodeURIComponent(window.location.origin === 'null' ? '' : window.location.origin);
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
  return (
    <div className="h-full scroll" style={{ background: '#0f0f0f', color: '#f1f1f1' }}>
      <YtHeader onGo={onGo} />
      <div className="max-w-[1100px] mx-auto px-6 pb-10">
        <div className="w-full aspect-video rounded-[14px] overflow-hidden bg-black relative">
          <iframe
            key={`${id}-${host}`}
            ref={frame}
            title="YouTube video player"
            src={`${PLAYER_HOSTS[host]}/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${origin ? `&origin=${origin}` : ''}`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={listen}
          />
          {failed && (
            <div className="absolute inset-0 grid place-items-center text-center p-6" style={{ background: '#181818' }}>
              <div>
                <div className="text-[16px] font-semibold mb-1">This video can’t be played here</div>
                <div className="text-[13px] opacity-70 mb-4">Its owner only allows it to be watched on YouTube.</div>
                <a className="btn no-underline !text-white" style={{ background: RED }} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Watch on YouTube</a>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-4 gap-4">
          <div className="text-[13px] opacity-70">Playing with YouTube’s embedded player. Click outside the video to use Safari’s keyboard shortcuts again.</div>
          <a className="btn flex-none no-underline !text-white" style={{ background: '#272727' }} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open on YouTube</a>
        </div>
        <h3 className="text-[16px] font-semibold mt-8 mb-3">Up next</h3>
        <VideoGrid items={FEATURED_VIDEOS.filter((v) => v.id !== id).map((v) => ({ ...v, thumb: '' }))} onGo={onGo} hues={Object.fromEntries(FEATURED_VIDEOS.map((v) => [v.id, v.hue]))} />
      </div>
    </div>
  );
}

function YtHeader({ onGo, initial = '' }: { onGo: (u: string) => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  return (
    <div className="flex items-center gap-4 px-6 h-[60px] sticky top-0 z-10" style={{ background: '#0f0f0f' }}>
      <button className="flex items-center gap-1 border-0 bg-transparent p-0 text-white" onClick={() => onGo('https://www.youtube.com/')} aria-label="YouTube home">
        <span className="w-[30px] h-[21px] rounded-[6px] grid place-items-center" style={{ background: RED }}><Play size={11} fill="#fff" color="#fff" /></span>
        <span className="font-bold tracking-tight text-[17px]">YouTube</span>
      </button>
      <form
        className="flex-1 max-w-[560px] mx-auto flex"
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim();
          if (!t) return;
          const id = t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
          onGo(id ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}`);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search YouTube or paste a link" placeholder="Search, or paste a YouTube link" className="flex-1 h-[38px] rounded-l-full px-4 text-[14px] text-white outline-none" style={{ background: '#121212', border: '1px solid #303030' }} />
        <button type="submit" aria-label="Search" className="w-[60px] h-[38px] rounded-r-full grid place-items-center text-white border-0" style={{ background: '#222', border: '1px solid #303030', borderLeft: 0 }}><Search size={17} /></button>
      </form>
      <div className="w-[120px]" />
    </div>
  );
}

function VideoGrid({ items, onGo, hues = {} }: { items: VideoResult[]; onGo: (u: string) => void; hues?: Record<string, number> }) {
  return (
    <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {items.map((v) => (
        <button key={v.id} className="text-left border-0 bg-transparent p-0 text-inherit" onClick={() => onGo(`https://www.youtube.com/watch?v=${v.id}`)}>
          <Thumb id={v.id} src={v.thumb} hue={hues[v.id]} />
          <div className="mt-2 text-[14px] font-medium leading-snug line-clamp-2">{v.title}</div>
          <div className="text-[12.5px] opacity-60 mt-[2px]">{v.channel}</div>
        </button>
      ))}
    </div>
  );
}

/** Shown when no API key is set: explains how to get one and lets the user paste it. */
function KeyNotice({ query, onSaved }: { query: string; onSaved: () => void }) {
  const [key, setKey] = useState('');
  return (
    <div className="rounded-[12px] p-4 mb-6 text-[13px] leading-relaxed" style={{ background: '#1f1f1f' }}>
      <div className="font-semibold mb-1">Searching YouTube here needs a free YouTube Data API key</div>
      <ol className="list-decimal pl-5 mb-3 opacity-90">
        <li>Open <a className="underline text-white" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> and create a project.</li>
        <li>Enable <a className="underline text-white" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer">YouTube Data API v3</a> for it.</li>
        <li>Go to <a className="underline text-white" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Credentials</a> ▸ Create credentials ▸ API key, and copy it.</li>
        <li>Optional but wise: restrict the key to “YouTube Data API v3” and to this site’s address.</li>
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setYtKey(key);
          onSaved();
        }}
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} aria-label="YouTube Data API key" placeholder="Paste your API key" spellCheck={false} autoComplete="off" className="flex-1 h-[34px] rounded-[8px] px-3 text-[13px] text-white outline-none" style={{ background: '#121212', border: '1px solid #303030' }} />
        <button type="submit" disabled={!key.trim()} className="btn !text-white" style={{ background: RED }}>Save</button>
      </form>
      <div className="mt-2 opacity-60 text-[12px]">The key is stored only in this browser. Without one you can still paste a video link above, or{' '}
        <a className="underline text-white" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query || 'youtube')}`} target="_blank" rel="noopener noreferrer">search on YouTube in a new tab</a>.
      </div>
    </div>
  );
}

/** YouTube home / results. Real search needs a YouTube Data API key. */
export function YouTubeHome({ query, onGo }: { query: string; onGo: (u: string) => void }) {
  const [results, setResults] = useState<VideoResult[] | null>(null);
  const [error, setError] = useState('');
  const [key, setKey] = useState(getYtKey);
  useEffect(() => {
    setResults(null);
    setError('');
    if (!query || !key) return;
    let live = true;
    searchYoutube(query)
      .then((r) => live && setResults(r))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query, key]);
  return (
    <div className="h-full scroll" style={{ background: '#0f0f0f', color: '#f1f1f1' }}>
      <YtHeader onGo={onGo} initial={query} />
      <div className="max-w-[1180px] mx-auto px-6 pb-10 pt-2">
        {((!key && query) || error) && (
          <>
            {error && (
              <div className="rounded-[12px] p-4 mb-4 text-[13px]" style={{ background: '#3a1d1d' }}>
                Couldn’t search YouTube: {error}
                <button className="ml-3 underline border-0 bg-transparent text-white p-0" onClick={() => { setYtKey(''); setKey(''); }}>Change API key</button>
              </div>
            )}
            {!key && query && <KeyNotice query={query} onSaved={() => setKey(getYtKey())} />}
          </>
        )}
        {query && key && !results && !error && <div className="opacity-60 text-[13px] mb-6">Searching…</div>}
        {results ? (
          <VideoGrid items={results} onGo={onGo} />
        ) : (
          <>
            <h3 className="text-[18px] font-bold mb-4">Open movies from the Blender Foundation</h3>
            <VideoGrid items={FEATURED_VIDEOS.map((v) => ({ ...v, thumb: '' }))} onGo={onGo} hues={Object.fromEntries(FEATURED_VIDEOS.map((v) => [v.id, v.hue]))} />
          </>
        )}
      </div>
    </div>
  );
}
