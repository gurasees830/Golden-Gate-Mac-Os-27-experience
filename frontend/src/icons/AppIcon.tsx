import { webApp } from '../apps/webapps/catalog';
import { useId, type ReactNode } from 'react';
import { useClock } from '../lib/clock';

/**
 * Original app icon set drawn as SVG (no Apple artwork). Every icon shares the
 * same continuous-corner "squircle" body, gradient lighting and glass sheen so
 * the set feels consistent in the Dock, Launchpad and Finder.
 */

function squircle(x0: number, y0: number, size: number, n = 5, steps = 120) {
  const r = size / 2;
  const cx = x0 + r;
  const cy = y0 + r;
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
}

export const SQUIRCLE = squircle(6, 6, 88);

function gear(cx: number, cy: number, ro: number, ri: number, teeth: number) {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [a - step * 0.22, ri],
      [a - step * 0.14, ro],
      [a + step * 0.14, ro],
      [a + step * 0.22, ri],
      [a + step * 0.5, ri],
    ];
    for (const [ang, r] of pts) {
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      d += `${d ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  }
  return d + 'Z';
}
const GEAR = gear(50, 50, 35, 28, 12);
const GEAR_INNER = gear(50, 50, 19, 15, 8);

type Def = { bg?: [string, string]; light?: boolean; draw: (u: (s: string) => string) => ReactNode; noBody?: boolean };

function CalendarGlyph() {
  const now = useClock(60000);
  const wd = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return (
    <>
      <rect x="0" y="0" width="100" height="31" fill="#ff3b30" />
      <text x="50" y="25" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Inter Variable, system-ui, sans-serif" letterSpacing="0.5">
        {wd}
      </text>
      <text x="50" y="78" textAnchor="middle" fontSize="44" fontWeight="500" fill="#1d1d1f" fontFamily="Inter Variable, system-ui, sans-serif" letterSpacing="-2">
        {now.getDate()}
      </text>
    </>
  );
}

function ClockGlyph() {
  const now = useClock(1000);
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ha = (h + m / 60) * 30;
  const ma = (m + s / 60) * 6;
  const sa = s * 6;
  return (
    <>
      <circle cx="50" cy="50" r="36" fill="#fff" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="17" x2="50" y2={i % 3 === 0 ? 23 : 21} stroke="#1c1c1e" strokeWidth={i % 3 === 0 ? 2.2 : 1.2} transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <line x1="50" y1="50" x2="50" y2="31" stroke="#1c1c1e" strokeWidth="3.6" strokeLinecap="round" transform={`rotate(${ha} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="22" stroke="#1c1c1e" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${ma} 50 50)`} />
      <line x1="50" y1="56" x2="50" y2="20" stroke="#ff9500" strokeWidth="1.2" transform={`rotate(${sa} 50 50)`} />
      <circle cx="50" cy="50" r="2.4" fill="#ff9500" />
    </>
  );
}

const ICONS: Record<string, Def> = {
  finder: {
    bg: ['#74d6ff', '#1a73ee'],
    draw: () => (
      <>
        <path d="M24 33h17l5 6h28a4 4 0 0 1 4 4v28a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V37a4 4 0 0 1 2-4z" fill="#fff" opacity=".72" />
        <path d="M22 45h56v26a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5z" fill="#fff" />
        <circle cx="58" cy="58" r="7.5" fill="none" stroke="#1a73ee" strokeWidth="3.4" />
        <path d="M63.5 63.5l6 6" stroke="#1a73ee" strokeWidth="3.6" strokeLinecap="round" />
      </>
    ),
  },
  launchpad: {
    bg: ['#fbfbfd', '#d5d6dc'],
    light: true,
    draw: () => {
      const c = ['#ff5f57', '#ffbd2e', '#28c840', '#0a84ff', '#bf5af2', '#ff9f0a', '#30b0c7', '#ff375f', '#5e5ce6'];
      return c.map((fill, i) => <rect key={i} x={24 + (i % 3) * 18} y={24 + Math.floor(i / 3) * 18} width="14" height="14" rx="4.2" fill={fill} />);
    },
  },
  safari: {
    bg: ['#ffffff', '#dfe9f5'],
    light: true,
    draw: (u) => (
      <>
        <defs>
          <linearGradient id={u('g')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4cb5ff" />
            <stop offset="1" stopColor="#0a5ed8" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="33" fill={`url(#${u('g')})`} />
        <g fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="1.4">
          <ellipse cx="50" cy="50" rx="13" ry="33" />
          <ellipse cx="50" cy="50" rx="25" ry="33" />
          <path d="M18 40h64M17 50h66M18 60h64" />
        </g>
        <path d="M70 30L53.5 53.5 46.5 46.5z" fill="#ff3b30" />
        <path d="M30 70l16.5-23.5 7 7z" fill="#fff" />
      </>
    ),
  },
  messages: {
    bg: ['#72f585', '#0fb33a'],
    draw: () => (
      <>
        <ellipse cx="50" cy="47" rx="29" ry="23" fill="#fff" />
        <path d="M31 58c-1 8-5 13-10 15 10 1 17-3 21-8z" fill="#fff" />
      </>
    ),
  },
  mail: {
    bg: ['#6cd2ff', '#1670ef'],
    draw: () => (
      <>
        <rect x="21" y="31" width="58" height="40" rx="6" fill="#fff" />
        <path d="M23 34l27 20 27-20" fill="none" stroke="#1670ef" strokeOpacity=".45" strokeWidth="3" strokeLinejoin="round" />
      </>
    ),
  },
  maps: {
    bg: ['#d8efb8', '#a9d98a'],
    light: true,
    draw: () => (
      <>
        <path d="M0 0h42c-6 18-22 26-42 30z" fill="#7cc4f5" />
        <path d="M0 74C28 62 50 80 100 42" stroke="#fff" strokeWidth="10" fill="none" />
        <path d="M0 74C28 62 50 80 100 42" stroke="#ffcf3f" strokeWidth="6" fill="none" />
        <path d="M44 0c4 28-10 58 8 100" stroke="#fff" strokeWidth="6" fill="none" />
        <path d="M60 22a14 14 0 0 1 14 14c0 11-14 25-14 25S46 47 46 36a14 14 0 0 1 14-14z" fill="#ff3b30" stroke="#fff" strokeWidth="2" />
        <circle cx="60" cy="36" r="5" fill="#fff" />
      </>
    ),
  },
  photos: {
    bg: ['#86d2ff', '#ffe2b8'],
    draw: () => (
      <>
        <circle cx="67" cy="34" r="9" fill="#fff6c2" />
        <path d="M0 80l32-34 18 18 13-13 37 34v15H0z" fill="#5aa36b" />
        <path d="M0 100V84l28-20 30 36z" fill="#3c8853" />
      </>
    ),
  },
  facetime: {
    bg: ['#70f282', '#16b839'],
    draw: () => (
      <>
        <rect x="21" y="35" width="40" height="30" rx="8" fill="#fff" />
        <path d="M63 46l15-9v26l-15-9z" fill="#fff" />
      </>
    ),
  },
  calendar: { bg: ['#ffffff', '#f2f2f2'], light: true, draw: () => <CalendarGlyph /> },
  contacts: {
    bg: ['#d0bca3', '#8c775f'],
    draw: () => (
      <>
        <rect x="78" y="22" width="8" height="12" rx="2" fill="#ff9f0a" />
        <rect x="78" y="38" width="8" height="12" rx="2" fill="#34c759" />
        <rect x="78" y="54" width="8" height="12" rx="2" fill="#0a84ff" />
        <circle cx="46" cy="40" r="12" fill="#f7f1e8" />
        <path d="M22 76c2-15 12-22 24-22s22 7 24 22z" fill="#f7f1e8" />
      </>
    ),
  },
  reminders: {
    bg: ['#ffffff', '#f0f0f3'],
    light: true,
    draw: () => (
      <>
        {[
          ['#0a84ff', 32],
          ['#ff3b30', 50],
          ['#ff9f0a', 68],
        ].map(([c, y]) => (
          <g key={String(y)}>
            <circle cx="28" cy={Number(y)} r="6.5" fill={String(c)} />
            <circle cx="28" cy={Number(y)} r="3.6" fill="#fff" />
            <rect x="40" y={Number(y) - 2.5} width="36" height="5" rx="2.5" fill="#d1d1d6" />
          </g>
        ))}
      </>
    ),
  },
  notes: {
    bg: ['#fffdf7', '#f4f0e4'],
    light: true,
    draw: (u) => (
      <>
        <defs>
          <linearGradient id={u('n')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffdf5e" />
            <stop offset="1" stopColor="#ffc400" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="30" fill={`url(#${u('n')})`} />
        {[44, 56, 68, 80].map((y) => (
          <rect key={y} x="18" y={y} width="64" height="1.6" fill="#e2ddcf" />
        ))}
      </>
    ),
  },
  music: {
    bg: ['#ff6f88', '#f7213d'],
    draw: () => (
      <>
        <path d="M42 30l30-7v7l-30 7z" fill="#fff" />
        <rect x="68" y="23" width="4.5" height="40" fill="#fff" />
        <rect x="42" y="30" width="4.5" height="40" fill="#fff" />
        <ellipse cx="62" cy="64" rx="9" ry="7" fill="#fff" transform="rotate(-20 62 64)" />
        <ellipse cx="36" cy="71" rx="9" ry="7" fill="#fff" transform="rotate(-20 36 71)" />
      </>
    ),
  },
  podcasts: {
    bg: ['#d98bff', '#8b2fe0'],
    draw: () => (
      <>
        <circle cx="50" cy="43" r="8" fill="#fff" />
        <path d="M37 58a19 19 0 1 1 26 0" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M29 66a30 30 0 1 1 42 0" stroke="#fff" strokeOpacity=".75" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <rect x="46.5" y="55" width="7" height="22" rx="3.5" fill="#fff" />
      </>
    ),
  },
  tv: {
    bg: ['#3a3a40', '#0b0b0e'],
    draw: () => (
      <>
        <rect x="20" y="27" width="60" height="40" rx="6" fill="none" stroke="#fff" strokeWidth="3.6" />
        <path d="M38 76h24" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M45 38l15 9-15 9z" fill="#fff" />
      </>
    ),
  },
  appstore: {
    bg: ['#45bcff', '#105ce6'],
    draw: () => (
      <>
        <path d="M38 41v-6a12 12 0 0 1 24 0v6" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <rect x="26" y="40" width="48" height="36" rx="7" fill="#fff" />
        <path d="M50 49v15M42.5 56.5h15" stroke="#1868ee" strokeWidth="4.5" strokeLinecap="round" />
      </>
    ),
  },
  settings: {
    bg: ['#ececf0', '#9b9ba3'],
    light: true,
    draw: (u) => (
      <>
        <defs>
          <linearGradient id={u('s')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8e8e93" />
            <stop offset="1" stopColor="#48484c" />
          </linearGradient>
        </defs>
        <path d={GEAR} fill={`url(#${u('s')})`} />
        <circle cx="50" cy="50" r="22" fill="#e5e5ea" />
        <path d={GEAR_INNER} fill="#8e8e93" />
        <circle cx="50" cy="50" r="6" fill="#e5e5ea" />
      </>
    ),
  },
  terminal: {
    bg: ['#3d3d40', '#1a1a1c'],
    draw: () => (
      <>
        <rect x="0" y="0" width="100" height="20" fill="#56565a" />
        <path d="M26 39l12 10-12 10" stroke="#f2f2f7" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M44 62h20" stroke="#f2f2f7" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
  activity: {
    bg: ['#2f2f33', '#0f0f10'],
    draw: () => (
      <>
        {[30, 45, 60, 75].map((y) => (
          <path key={y} d={`M14 ${y}h72`} stroke="#fff" strokeOpacity=".08" strokeWidth="1" />
        ))}
        <path d="M14 66l13-8 10 12 13-36 10 26 10-10 16-6" stroke="#32d74b" strokeWidth="4.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 74l14-4 12 3 14-10 12 5 18-6" stroke="#0a84ff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      </>
    ),
  },
  textedit: {
    bg: ['#f4f5f9', '#d4d8e1'],
    light: true,
    draw: () => (
      <>
        <rect x="24" y="15" width="50" height="70" rx="3" fill="#fff" stroke="#c7cbd4" strokeWidth="1" />
        {[27, 35, 43, 51, 59].map((y, i) => (
          <rect key={y} x="31" y={y} width={i === 4 ? 22 : 36} height="2.6" rx="1.3" fill="#b8bcc6" />
        ))}
        <path d="M58 79l24-32 6 5-24 32-8 3z" fill="#2c2c2e" />
        <path d="M82 47l3-4 6 5-3 4z" fill="#ff9f0a" />
      </>
    ),
  },
  preview: {
    bg: ['#62c6ff', '#1d6ff2'],
    draw: () => (
      <>
        <g transform="rotate(-8 46 48)">
          <rect x="22" y="26" width="48" height="40" rx="3" fill="#fff" />
          <rect x="26" y="30" width="40" height="28" fill="#9fd8ff" />
          <path d="M26 58l12-12 9 8 7-6 12 10z" fill="#3c9a55" />
          <circle cx="58" cy="37" r="4" fill="#fff4a8" />
        </g>
        <circle cx="64" cy="62" r="11" fill="#fff" fillOpacity=".35" stroke="#222" strokeWidth="4.5" />
        <path d="M72 70l9 9" stroke="#222" strokeWidth="6" strokeLinecap="round" />
      </>
    ),
  },
  calculator: {
    bg: ['#3d3d40', '#1a1a1c'],
    draw: () => (
      <>
        <rect x="22" y="18" width="56" height="12" rx="3" fill="#636366" opacity=".5" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={30 + c * 20} cy={44 + r * 17} r="6.8" fill={c === 2 ? '#ff9f0a' : r === 0 ? '#a5a5aa' : '#636366'} />),
        )}
      </>
    ),
  },
  clock: { bg: ['#2b2b2e', '#0d0d0f'], draw: () => <ClockGlyph /> },
  weather: {
    bg: ['#4fb6ff', '#1f6fdc'],
    draw: () => (
      <>
        <circle cx="40" cy="40" r="13" fill="#ffd60a" />
        <path d="M33 74h41a11 11 0 0 0 0-22 15 15 0 0 0-28-4 10 10 0 0 0-13 26z" fill="#fff" />
      </>
    ),
  },
  voicememos: {
    bg: ['#333336', '#111113'],
    draw: () => (
      <>
        {[10, 22, 34, 18, 42, 28, 14, 32, 20, 8].map((h, i) => (
          <line key={i} x1={22 + i * 6.3} x2={22 + i * 6.3} y1={50 - h / 2} y2={50 + h / 2} stroke="#ff375f" strokeWidth="3.6" strokeLinecap="round" />
        ))}
      </>
    ),
  },
  fontbook: {
    bg: ['#f7f7fa', '#c9c9cf'],
    light: true,
    draw: () => (
      <>
        <rect x="18" y="20" width="64" height="60" rx="4" fill="#fff" stroke="#d1d1d6" />
        <text x="50" y="63" textAnchor="middle" fontSize="38" fontFamily="Georgia, 'Times New Roman', serif" fill="#1d1d1f">
          Aa
        </text>
      </>
    ),
  },
  sketchbook: {
    bg: ['#fff6cf', '#ffcf4a'],
    light: true,
    draw: () => (
      <>
        <path d="M20 66C30 32 42 80 52 46s20-6 28-18" stroke="#ff5a1f" strokeWidth="5.5" fill="none" strokeLinecap="round" />
        <path d="M24 78c12-6 24 2 38-6" stroke="#0a84ff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="74" cy="66" r="6" fill="#34c759" />
      </>
    ),
  },
  code: {
    bg: ['#2fa4f0', '#0a5fb4'],
    draw: () => (
      <>
        <path d="M70 18L40 46 24 34l-8 5v22l8 5 16-12 30 28 14-6V24z" fill="#fff" fillOpacity=".18" />
        <path d="M70 18L40 46 24 34l-8 5v22l8 5 16-12 30 28 14-6V24zM70 34v32L48 50z" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinejoin="round" />
      </>
    ),
  },
  codepad: {
    bg: ['#22304e', '#0a1120'],
    draw: () => (
      <>
        <path d="M38 36L24 50l14 14M62 36l14 14-14 14" stroke="#5ee1ff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M55 31L45 69" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
  archive: {
    bg: ['#cfa970', '#86663a'],
    draw: () => (
      <>
        <rect x="24" y="36" width="52" height="40" rx="4" fill="#f2dfbd" />
        <rect x="20" y="26" width="60" height="13" rx="3" fill="#f9ecd3" />
        <path d="M50 26v50" stroke="#86663a" strokeWidth="4" strokeDasharray="3.2 3.2" />
      </>
    ),
  },
  screenshot: {
    bg: ['#ececf0', '#a7a7ad'],
    light: true,
    draw: () => (
      <>
        <path d="M24 36V24h12M64 24h12v12M76 64v12H64M36 76H24V64" stroke="#3a3a3c" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="39" y="43" width="22" height="16" rx="3.5" fill="#3a3a3c" />
        <circle cx="50" cy="51" r="4.2" fill="#ececf0" />
      </>
    ),
  },
  chess: {
    bg: ['#ecc893', '#a57238'],
    light: true,
    draw: () => (
      <path
        d="M33 80h34v-6h-4c0-8 1-16-1-24-2-9-9-16-18-18l-3-7-4 9c-6 4-9 10-11 16l6 4 8-4c2 4-4 9-6 15-2 5-2 9-2 9h-3z"
        fill="#2b1d10"
      />
    ),
  },
  mines: {
    bg: ['#bcc6d0', '#7b8895'],
    draw: () => (
      <>
        <path d="M33 14v72M67 14v72M14 33h72M14 67h72" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
        <path d="M50 30v40M30 50h40M36 36l28 28M64 36L36 64" stroke="#1c1c1e" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="13" fill="#1c1c1e" />
        <circle cx="45.5" cy="45.5" r="3.4" fill="#fff" />
      </>
    ),
  },
  photobooth: {
    bg: ['#ff6268', '#c0161d'],
    draw: () => (
      <>
        <circle cx="50" cy="50" r="22" fill="#fff" />
        <circle cx="50" cy="50" r="13" fill="#c0161d" />
        <circle cx="45" cy="45" r="4.5" fill="#fff" />
      </>
    ),
  },
  stickies: {
    bg: ['#fff39a', '#ffd60a'],
    light: true,
    draw: () => (
      <>
        {[36, 48, 60].map((y) => (
          <rect key={y} x="22" y={y} width="50" height="3" rx="1.5" fill="#b89b00" opacity=".35" />
        ))}
        <path d="M100 66v34H66z" fill="#e8b800" />
        <path d="M66 100l34-34H72a6 6 0 0 0-6 6z" fill="#fff6b8" />
      </>
    ),
  },
  siri: { bg: ['#2a2a40', '#0a0a14'], draw: () => <circle cx="50" cy="50" r="22" fill="#5e5ce6" /> },
  about: {
    bg: ['#f7f7fa', '#c9c9cf'],
    light: true,
    draw: () => (
      <>
        <rect x="20" y="26" width="60" height="38" rx="3" fill="#1c1c1e" />
        <rect x="23" y="29" width="54" height="32" fill="#ff8a4c" />
        <path d="M14 66h72l-4 6H18z" fill="#8e8e93" />
      </>
    ),
  },
};
ICONS.systemreport = ICONS.activity;
ICONS.getinfo = ICONS.finder;
ICONS.shortcuts = ICONS.settings;

export function hasIcon(id: string) {
  return id in ICONS;
}

export function AppIcon({ id, size = 64, className, style }: { id: string; size?: number; className?: string; style?: React.CSSProperties }) {
  const rid = useId().replace(/:/g, '');
  const u = (s: string) => `${rid}${s}`;
  if (id === 'trash' || id === 'trash-full') return <TrashIcon full={id === 'trash-full'} size={size} className={className} style={style} />;
  if (id === 'downloads') return <FolderSvg size={size} glyph="downloads" className={className} />;
  if (id.startsWith('web.')) return <WebAppIcon id={id} size={size} className={className} style={style} />;
  const def = ICONS[id] ?? ICONS.about;
  const [from, to] = def.bg ?? ['#ddd', '#999'];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <clipPath id={u('clip')}>
          <path d={SQUIRCLE} />
        </clipPath>
        <linearGradient id={u('bg')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={u('sheen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={def.light ? 0.6 : 0.32} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${u('clip')})`}>
        <rect width="100" height="100" fill={`url(#${u('bg')})`} />
        {def.draw(u)}
        <rect width="100" height="100" fill={`url(#${u('sheen')})`} />
      </g>
      <path d={SQUIRCLE} fill="none" stroke="#fff" strokeOpacity={def.light ? 0.9 : 0.35} strokeWidth="1.2" />
      <path d={SQUIRCLE} fill="none" stroke="#000" strokeOpacity={def.light ? 0.14 : 0.18} strokeWidth="0.6" />
    </svg>
  );
}

export function TrashIcon({ full, size = 64, className, style }: { full?: boolean; size?: number; className?: string; style?: React.CSSProperties }) {
  const rid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={`${rid}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity=".5" />
        </linearGradient>
      </defs>
      {full && (
        <g>
          <path d="M34 30c4-10 14-12 20-6 6-8 16-4 14 6z" fill="#f7f7f7" stroke="#c9c9cf" strokeWidth=".8" />
          <path d="M40 28l6-10 8 6 4-6 6 10z" fill="#ffffff" stroke="#d1d1d6" strokeWidth=".8" />
        </g>
      )}
      <path d="M26 28h48l-4.5 58a5 5 0 0 1-5 4.6H35.5a5 5 0 0 1-5-4.6z" fill={`url(#${rid}t)`} stroke="#fff" strokeOpacity=".95" strokeWidth="1.3" />
      <path d="M26 28h48l-4.5 58a5 5 0 0 1-5 4.6H35.5a5 5 0 0 1-5-4.6z" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth=".6" />
      {[38, 50, 62].map((x) => (
        <path key={x} d={`M${x} 36l${(x - 50) * 0.06} 46`} stroke="#8e8e93" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      ))}
      <ellipse cx="50" cy="28" rx="25" ry="4" fill="#fff" fillOpacity=".7" stroke="#000" strokeOpacity=".15" strokeWidth=".6" />
    </svg>
  );
}

export type FolderGlyph = 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'movies' | 'applications' | 'home' | 'library' | 'system' | 'users' | 'public' | 'trash' | null;

export function FolderSvg({ size = 64, glyph = null, className, tint }: { size?: number; glyph?: FolderGlyph | string; className?: string; tint?: string }) {
  const rid = useId().replace(/:/g, '');
  const g = glyph as FolderGlyph;
  const glyphColor = '#2f8fdc';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${rid}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint ?? '#94d5ff'} />
          <stop offset="1" stopColor={tint ?? '#5fb3f3'} />
        </linearGradient>
      </defs>
      <path d="M9 25a5 5 0 0 1 5-5h22.5l6.5 6.5H86a5 5 0 0 1 5 5V78a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5z" fill={tint ? tint : '#4ea6ec'} opacity={tint ? 0.75 : 1} />
      <path d="M9 35.5a3 3 0 0 1 3-3h76a3 3 0 0 1 3 3V78a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5z" fill={`url(#${rid}f)`} />
      <path d="M12 33.5h76" stroke="#fff" strokeOpacity=".6" strokeWidth="1.2" />
      <g fill="none" stroke={glyphColor} strokeOpacity=".75" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        {g === 'desktop' && (
          <>
            <rect x="37" y="45" width="26" height="18" rx="2" />
            <path d="M45 70h10M50 63v7" />
          </>
        )}
        {g === 'documents' && (
          <>
            <path d="M40 43h14l7 7v20H40z" />
            <path d="M54 43v7h7" />
          </>
        )}
        {g === 'downloads' && (
          <>
            <circle cx="50" cy="57" r="14" />
            <path d="M50 49v15M44 58l6 6 6-6" />
          </>
        )}
        {g === 'pictures' && (
          <>
            <rect x="37" y="46" width="26" height="22" rx="2" />
            <path d="M38 64l8-8 6 6 4-4 7 7" />
          </>
        )}
        {g === 'music' && (
          <>
            <path d="M46 66V48l14-3v17" />
            <circle cx="43" cy="66" r="3.5" />
            <circle cx="57" cy="62" r="3.5" />
          </>
        )}
        {g === 'movies' && (
          <>
            <rect x="37" y="46" width="26" height="22" rx="2" />
            <path d="M37 52h26M37 62h26M44 46v22M56 46v22" />
          </>
        )}
        {g === 'applications' && <path d="M42 70l8-24 8 24M45 62h10" />}
        {g === 'home' && <path d="M38 58l12-11 12 11M41 56v13h18V56" />}
        {g === 'library' && <path d="M40 46v22M47 46v22M54 47l6 21" />}
        {g === 'system' && <circle cx="50" cy="57" r="9" />}
        {g === 'users' && (
          <>
            <circle cx="50" cy="52" r="5" />
            <path d="M40 68c2-6 6-8 10-8s8 2 10 8" />
          </>
        )}
        {g === 'public' && <path d="M38 62h24M44 54h12M50 46v22" />}
      </g>
    </svg>
  );
}

/** Web-app icons: an original monogram in the service's colours (not its logo). */
function WebAppIcon({ id, size, className, style }: { id: string; size: number; className?: string; style?: React.CSSProperties }) {
  const rid = useId().replace(/:/g, '');
  const w = webApp(id);
  const [from, to] = w?.colors ?? ['#999', '#555'];
  const glyph = w?.glyph ?? '?';
  const light = (() => {
    const h = from.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 200;
  })();
  const fs = glyph.length >= 3 ? 30 : glyph.length === 2 ? 38 : 50;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <clipPath id={`${rid}c`}><path d={SQUIRCLE} /></clipPath>
        <linearGradient id={`${rid}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
        <linearGradient id={`${rid}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <g clipPath={`url(#${rid}c)`}>
        <rect width="100" height="100" fill={`url(#${rid}g)`} />
        <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontFamily="Inter Variable, system-ui, sans-serif" fontWeight="800" fontSize={fs} fill={light ? '#1d1d1f' : '#fff'} letterSpacing="-1">{glyph}</text>
        <rect width="100" height="100" fill={`url(#${rid}s)`} />
      </g>
    </svg>
  );
}
