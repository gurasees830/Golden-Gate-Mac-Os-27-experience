import { useEffect, useMemo, useState } from 'react';
import { Check, Type } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { SearchField, Segmented, Slider } from '../../components/ui';

const CANDIDATES = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Cascadia Code', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic', 'Microsoft Sans Serif', 'MS Gothic', 'Nirmala UI', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'Helvetica', 'Helvetica Neue', 'Avenir', 'Avenir Next', 'Futura', 'Gill Sans', 'Menlo', 'Monaco', 'Optima', 'Palatino', 'Baskerville', 'Didot', 'American Typewriter', 'Chalkboard', 'Hoefler Text', 'SF Pro', 'SF Mono', 'New York',
  'Ubuntu', 'DejaVu Sans', 'DejaVu Serif', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Noto Serif', 'Roboto', 'Open Sans', 'Cantarell', 'Fira Sans', 'Source Code Pro', 'JetBrains Mono',
];

function detect(font: string): boolean {
  const c = document.createElement('canvas').getContext('2d')!;
  const s = 'mmmmmmmmmmlliWW@#0O';
  const width = (f: string) => {
    c.font = `72px ${f}`;
    return c.measureText(s).width;
  };
  return ['monospace', 'serif', 'sans-serif'].some((base) => width(`"${font}", ${base}`) !== width(base));
}

export default function FontBook(_: AppProps) {
  const [fonts, setFonts] = useState<{ family: string; source: 'bundled' | 'detected' | 'local' }[]>([]);
  const [sel, setSel] = useState('Inter Variable');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'sample' | 'repertoire' | 'custom'>('sample');
  const [size, setSize] = useState(36);
  const [custom, setCustom] = useState('Golden Gate Bridge, San Francisco');
  const [localState, setLocalState] = useState<'idle' | 'ok' | 'denied' | 'unsupported'>('queryLocalFonts' in window ? 'idle' : 'unsupported');

  useEffect(() => {
    const found = CANDIDATES.filter(detect).map((f) => ({ family: f, source: 'detected' as const }));
    setFonts([{ family: 'Inter Variable', source: 'bundled' }, ...found]);
  }, []);

  const loadLocal = async () => {
    try {
      const w = window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> };
      const list = await w.queryLocalFonts!();
      const fams = [...new Set(list.map((f) => f.family))];
      setFonts((cur) => {
        const have = new Set(cur.map((c) => c.family));
        return [...cur, ...fams.filter((f) => !have.has(f)).map((f) => ({ family: f, source: 'local' as const }))].sort((a, b) => a.family.localeCompare(b.family));
      });
      setLocalState('ok');
    } catch {
      setLocalState('denied');
    }
  };

  const list = useMemo(() => fonts.filter((f) => f.family.toLowerCase().includes(q.toLowerCase())), [fonts, q]);
  const ff = `"${sel}", var(--font)`;
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[240px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2"><SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} aria-label="Search fonts" /></div>
        <div className="scroll flex-1 px-2">
          {list.map((f) => (
            <div key={f.family} className={`sb-item accent ${sel === f.family ? 'active' : ''}`} onClick={() => setSel(f.family)}>
              <span className="truncate flex-1" style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
              <span className="text-[10px] opacity-60">{f.source === 'bundled' ? 'App' : f.source === 'local' ? 'Local' : ''}</span>
            </div>
          ))}
        </div>
        <div className="p-3 hairline-t text-[11px] muted">
          {fonts.length} families. {localState === 'idle' && <button className="link border-0 bg-transparent p-0 text-[11px]" onClick={() => void loadLocal()}>List all local fonts…</button>}
          {localState === 'denied' && 'Local font access was denied or blocked.'}
          {localState === 'unsupported' && 'Full local font list needs Chrome or Edge.'}
          {localState === 'ok' && <span className="inline-flex items-center gap-1"><Check size={11} /> Local fonts loaded</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col app-surface">
        <TitleBar lights={false} showTitle={false} className="hairline-b !gap-3" style={{ paddingLeft: 16 }}>
          <div className="font-bold text-[14px] truncate flex items-center gap-2"><Type size={15} /> {sel}</div>
          <div className="flex-1" />
          <div data-no-drag><Segmented value={mode} onChange={setMode} options={[{ value: 'sample', label: 'Sample' }, { value: 'repertoire', label: 'Characters' }, { value: 'custom', label: 'Custom' }]} /></div>
          <div className="w-[120px]" data-no-drag><Slider value={size} min={12} max={120} step={1} onChange={setSize} ariaLabel="Size" /></div>
        </TitleBar>
        <div className="flex-1 scroll px-8 py-6" style={{ fontFamily: ff }}>
          {mode === 'sample' && (
            <div className="flex flex-col gap-4">
              <div style={{ fontSize: size }}>ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
              <div style={{ fontSize: size }}>abcdefghijklmnopqrstuvwxyz</div>
              <div style={{ fontSize: size }}>1234567890</div>
              <div style={{ fontSize: size * 0.6 }}>The quick brown fox jumps over the lazy dog.</div>
              {[300, 400, 600, 700, 900].map((w) => <div key={w} style={{ fontSize: 18, fontWeight: w }}>{w} — Sphinx of black quartz, judge my vow.</div>)}
            </div>
          )}
          {mode === 'repertoire' && (
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(44, size + 16)}px, 1fr))` }}>
              {Array.from({ length: 222 }, (_, i) => String.fromCharCode(33 + i)).filter((c) => c.trim()).map((c) => (
                <div key={c} className="card grid place-items-center aspect-square" style={{ fontSize: size * 0.7 }}>{c}</div>
              ))}
            </div>
          )}
          {mode === 'custom' && <textarea className="w-full h-full bg-transparent border-0 outline-none resize-none" style={{ fontSize: size, fontFamily: ff }} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom preview text" />}
        </div>
        <div className="h-[24px] hairline-t text-[11px] muted flex items-center px-4">{fonts.find((f) => f.family === sel)?.source === 'bundled' ? 'Bundled with Golden Gate (SIL Open Font License)' : 'Installed on your computer — detected by your browser'}</div>
      </div>
    </div>
  );
}
