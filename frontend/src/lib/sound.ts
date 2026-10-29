import { useSettings } from '../stores/settings';

/**
 * All system sounds are synthesized with Web Audio (no recorded assets).
 * Volume follows Sound settings; audio only starts after a user gesture.
 */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function masterVolume(kind: 'alert' | 'ui' | 'output' = 'output') {
  const s = useSettings.getState().sound;
  if (s.muted) return 0;
  return s.volume * (kind === 'alert' ? s.alertVolume : 1);
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', c = ac()) {
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export const ALERT_SOUNDS: Record<string, (v: number) => void> = {
  Chime: (v) => {
    tone(1318.5, 0, 0.6, 0.18 * v);
    tone(1975.5, 0.09, 0.7, 0.12 * v);
  },
  Pop: (v) => {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(900, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(260, c.currentTime + 0.09);
    g.gain.setValueAtTime(0.35 * v, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.15);
  },
  Ripple: (v) => {
    [880, 1108, 1320, 1760].forEach((f, i) => tone(f, i * 0.06, 0.35, 0.1 * v, 'triangle'));
  },
  Pebble: (v) => {
    tone(2093, 0, 0.12, 0.2 * v, 'sine');
    tone(2637, 0.07, 0.14, 0.12 * v, 'sine');
  },
  Breeze: (v) => {
    tone(523.25, 0, 0.9, 0.08 * v, 'sine');
    tone(783.99, 0.05, 0.9, 0.07 * v, 'sine');
    tone(1046.5, 0.1, 0.9, 0.05 * v, 'sine');
  },
  Spark: (v) => {
    tone(1760, 0, 0.08, 0.15 * v, 'square');
    tone(2349, 0.06, 0.12, 0.1 * v, 'square');
  },
};

export function playAlert(name?: string) {
  const s = useSettings.getState().sound;
  const v = masterVolume('alert');
  if (v <= 0) return;
  (ALERT_SOUNDS[name ?? s.alertSound] ?? ALERT_SOUNDS.Chime)(v);
}

export function playUi(kind: 'trash' | 'volume' | 'screenshot' | 'error' | 'click') {
  const s = useSettings.getState().sound;
  if (!s.uiSounds && kind !== 'volume') return;
  const v = masterVolume('ui');
  if (v <= 0) return;
  const c = ac();
  if (!c) return;
  if (kind === 'trash') {
    // crumpled-paper noise burst
    const len = 0.35;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * (Math.random() < 0.3 ? 1 : 0.3);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    const g = c.createGain();
    g.gain.value = 0.5 * v;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  } else if (kind === 'screenshot') {
    const len = 0.18;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / c.sampleRate;
      d[i] = (Math.random() * 2 - 1) * (t < 0.02 || (t > 0.08 && t < 0.1) ? 1 : 0.05);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.4 * v;
    src.connect(g).connect(c.destination);
    src.start();
  } else if (kind === 'volume') {
    tone(1500, 0, 0.07, 0.25 * v, 'sine');
  } else if (kind === 'error') {
    tone(330, 0, 0.18, 0.2 * v, 'triangle');
    tone(262, 0.12, 0.25, 0.2 * v, 'triangle');
  } else {
    tone(2400, 0, 0.02, 0.05 * v, 'square');
  }
}

/** Original startup chord (not a recreation of any existing chime). */
export function playStartup() {
  const s = useSettings.getState().sound;
  if (!s.startupSound) return;
  const v = masterVolume();
  if (v <= 0) return;
  const c = ac();
  if (!c) return;
  [174.61, 261.63, 349.23, 440, 523.25, 698.46].forEach((f, i) => {
    tone(f, i * 0.012, 2.6, 0.06 * v, i % 2 ? 'triangle' : 'sine', c);
  });
}

export function audioContext() {
  return ac();
}
