import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Phone, Sparkles, FlipHorizontal } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useContacts, contactName } from '../../stores/data';
import { useSettings } from '../../stores/settings';
import { Avatar } from '../../components/ui';
import { requestMedia, stopStream } from '../../lib/mediaAccess';
import { audioContext } from '../../lib/sound';

const useRecents = create<{ calls: { name: string; contactId?: string; time: number; video: boolean; outcome: string }[]; set: (p: { calls: { name: string; contactId?: string; time: number; video: boolean; outcome: string }[] }) => void }>()(persist((set) => ({ calls: [], set: (p) => set(p) }), idb('app.facetime')));
registerHydration(useRecents);

const FILTERS = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'warm', label: 'Warm', css: 'sepia(.25) saturate(1.2) brightness(1.05)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.6) contrast(1.05)' },
  { id: 'studio', label: 'Studio Light', css: 'brightness(1.15) contrast(1.1)' },
];

function ring(stop: { v: boolean }) {
  const ctx = audioContext();
  if (!ctx) return;
  const vol = useSettings.getState().sound;
  const v = vol.muted ? 0 : vol.volume * 0.12;
  let t = ctx.currentTime;
  for (let i = 0; i < 4 && !stop.v; i++) {
    [659, 784].forEach((f, j) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + j * 0.15);
      g.gain.linearRampToValueAtTime(v, t + j * 0.15 + 0.02);
      g.gain.linearRampToValueAtTime(0, t + j * 0.15 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t + j * 0.15);
      o.stop(t + j * 0.15 + 0.7);
    });
    t += 2;
  }
}

