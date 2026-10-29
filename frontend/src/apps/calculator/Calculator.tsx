import { useEffect, useState } from 'react';
import { History, Delete } from 'lucide-react';
import type { AppProps } from '../../types';
import { DragRegion, TrafficLights, useMenus, useWindow } from '../../shell/windowContext';
import { evaluate, formatNumber } from '../../lib/calc';
import { copyText } from '../../lib/download';
import { useWindows } from '../../stores/windows';

type Key = { label: string; kind: 'fn' | 'num' | 'op'; value: string; wide?: boolean };

const BASIC: Key[] = [
  { label: '⌫', kind: 'fn', value: 'back' }, { label: 'AC', kind: 'fn', value: 'clear' }, { label: '%', kind: 'fn', value: '%' }, { label: '÷', kind: 'op', value: '/' },
  { label: '7', kind: 'num', value: '7' }, { label: '8', kind: 'num', value: '8' }, { label: '9', kind: 'num', value: '9' }, { label: '×', kind: 'op', value: '*' },
  { label: '4', kind: 'num', value: '4' }, { label: '5', kind: 'num', value: '5' }, { label: '6', kind: 'num', value: '6' }, { label: '−', kind: 'op', value: '-' },
  { label: '1', kind: 'num', value: '1' }, { label: '2', kind: 'num', value: '2' }, { label: '3', kind: 'num', value: '3' }, { label: '+', kind: 'op', value: '+' },
  { label: '±', kind: 'num', value: 'neg' }, { label: '0', kind: 'num', value: '0' }, { label: '.', kind: 'num', value: '.' }, { label: '=', kind: 'op', value: '=' },
];
const SCI: Key[] = [
  { label: '(', kind: 'fn', value: '(' }, { label: ')', kind: 'fn', value: ')' }, { label: 'x²', kind: 'fn', value: '^2' }, { label: 'xʸ', kind: 'fn', value: '^' },
  { label: '√', kind: 'fn', value: 'sqrt(' }, { label: 'sin', kind: 'fn', value: 'sin(' }, { label: 'cos', kind: 'fn', value: 'cos(' }, { label: 'tan', kind: 'fn', value: 'tan(' },
  { label: 'ln', kind: 'fn', value: 'ln(' }, { label: 'log', kind: 'fn', value: 'log(' }, { label: 'π', kind: 'fn', value: 'π' }, { label: 'e', kind: 'fn', value: 'e' },
];

