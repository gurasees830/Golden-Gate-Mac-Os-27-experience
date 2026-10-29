/**
 * Generates short original demo tracks with Web Audio so Music has something
 * to play without shipping any recorded audio.
 */
function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2;
  const ab = new ArrayBuffer(44 + len);
  const v = new DataView(ab);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + len, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, len, true);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < buf.length; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  return new Blob([ab], { type: 'audio/wav' });
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export async function renderDemoTrack(kind: 'golden-hour' | 'fog-city'): Promise<Blob> {
  const sr = 22050;
  const secs = 36;
  const ctx = new OfflineAudioContext(2, sr * secs, sr);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  // simple feedback delay for space
  const delay = ctx.createDelay();
  delay.delayTime.value = kind === 'golden-hour' ? 0.375 : 0.5;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  delay.connect(fb).connect(delay);
  delay.connect(master);
  master.connect(ctx.destination);

  const bpm = kind === 'golden-hour' ? 84 : 72;
  const beat = 60 / bpm;
  const chords = kind === 'golden-hour' ? [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]] : [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 57]];
  const bars = Math.floor(secs / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % chords.length];
    const t0 = b * beat * 4;
    // pad
    for (const n of chord) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(n);
      o.detune.value = (Math.random() - 0.5) * 12;
      f.type = 'lowpass';
      f.frequency.value = 900;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.035, t0 + 0.8);
      g.gain.linearRampToValueAtTime(0.025, t0 + beat * 4 - 0.1);
      g.gain.linearRampToValueAtTime(0, t0 + beat * 4 + 0.3);
      o.connect(f).connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + beat * 4 + 0.4);
    }
    // bass
    const bo = ctx.createOscillator();
    const bg = ctx.createGain();
    bo.type = 'sine';
    bo.frequency.value = NOTE(chord[0] - 12);
    bg.gain.setValueAtTime(0.0, t0);
    bg.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.02, t0 + beat * 3.8);
    bo.connect(bg).connect(master);
    bo.start(t0);
    bo.stop(t0 + beat * 4);
    // arpeggio
    if (b >= 1) {
      for (let s = 0; s < 8; s++) {
        const t = t0 + s * (beat / 2);
        const n = chord[(s * (kind === 'golden-hour' ? 3 : 2)) % chord.length] + 12;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = NOTE(n);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.45);
        o.connect(g);
        g.connect(master);
        g.connect(delay);
        o.start(t);
        o.stop(t + beat * 0.5);
      }
    }
    // soft kick + hat
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      if (b >= 2) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.22);
      }
      if (b >= 3) {
        const len = Math.floor(sr * 0.04);
        const nb = ctx.createBuffer(1, len, sr);
        const d = nb.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = nb;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const g = ctx.createGain();
        g.gain.value = 0.06;
        src.connect(hp).connect(g).connect(master);
        src.start(t + beat / 2);
      }
    }
  }
  master.gain.setValueAtTime(0.5, secs - 3);
  master.gain.linearRampToValueAtTime(0, secs);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}
