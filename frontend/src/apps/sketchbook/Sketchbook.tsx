import { useEffect, useRef, useState } from 'react';
import { Pen, Highlighter, Eraser, Undo2, Redo2, Trash2, Save, Brush } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { useFs, PICTURES } from '../../stores/fs';
import { useSystem } from '../../stores/system';
import { SaveSheet } from '../../components/FileDialogs';
import { Slider } from '../../components/ui';

type Tool = 'pen' | 'marker' | 'highlighter' | 'eraser';
interface Stroke { tool: Tool; color: string; width: number; pts: [number, number, number][] }
const COLORS = ['#1c1c1e', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6', '#af52de', '#ffffff'];

function drawStroke(g: CanvasRenderingContext2D, s: Stroke) {
  if (!s.pts.length) return;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = s.color;
  g.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
  g.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  for (let i = 1; i < s.pts.length; i++) {
    const [x0, y0, p0] = s.pts[i - 1];
    const [x1, y1, p1] = s.pts[i];
    g.lineWidth = s.tool === 'pen' ? s.width * (0.5 + ((p0 + p1) / 2) * 0.8) : s.width;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  if (s.pts.length === 1) {
    g.beginPath();
    g.arc(s.pts[0][0], s.pts[0][1], s.width / 2, 0, Math.PI * 2);
    g.fillStyle = s.color;
    g.fill();
  }
  g.restore();
}

export default function Sketchbook(_: AppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#1c1c1e');
  const [width, setWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [saving, setSaving] = useState(false);
  const [paper, setPaper] = useState<'plain' | 'grid' | 'lines'>('plain');
  const cur = useRef<Stroke | null>(null);

  const repaint = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of strokes) drawStroke(g, s);
    if (cur.current) drawStroke(g, cur.current);
  };
  useEffect(repaint);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvas.current;
      const w = wrap.current;
      if (!c || !w) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = w.clientWidth * dpr;
      c.height = w.clientHeight * dpr;
      c.style.width = `${w.clientWidth}px`;
      c.style.height = `${w.clientHeight}px`;
      repaint();
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  });

  const local = (e: PointerEvent | React.PointerEvent): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const sc = r.width / canvas.current!.clientWidth || 1;
    return [(e.clientX - r.left) / sc, (e.clientY - r.top) / sc, e.pressure || 0.5];
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    cur.current = { tool, color, width: tool === 'highlighter' ? width * 4 : tool === 'eraser' ? width * 4 : tool === 'marker' ? width * 2 : width, pts: [local(e)] };
    repaint();
  };
  const move = (e: React.PointerEvent) => {
    if (!cur.current) return;
    cur.current.pts.push(local(e));
    repaint();
  };
  const up = () => {
    if (!cur.current) return;
    const s = cur.current;
    cur.current = null;
    setStrokes((x) => [...x, s]);
    setRedo([]);
  };
  const undo = () => {
    if (!strokes.length) return;
    setRedo((r) => [...r, strokes[strokes.length - 1]]);
    setStrokes((s) => s.slice(0, -1));
  };
  const redoFn = () => {
    if (!redo.length) return;
    setStrokes((s) => [...s, redo[redo.length - 1]]);
    setRedo((r) => r.slice(0, -1));
  };
  const save = async (folder: string, name: string) => {
    const c = canvas.current!;
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const g = out.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, 0, 0);
    const blob: Blob = await new Promise((r) => out.toBlob((b) => r(b!), 'image/png'));
    await useFs.getState().createFile(folder, name, blob, 'image/png');
    setSaving(false);
    useSystem.getState().showToast(`Saved “${name}”.`);
  };

  useMenus([{ title: 'File', items: [{ label: 'Save as PNG…', shortcut: 'mod+s', action: () => setSaving(true) }, { label: 'Clear Canvas', action: () => { setStrokes([]); setRedo([]); } }] }, { title: 'Edit', items: [{ label: 'Undo', shortcut: 'mod+z', disabled: !strokes.length, action: undo }, { label: 'Redo', shortcut: 'mod+shift+z', disabled: !redo.length, action: redoFn }] }], [strokes.length, redo.length]);

  const bg = paper === 'grid' ? 'linear-gradient(#e5e5ea 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg,#e5e5ea 1px, transparent 1px) 0 0/24px 24px, #fff' : paper === 'lines' ? 'linear-gradient(#dbe6ff 1px, transparent 1px) 0 0/100% 28px, #fff' : '#fff';
  return (
    <div className="flex flex-col h-full relative app-surface">
      <TitleBar title="Sketchbook" className="chrome hairline-b">
        <div className="ml-auto flex items-center gap-2" data-no-drag>
          <div className="tb-group">
            <button className="tb-btn" aria-label="Undo" disabled={!strokes.length} onClick={undo}><Undo2 size={15} /></button>
            <button className="tb-btn" aria-label="Redo" disabled={!redo.length} onClick={redoFn}><Redo2 size={15} /></button>
          </div>
          <select className="popup" value={paper} onChange={(e) => setPaper(e.target.value as typeof paper)} aria-label="Paper"><option value="plain">Plain</option><option value="grid">Grid</option><option value="lines">Lined</option></select>
          <div className="tb-group">
            <button className="tb-btn" aria-label="Clear" onClick={() => { setStrokes([]); setRedo([]); }}><Trash2 size={15} /></button>
            <button className="tb-btn" aria-label="Save" onClick={() => setSaving(true)}><Save size={15} /></button>
          </div>
        </div>
      </TitleBar>
      <div ref={wrap} className="flex-1 min-h-0 relative" style={{ background: bg }}>
        <canvas ref={canvas} className="absolute inset-0 touch-none" style={{ cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-strong liquid rounded-[20px] px-3 py-2 flex items-center gap-3" style={{ color: 'var(--text)' }}>
          {([['pen', Pen], ['marker', Brush], ['highlighter', Highlighter], ['eraser', Eraser]] as const).map(([t, I]) => (
            <button key={t} aria-label={t} className="w-[34px] h-[34px] rounded-[10px] border-0 grid place-items-center" style={{ background: tool === t ? 'var(--accent)' : 'transparent', color: tool === t ? '#fff' : 'inherit' }} onClick={() => setTool(t)}><I size={17} /></button>
          ))}
          <div className="w-px h-[24px] bg-[var(--separator-strong)]" />
          {COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className="w-[20px] h-[20px] rounded-full border-0" style={{ background: c, boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.2)' }} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} />)}
          <div className="w-[90px]"><Slider value={width} min={1} max={20} step={1} onChange={setWidth} ariaLabel="Width" /></div>
        </div>
      </div>
      {saving && <SaveSheet title="Save Drawing" defaultName={`Sketch ${new Date().toLocaleDateString('en-CA')}`} defaultFolder={PICTURES} formats={[{ ext: 'png', label: 'PNG image' }]} onCancel={() => setSaving(false)} onSave={(f, n) => void save(f, n)} />}
    </div>
  );
}
