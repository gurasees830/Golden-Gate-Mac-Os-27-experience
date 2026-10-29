import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { useFs, DOCUMENTS, fileUrl } from '../../stores/fs';
import { EmptyState } from '../../components/ui';
import { requestMedia, stopStream } from '../../lib/mediaAccess';
import { moveToTrash } from '../../shell/actions';
import { promptDialog } from '../../stores/system';

async function memosFolder() {
  const fs = useFs.getState();
  const ex = Object.values(fs.nodes).find((n) => n.parentId === DOCUMENTS && n.name === 'Voice Memos' && !n.trashed);
  return ex ? ex.id : (await fs.createFolder(DOCUMENTS, 'Voice Memos')).id;
}

export default function VoiceMemos(_: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<{ started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const folder = useMemo(() => Object.values(nodes).find((n) => n.parentId === DOCUMENTS && n.name === 'Voice Memos' && !n.trashed)?.id, [nodes]);
  const memos = useMemo(() => Object.values(nodes).filter((n) => n.parentId === folder && !n.trashed && n.mime.startsWith('audio/')).sort((a, b) => b.createdAt - a.createdAt), [nodes, folder]);

  useEffect(() => () => stopStream(stream.current), []);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setElapsed(Date.now() - rec.started), 100);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => {
    setUrl(null);
    setPlaying(false);
    if (sel) void fileUrl(sel).then(setUrl);
  }, [sel]);

  const start = async () => {
    setErr(null);
    const r = await requestMedia('voicememos', ['microphone']);
    if ('error' in r) return setErr(r.error);
    stream.current = r.stream;
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(r.stream);
    recorder.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stopStream(stream.current);
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      const id = await memosFolder();
      const d = new Date();
      const ext = (mr.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm';
      const n = await useFs.getState().createFile(id, `New Recording ${d.toLocaleDateString('en-CA')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}.${ext}`, blob, blob.type);
      setSel(n.id);
    };
    mr.start(250);
    setRec({ started: Date.now() });
    // live waveform
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(r.stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const draw = () => {
        if (!recorder.current || recorder.current.state !== 'recording') {
          void ctx.close();
          return;
        }
        an.getByteTimeDomainData(data);
        const c = canvas.current;
        if (c) {
          const g = c.getContext('2d')!;
          g.clearRect(0, 0, c.width, c.height);
          g.strokeStyle = '#ff375f';
          g.lineWidth = 2;
          g.beginPath();
          for (let i = 0; i < data.length; i += 4) {
            const x = (i / data.length) * c.width;
            const y = (data[i] / 255) * c.height;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    } catch {
      /* waveform optional */
    }
  };
  const stop = () => {
    recorder.current?.stop();
    setRec(null);
    setElapsed(0);
  };
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[280px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-4 text-[20px] font-bold">All Recordings</div>
        <div className="scroll flex-1 px-2 mt-2">
          {memos.length === 0 && <div className="text-[12px] muted px-2">No recordings yet.</div>}
          {memos.map((m) => (
            <div key={m.id} className={`p-2 rounded-[8px] mb-1 ${sel === m.id ? 'bg-[var(--press)]' : ''}`} onClick={() => setSel(m.id)} onDoubleClick={async () => { const n = await promptDialog('Rename Recording', 'Name:', m.name.replace(/\.[^.]+$/, '')); if (n) void useFs.getState().rename(m.id, `${n}.${m.name.split('.').pop()}`); }}>
              <div className="font-semibold text-[13px] truncate">{m.name.replace(/\.[^.]+$/, '')}</div>
              <div className="text-[11px] muted">{new Date(m.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="p-4 flex justify-center hairline-t">
          <button className="w-[54px] h-[54px] rounded-full border-0 grid place-items-center" style={{ boxShadow: '0 0 0 3px var(--text-3)', background: 'transparent' }} aria-label={rec ? 'Stop recording' : 'Record'} onClick={() => (rec ? stop() : void start())}>
            {rec ? <Square size={20} fill="#ff3b30" color="#ff3b30" /> : <span className="w-[40px] h-[40px] rounded-full bg-[#ff3b30]" />}
          </button>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} />
        {rec ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Mic size={28} className="text-[#ff3b30]" />
            <div className="text-[44px] font-light tabular-nums">{fmt(elapsed)}</div>
            <canvas ref={canvas} width={520} height={120} className="w-[90%] max-w-[520px] h-[120px]" />
            <button className="btn" onClick={stop}>Stop</button>
          </div>
        ) : err ? (
          <EmptyState icon={<Mic size={40} />} title="Microphone Unavailable" subtitle={err} action={<button className="btn" onClick={() => void start()}>Try Again</button>} />
        ) : sel && nodes[sel] ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
            <div className="text-[20px] font-bold text-center">{nodes[sel].name.replace(/\.[^.]+$/, '')}</div>
            <div className="text-[12px] muted">{new Date(nodes[sel].createdAt).toLocaleString()}</div>
            {url && <audio ref={audio} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} controls className="w-full max-w-[460px]" />}
            <div className="flex gap-3">
              <button className="btn" onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}>{playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}</button>
              <button className="btn" onClick={() => { void moveToTrash([sel]); setSel(null); }}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Mic size={40} />} title="Tap the red button to record" subtitle="Recordings are saved in Documents ▸ Voice Memos." />
        )}
      </div>
    </div>
  );
}
