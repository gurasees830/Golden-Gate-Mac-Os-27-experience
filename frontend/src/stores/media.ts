import { create } from 'zustand';
import { fileUrl, useFs } from './fs';
import { useSettings } from './settings';

/**
 * Shared audio engine used by Music and Podcasts, and controlled from
 * Control Center. Playback always starts from a user gesture (autoplay rules).
 */
interface MediaState {
  queue: string[]; // fs node ids
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  rate: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  source: 'music' | 'podcasts' | null;
  error: string | null;
  playQueue: (ids: string[], index: number, source: 'music' | 'podcasts', startAt?: number) => Promise<void>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  setRate: (r: number) => void;
  stop: () => void;
  set: (p: Partial<MediaState>) => void;
}

let audio: HTMLAudioElement | null = null;
function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('timeupdate', () => useMedia.setState({ position: audio!.currentTime }));
    audio.addEventListener('durationchange', () => useMedia.setState({ duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 }));
    audio.addEventListener('play', () => useMedia.setState({ playing: true }));
    audio.addEventListener('pause', () => useMedia.setState({ playing: false }));
    audio.addEventListener('ended', () => {
      const s = useMedia.getState();
      if (s.repeat === 'one') {
        audio!.currentTime = 0;
        void audio!.play();
      } else s.next();
    });
    audio.addEventListener('error', () => useMedia.setState({ error: 'This audio file can’t be played by your browser.', playing: false }));
  }
  return audio;
}

function applyVolume() {
  const s = useSettings.getState().sound;
  const m = useMedia.getState();
  if (audio) audio.volume = s.muted ? 0 : Math.max(0, Math.min(1, m.volume * s.volume));
}
useSettings.subscribe(applyVolume);

export const useMedia = create<MediaState>()((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.9,
  rate: 1,
  shuffle: false,
  repeat: 'off',
  source: null,
  error: null,
  set: (p) => set(p),
  playQueue: async (ids, index, source, startAt) => {
    const a = el();
    const id = ids[index];
    if (!id) return;
    set({ queue: ids, index, source, error: null, position: 0 });
    const url = await fileUrl(id);
    if (!url) {
      set({ error: 'File not found.' });
      return;
    }
    a.src = url;
    a.playbackRate = get().rate;
    applyVolume();
    if (startAt) a.currentTime = startAt;
    try {
      await a.play();
    } catch {
      set({ playing: false });
    }
  },
  toggle: () => {
    const a = el();
    if (!a.src) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  },
  next: () => {
    const s = get();
    if (!s.queue.length) return;
    let i = s.shuffle ? Math.floor(Math.random() * s.queue.length) : s.index + 1;
    if (i >= s.queue.length) {
      if (s.repeat === 'all') i = 0;
      else {
        el().pause();
        set({ playing: false });
        return;
      }
    }
    void s.playQueue(s.queue, i, s.source ?? 'music');
  },
  prev: () => {
    const s = get();
    const a = el();
    if (a.currentTime > 3 || s.index === 0) {
      a.currentTime = 0;
      return;
    }
    void s.playQueue(s.queue, s.index - 1, s.source ?? 'music');
  },
  seek: (t) => {
    const a = el();
    a.currentTime = t;
    set({ position: t });
  },
  setVolume: (v) => {
    set({ volume: v });
    applyVolume();
  },
  setRate: (r) => {
    set({ rate: r });
    el().playbackRate = r;
  },
  stop: () => {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    set({ playing: false, queue: [], index: 0, position: 0, duration: 0, source: null });
  },
}));

export function currentTrackName(): string | null {
  const s = useMedia.getState();
  const id = s.queue[s.index];
  if (!id) return null;
  return useFs.getState().nodes[id]?.name.replace(/\.[^.]+$/, '') ?? null;
}
