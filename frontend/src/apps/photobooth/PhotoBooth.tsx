import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { useFs, PICTURES, fileUrl } from '../../stores/fs';
import { requestMedia, stopStream } from '../../lib/mediaAccess';
import { playUi } from '../../lib/sound';
import { EmptyState } from '../../components/ui';
import { openFile } from '../../shell/actions';

const EFFECTS = [
  { id: 'normal', label: 'Normal', css: 'none' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(1)' },
  { id: 'bw', label: 'Black & White', css: 'grayscale(1) contrast(1.2)' },
  { id: 'glow', label: 'Glow', css: 'brightness(1.2) saturate(1.4) blur(.4px)' },
  { id: 'comic', label: 'Comic', css: 'contrast(1.8) saturate(2)' },
  { id: 'thermal', label: 'Thermal', css: 'invert(1) hue-rotate(180deg) saturate(3)' },
  { id: 'xray', label: 'X-Ray', css: 'grayscale(1) invert(1) contrast(1.3)' },
  { id: 'pop', label: 'Pop Art', css: 'saturate(3) hue-rotate(40deg)' },
  { id: 'faded', label: 'Faded', css: 'contrast(.8) brightness(1.15) saturate(.7)' },
];

async function boothFolder() {
  const fs = useFs.getState();
  const ex = Object.values(fs.nodes).find((n) => n.parentId === PICTURES && n.name === 'Photo Booth Library' && !n.trashed);
  return ex ? ex.id : (await fs.createFolder(PICTURES, 'Photo Booth Library')).id;
}

export default function PhotoBooth(_: AppProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [effect, setEffect] = useState('normal');
  const [grid, setGrid] = useState(false);
  const [flash, setFlash] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const nodes = useFs((s) => s.nodes);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const folder = Object.values(nodes).find((n) => n.parentId === PICTURES && n.name === 'Photo Booth Library' && !n.trashed)?.id;
  const shots = Object.values(nodes).filter((n) => n.parentId === folder && !n.trashed).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);

  const start = async () => {
    setErr(null);
    const r = await requestMedia('photobooth', ['camera']);
    if ('error' in r) setErr(r.error);
    else setStream(r.stream);
  };
  useEffect(() => {
    void start();
  }, []);
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream, grid]);
  useEffect(() => () => stopStream(stream), [stream]);
  useEffect(() => {
    shots.forEach((s) => {
      if (!thumbs[s.id]) void fileUrl(s.id).then((u) => u && setThumbs((t) => ({ ...t, [s.id]: u })));
    });
  }, [shots, thumbs]);

  const snap = async () => {
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    setCount(null);
    const v = video.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    g.filter = EFFECTS.find((e) => e.id === effect)?.css ?? 'none';
    g.translate(c.width, 0);
    g.scale(-1, 1);
    g.drawImage(v, 0, 0);
    setFlash(true);
    playUi('screenshot');
    setTimeout(() => setFlash(false), 250);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
    const id = await boothFolder();
    await useFs.getState().createFile(id, `Photo on ${new Date().toLocaleString().replace(/[/:]/g, '-')}.jpg`, blob, 'image/jpeg');
  };

  const css = EFFECTS.find((e) => e.id === effect)?.css;
  return (
    <div className="flex flex-col h-full" style={{ background: '#1c1c1e', color: '#fff' }}>
      <TitleBar title="Photo Booth" style={{ background: '#2a2a2d' }} className="photobooth-tb" />
      <div className="flex-1 min-h-0 relative grid place-items-center bg-black">
        {err ? (
          <EmptyState icon={<Camera size={40} />} title="Camera Unavailable" subtitle={err} action={<button className="btn" onClick={() => void start()}>Try Again</button>} />
        ) : grid ? (
          <div className="grid grid-cols-3 gap-1 w-full h-full p-1">
            {EFFECTS.map((e) => (
              <button key={e.id} className="relative border-0 p-0 overflow-hidden bg-black" onClick={() => { setEffect(e.id); setGrid(false); }}>
                <video autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)', filter: e.css }} ref={(el) => { if (el && stream && el.srcObject !== stream) el.srcObject = stream; }} />
                <span className="absolute bottom-1 inset-x-0 text-center text-[11px] font-semibold" style={{ textShadow: '0 1px 2px #000' }}>{e.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <video ref={video} autoPlay playsInline muted className="max-w-full max-h-full" style={{ transform: 'scaleX(-1)', filter: css }} />
        )}
        {count && <div className="absolute inset-0 grid place-items-center text-[120px] font-bold" style={{ textShadow: '0 4px 20px rgba(0,0,0,.6)' }}>{count}</div>}
        {flash && <div className="absolute inset-0 bg-white" />}
      </div>
      <div className="h-[64px] flex items-center justify-center gap-6 px-4" style={{ background: '#2a2a2d' }}>
        <button className="btn" onClick={() => setGrid(!grid)}>{grid ? 'Back' : 'Effects'}</button>
        <button className="w-[48px] h-[48px] rounded-full border-0 grid place-items-center" style={{ background: '#ff3b30' }} aria-label="Take photo" disabled={!stream || !!count} onClick={() => void snap()}><Camera size={20} color="#fff" /></button>
        <span className="text-[12px] opacity-70 w-[90px]">{EFFECTS.find((e) => e.id === effect)?.label}</span>
      </div>
      {shots.length > 0 && (
        <div className="h-[70px] flex gap-1 px-2 py-1 overflow-x-auto" style={{ background: '#151517' }}>
          {shots.map((s) => thumbs[s.id] && <img key={s.id} src={thumbs[s.id]} alt={s.name} className="h-full rounded-[4px] cursor-default" onDoubleClick={() => openFile(s.id)} />)}
        </div>
      )}
      <style>{`.photobooth-tb .titlebar-title{color:#ddd}`}</style>
    </div>
  );
}