export default function FaceTime({ win }: AppProps) {
  const contacts = useContacts((s) => s.contacts).filter((c) => !c.isMe);
  const recents = useRecents();
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [filter, setFilter] = useState('none');
  const [call, setCall] = useState<{ name: string; contactId?: string; state: 'ringing' | 'ended'; video: boolean; started: number } | null>(null);
  const [to, setTo] = useState('');

  const start = async () => {
    setErr(null);
    const r = await requestMedia('facetime', ['camera']);
    if ('error' in r) setErr(r.error);
    else setStream(r.stream);
  };
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream, camOn]);
  useEffect(() => () => stopStream(stream), [stream]);

  useEffect(() => {
    const cid = win.args?.contactId as string | undefined;
    if (cid) {
      const c = useContacts.getState().contacts.find((x) => x.id === cid);
      if (c) placeCall(contactName(c), c.id, !win.args?.audio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  const stopRing = useRef({ v: false });
  const placeCall = (name: string, contactId?: string, isVideo = true) => {
    stopRing.current = { v: false };
    setCall({ name, contactId, state: 'ringing', video: isVideo, started: Date.now() });
    ring(stopRing.current);
    setTimeout(() => {
      setCall((c) => (c && c.state === 'ringing' ? { ...c, state: 'ended' } : c));
      stopRing.current.v = true;
    }, 8000);
    recents.set({ calls: [{ name, contactId, time: Date.now(), video: isVideo, outcome: 'No answer (simulated)' }, ...useRecents.getState().calls].slice(0, 30) });
  };
  const endCall = () => {
    stopRing.current.v = true;
    setCall(null);
  };

  const css = FILTERS.find((f) => f.id === filter)?.css;
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[250px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 flex flex-col gap-2">
          <input className="field" placeholder="Enter a name" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && to.trim() && placeCall(to.trim())} list="ft-contacts" />
          <datalist id="ft-contacts">{contacts.map((c) => <option key={c.id} value={contactName(c)} />)}</datalist>
          <div className="flex gap-2">
            <button className="btn primary flex-1" disabled={!to.trim()} onClick={() => placeCall(to.trim())}><Video size={13} /> FaceTime</button>
            <button className="btn" disabled={!to.trim()} aria-label="Audio call" onClick={() => placeCall(to.trim(), undefined, false)}><Phone size={13} /></button>
          </div>
        </div>
        <div className="sb-heading px-4">Recent</div>
        <div className="scroll flex-1 px-2">
          {recents.calls.length === 0 && <div className="text-[12px] muted px-2">No recent calls</div>}
          {recents.calls.map((c, i) => (
            <div key={i} className="sb-item !h-[44px]" onClick={() => placeCall(c.name, c.contactId, c.video)}>
              <Avatar name={c.name} size={28} color="#8e8e93" />
              <div className="min-w-0">
                <div className="truncate text-[13px]">{c.name}</div>
                <div className="text-[11px] muted truncate">{c.video ? 'FaceTime Video' : 'FaceTime Audio'} · {new Date(c.time).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 relative bg-black overflow-hidden">
        {stream && camOn ? (
          <video ref={video} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: mirror ? 'scaleX(-1)' : undefined, filter: css }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/80">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <VideoOff size={40} />
              <div className="text-[14px] font-semibold">{stream ? 'Camera Off' : 'Camera preview'}</div>
              {err ? <div className="text-[12px] text-white/60 max-w-[360px]">{err}</div> : !stream && <div className="text-[12px] text-white/60 max-w-[340px]">Turn on your camera to see yourself. The video never leaves this browser.</div>}
              {!stream && <button className="btn" onClick={() => void start()}>Turn On Camera</button>}
            </div>
          </div>
        )}
        <div className="absolute top-0 inset-x-0 h-[52px]"><TitleBar showTitle={false} lights={false} className="!h-[52px]" /></div>
        {call && (
          <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(14px)' }}>
            <div className="flex flex-col items-center gap-3 text-white text-center">
              <Avatar name={call.name} size={96} color="#5e5ce6" />
              <div className="text-[22px] font-semibold">{call.name}</div>
              <div className="text-[13px] opacity-80">{call.state === 'ringing' ? `FaceTime ${call.video ? 'Video' : 'Audio'}… ringing` : 'No Answer'}</div>
              {call.state === 'ended' && <div className="text-[12px] opacity-70 max-w-[360px]">FaceTime in Golden Gate is a local simulation, so it can’t reach other people. Your camera preview and controls work for real.</div>}
              <div className="flex gap-4 mt-3">
                {call.state === 'ended' && <button className="w-[52px] h-[52px] rounded-full border-0 grid place-items-center bg-[#34c759] text-white" aria-label="Call again" onClick={() => placeCall(call.name, call.contactId, call.video)}><Video size={20} /></button>}
                <button className="w-[52px] h-[52px] rounded-full border-0 grid place-items-center bg-[#ff3b30] text-white" aria-label="End call" onClick={endCall}><PhoneOff size={20} /></button>
              </div>
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-3 py-2" style={{ background: 'rgba(30,30,30,.65)', backdropFilter: 'blur(20px)' }}>
          <button className="w-[38px] h-[38px] rounded-full border-0 grid place-items-center text-white" style={{ background: micOn ? 'rgba(255,255,255,.15)' : '#fff', color: micOn ? '#fff' : '#000' }} aria-label={micOn ? 'Mute' : 'Unmute'} onClick={() => setMicOn(!micOn)}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}</button>
          <button className="w-[38px] h-[38px] rounded-full border-0 grid place-items-center" style={{ background: camOn ? 'rgba(255,255,255,.15)' : '#fff', color: camOn ? '#fff' : '#000' }} aria-label={camOn ? 'Camera off' : 'Camera on'} onClick={() => (stream ? setCamOn(!camOn) : void start())}>{camOn ? <Video size={16} /> : <VideoOff size={16} />}</button>
          <button className="w-[38px] h-[38px] rounded-full border-0 grid place-items-center text-white" style={{ background: 'rgba(255,255,255,.15)' }} aria-label="Mirror" onClick={() => setMirror(!mirror)}><FlipHorizontal size={16} /></button>
          <select className="popup !h-[30px] !rounded-full" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Video effect">
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <Sparkles size={14} className="text-white/60" />
        </div>
      </div>
    </div>
  );
}
