export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1000) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? digits : 0)} ${units[i]}`;
}

export function pad(n: number, l = 2) {
  return String(n).padStart(l, '0');
}

export function relativeDay(d: Date, now: Date): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function finderDate(ts: number, locale?: string, use24h = false): string {
  const d = new Date(ts);
  const now = new Date();
  const t = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: !use24h });
  const rel = relativeDay(d, now);
  if (rel === 'Today' || rel === 'Yesterday') return `${rel} at ${t}`;
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} at ${t}`;
}

export function kindOf(mime: string, name = ''): string {
  if (mime === 'folder') return 'Folder';
  const ext = name.split('.').pop()?.toLowerCase();
  if (mime.startsWith('image/')) return `${(ext || 'image').toUpperCase()} image`;
  if (mime.startsWith('audio/')) return `${(ext || 'audio').toUpperCase()} audio`;
  if (mime.startsWith('video/')) return `${(ext || 'video').toUpperCase()} movie`;
  if (mime === 'application/pdf') return 'PDF document';
  if (mime === 'application/zip') return 'ZIP archive';
  if (mime === 'text/markdown') return 'Markdown document';
  if (mime === 'text/html') return 'HTML document';
  if (mime.includes('javascript')) return 'JavaScript source';
  if (mime === 'application/json') return 'JSON document';
  if (mime.startsWith('text/')) return 'Plain text document';
  return 'Document';
}

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', html: 'text/html', htm: 'text/html', css: 'text/css',
    js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript', tsx: 'text/typescript', jsx: 'text/javascript', json: 'application/json',
    java: 'text/x-java', py: 'text/x-python', c: 'text/x-c', cpp: 'text/x-c', sh: 'text/x-sh', csv: 'text/csv', xml: 'text/xml', yml: 'text/yaml', yaml: 'text/yaml', sql: 'text/x-sql', log: 'text/plain', rtf: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', avif: 'image/avif',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', webm: 'video/webm',
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', m4v: 'video/mp4',
    pdf: 'application/pdf', zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export function isTextMime(mime: string) {
  return mime.startsWith('text/') || mime === 'application/json' || mime.includes('javascript') || mime.includes('typescript');
}

export function plural(n: number, word: string, pluralWord?: string) {
  return `${n} ${n === 1 ? word : pluralWord ?? word + 's'}`;
}

export function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}