export default function Calculator({ win }: AppProps) {
  const [expr, setExpr] = useState('');
  const [display, setDisplay] = useState('0');
  const [justEval, setJustEval] = useState(false);
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [sci, setSci] = useState(false);
  const { focused } = useWindow();

  useEffect(() => {
    const w = sci ? 560 : 260;
    const h = 418;
    const ws = useWindows.getState();
    const cur = ws.windows.find((x) => x.id === win.id);
    if (cur && (cur.bounds.w !== w + (showHist ? 220 : 0) || cur.bounds.h !== h)) ws.setBounds(win.id, { ...cur.bounds, w: w + (showHist ? 220 : 0), h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sci, showHist]);

  const press = (k: string) => {
    if (k === 'clear') {
      setExpr('');
      setDisplay('0');
      return;
    }
    if (k === 'back') {
      const e = expr.slice(0, -1);
      setExpr(e);
      setDisplay(e || '0');
      return;
    }
    if (k === '=') {
      if (!expr) return;
      try {
        // macOS-style percent: "200+10%" → 220
        const pctExpr = expr.replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)%$/, (_, a, op, b) => `${a}${op}(${a}*${b}/100)`);
        const r = formatNumber(evaluate(pctExpr)).replace(/,/g, '');
        setHistory((h) => [{ expr, result: r }, ...h].slice(0, 50));
        setDisplay(r);
        setExpr(r);
        setJustEval(true);
      } catch (err) {
        setDisplay((err as Error).message === 'Division by zero' ? 'Not a number' : 'Error');
        setExpr('');
      }
      return;
    }
    if (k === 'neg') {
      const m = expr.match(/(-?\d*\.?\d+)$/);
      if (!m) return;
      const flipped = m[1].startsWith('-') ? m[1].slice(1) : `-${m[1]}`;
      const e = expr.slice(0, -m[1].length) + flipped;
      setExpr(e);
      setDisplay(e);
      return;
    }
    let base = expr;
    if (justEval && /[0-9.(πe√a-z]/.test(k[0])) base = '';
    setJustEval(false);
    const e = base + k;
    setExpr(e);
    setDisplay(e.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−'));
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const map: Record<string, string> = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear', '*': '*', x: '*', '/': '/', '+': '+', '-': '-', '%': '%', '.': '.', ',': '.', '(': '(', ')': ')', '^': '^' };
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (map[e.key]) {
        e.preventDefault();
        press(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useMenus(
    [
      { title: 'View', items: [{ label: 'Basic', shortcut: 'mod+1', checked: !sci, action: () => setSci(false) }, { label: 'Scientific', shortcut: 'mod+2', checked: sci, action: () => setSci(true) }, { separator: true }, { label: showHist ? 'Hide History' : 'Show History', shortcut: 'mod+shift+h', action: () => setShowHist(!showHist) }] },
      { title: 'Edit', items: [{ label: 'Copy Result', shortcut: 'mod+c', action: () => void copyText(display) }, { label: 'Clear History', action: () => setHistory([]) }] },
    ],
    [sci, showHist, display],
  );

  const btn = (k: Key) => (
    <button
      key={k.label + k.value}
      onClick={() => press(k.value)}
      className="rounded-full border-0 text-[22px] font-normal grid place-items-center active:brightness-125 transition"
      style={{
        width: 48,
        height: 48,
        background: k.kind === 'op' ? '#ff9f0a' : k.kind === 'fn' ? '#5a5a5e' : '#3a3a3c',
        color: '#fff',
        fontSize: k.label.length > 2 ? 15 : 21,
      }}
    >
      {k.label === '⌫' ? <Delete size={20} /> : k.label}
    </button>
  );

  const fontSize = display.length > 14 ? 26 : display.length > 10 ? 34 : 46;
  return (
    <div className="flex h-full" style={{ background: '#1f1f21', color: '#fff' }}>
      <div className="flex flex-col flex-1">
        <DragRegion className="h-[40px] flex items-center pr-2 flex-none">
          <TrafficLights />
          <button className="ml-auto tb-btn" style={{ color: '#fff' }} aria-label="History" onClick={() => setShowHist(!showHist)}>
            <History size={15} />
          </button>
        </DragRegion>
        <div className="px-4 text-right selectable flex flex-col justify-end" style={{ height: 76 }}>
          <div className="text-[12px] text-white/45 truncate h-[16px]">{justEval && history[0] ? history[0].expr.replace(/\*/g, '×').replace(/\//g, '÷') : ''}</div>
          <div className="font-light truncate leading-none tabular-nums" style={{ fontSize }} aria-live="polite">
            {display}
          </div>
        </div>
        <div className="flex gap-3 px-3 pb-3 pt-3 justify-center">
          {sci && <div className="grid grid-cols-4 gap-[10px] content-start">{SCI.map(btn)}</div>}
          <div className="grid grid-cols-4 gap-[10px]">{BASIC.map(btn)}</div>
        </div>
      </div>
      {showHist && (
        <div className="w-[220px] flex-none flex flex-col" style={{ background: '#2a2a2d' }}>
          <div className="h-[40px] flex items-center px-3 text-[12px] font-semibold text-white/70">History</div>
          <div className="scroll flex-1 px-3">
            {history.length === 0 && <div className="text-[12px] text-white/40 mt-4 text-center">No calculations yet</div>}
            {history.map((h, i) => (
              <button key={i} className="w-full text-right py-2 border-0 bg-transparent text-white hairline-b" onClick={() => { setExpr(h.result); setDisplay(h.result); setJustEval(true); }}>
                <div className="text-[11px] text-white/50 truncate">{h.expr}</div>
                <div className="text-[16px] tabular-nums">{h.result}</div>
              </button>
            ))}
          </div>
          {history.length > 0 && <button className="btn m-2" onClick={() => setHistory([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}
