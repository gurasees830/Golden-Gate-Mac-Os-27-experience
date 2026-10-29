/** Helpers for what Safari can and can't show inside the simulator. */

/** Google refuses to be shown inside other pages, so typed searches open Golden Gate's own results page. */
export const SEARCH_URL = (q: string) => `golden-gate://search?q=${encodeURIComponent(q)}`;
export const GOOGLE_URL = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/** The search text behind a Golden Gate search page or a saved Google search link. */
export function searchQuery(url: string): string | null {
  if (url.startsWith('golden-gate://search')) return new URLSearchParams(url.split('?')[1] ?? '').get('q') ?? '';
  return googleQuery(url);
}

/** Typing just a site's name (“youtube”, “wikipedia”) goes straight to the site, as in a real browser. */
const SITES: Record<string, string> = {
  youtube: 'https://www.youtube.com/',
  wikipedia: 'https://en.wikipedia.org/',
  google: 'https://www.google.com/',
  github: 'https://github.com/',
  mdn: 'https://developer.mozilla.org/',
  openstreetmap: 'https://www.openstreetmap.org/',
  reddit: 'https://www.reddit.com/',
  twitter: 'https://x.com/',
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  netflix: 'https://www.netflix.com/',
  amazon: 'https://www.amazon.com/',
  linkedin: 'https://www.linkedin.com/',
};
export function siteFromText(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (SITES[t]) return SITES[t];
  const yt = t.match(/^youtube\s+(.+)/);
  if (yt) return `https://www.youtube.com/results?search_query=${encodeURIComponent(text.trim().slice(7).trim())}`;
  return null;
}

export interface WikiResult {
  title: string;
  snippet: string;
  url: string;
}
export async function searchWikipedia(q: string): Promise<WikiResult[]> {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=10&format=json&origin=*`);
  if (!r.ok) throw new Error(`Wikipedia returned ${r.status}`);
  const j = (await r.json()) as { query?: { search: { title: string; snippet: string }[] } };
  const text = (html: string) => new DOMParser().parseFromString(html, 'text/html').documentElement.textContent ?? '';
  return (j.query?.search ?? []).map((x) => ({ title: x.title, snippet: text(x.snippet), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}` }));
}

/** Extract a YouTube video id from watch, share, shorts, live and embed URLs. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtu.be') return valid(u.pathname.slice(1));
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return valid(u.searchParams.get('v'));
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
const valid = (id: string | null) => (id && /^[\w-]{11}$/.test(id) ? id : null);

export function isYoutubeHome(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) && !youtubeId(url);
  } catch {
    return false;
  }
}

export function youtubeQuery(url: string): string {
  try {
    return new URL(url).searchParams.get('search_query') ?? '';
  } catch {
    return '';
  }
}

export function googleQuery(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/search') return u.searchParams.get('q');
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Sites known to forbid being shown inside other pages (X-Frame-Options /
 * CSP frame-ancestors). Golden Gate respects that and offers a new tab instead.
 */
const BLOCKS_FRAMING = [
  /(^|\.)github\.com$/, /(^|\.)facebook\.com$/, /(^|\.)instagram\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)linkedin\.com$/,
  /(^|\.)reddit\.com$/, /(^|\.)amazon\.[a-z.]+$/, /(^|\.)netflix\.com$/, /(^|\.)apple\.com$/, /(^|\.)microsoft\.com$/, /(^|\.)live\.com$/,
  /(^|\.)stackoverflow\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)bing\.com$/, /(^|\.)chatgpt\.com$/, /(^|\.)openai\.com$/, /(^|\.)claude\.ai$/,
  /(^|\.)anthropic\.com$/, /^mail\.google\.com$/, /^accounts\.google\.com$/, /^docs\.google\.com$/, /^drive\.google\.com$/, /(^|\.)whatsapp\.com$/,
  /(^|\.)spotify\.com$/, /(^|\.)twitch\.tv$/, /(^|\.)tiktok\.com$/, /(^|\.)paypal\.com$/, /(^|\.)developer\.mozilla\.org$/, /(^|\.)youtube\.com$/,
  /(^|\.)discord\.com$/, /(^|\.)slack\.com$/, /(^|\.)notion\.so$/, /(^|\.)figma\.com$/, /(^|\.)ebay\.[a-z.]+$/, /(^|\.)pinterest\.com$/,
];

export function knownToBlockFraming(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    if (/(^|\.)google\.[a-z.]+$/.test(h) && !h.startsWith('maps.')) return true;
    return BLOCKS_FRAMING.some((r) => r.test(h));
  } catch {
    return true;
  }
}

/** Creative Commons open movies from the Blender Foundation, on YouTube. */
export const FEATURED_VIDEOS = [
  { id: 'YE7VzlLtp-4', title: 'Big Buck Bunny', channel: 'Blender Foundation', hue: 95 },
  { id: 'eRsGyueVLvQ', title: 'Sintel', channel: 'Blender Foundation', hue: 18 },
  { id: 'R6MlUcmOul8', title: 'Tears of Steel', channel: 'Blender Foundation', hue: 205 },
  { id: '4eJVGqJhp40', title: 'Elephants Dream', channel: 'Blender Foundation', hue: 280 },
];

const KEY_STORE = 'gg.youtubeKey';
const ENV_KEY = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) || '';
/** The YouTube Data API key: one pasted into Safari wins over a build-time VITE_YOUTUBE_API_KEY. */
export function getYtKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) || ENV_KEY;
  } catch {
    return ENV_KEY;
  }
}
export function setYtKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked */
  }
}

export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

/** YouTube search needs a YouTube Data API key (VITE_YOUTUBE_API_KEY). */
export async function searchYoutube(q: string): Promise<VideoResult[]> {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=24&safeSearch=moderate&q=${encodeURIComponent(q)}&key=${encodeURIComponent(getYtKey())}`);
  if (!r.ok) {
    const why = ((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(why ? `${why}` : `YouTube API error ${r.status}`);
  }
  const j = (await r.json()) as { items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } } }[] };
  const decode = (s: string) => new DOMParser().parseFromString(s, 'text/html').documentElement.textContent ?? s;
  return j.items.map((i) => ({ id: i.id.videoId, title: decode(i.snippet.title), channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails.medium?.url ?? '' }));
}
