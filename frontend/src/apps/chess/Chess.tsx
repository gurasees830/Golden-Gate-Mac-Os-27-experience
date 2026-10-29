import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess as Engine, type Move, type Square } from 'chess.js';
import { RotateCcw, Undo2, FlipVertical } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { Segmented } from '../../components/ui';
import { playUi } from '../../lib/sound';

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// small piece-square tables (white perspective)
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function evaluateBoard(g: Engine): number {
  let s = 0;
  const b = g.board();
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = b[r][f];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const v = VALUES[p.type] + PST[p.type][idx];
      s += p.color === 'w' ? v : -v;
    }
  return s;
}

function search(g: Engine, depth: number, alpha: number, beta: number, max: boolean): number {
  if (depth === 0 || g.isGameOver()) {
    if (g.isCheckmate()) return max ? -1e6 : 1e6;
    if (g.isDraw()) return 0;
    return evaluateBoard(g);
  }
  const moves = g.moves({ verbose: true }).sort((a, b) => Number(!!b.captured) - Number(!!a.captured));
  if (max) {
    let best = -Infinity;
    for (const m of moves) {
      g.move(m);
      best = Math.max(best, search(g, depth - 1, alpha, beta, false));
      g.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    g.move(m);
    best = Math.min(best, search(g, depth - 1, alpha, beta, true));
    g.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function bestMove(fen: string, depth: number): Move | null {
  const g = new Engine(fen);
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  const white = g.turn() === 'w';
  let best: Move | null = null;
  let bestScore = white ? -Infinity : Infinity;
  for (const m of moves.sort(() => Math.random() - 0.5)) {
    g.move(m);
    const s = search(g, depth - 1, -Infinity, Infinity, !white);
    g.undo();
    if (white ? s > bestScore : s < bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

const GLYPH: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟︎' };

export default function ChessApp(_: AppProps) {
  const game = useRef(new Engine());
  const [fen, setFen] = useState(game.current.fen());
  const [sel, setSel] = useState<Square | null>(null);
  const [level, setLevel] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [flip, setFlip] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const g = game.current;
  void fen;
  const targets = useMemo(() => (sel ? g.moves({ square: sel, verbose: true }).map((m) => m.to) : []), [sel, fen, g]);

  useEffect(() => {
    if (g.turn() !== 'b' || g.isGameOver()) return;
    setThinking(true);
    const t = setTimeout(() => {
      const depth = level === 'easy' ? 1 : level === 'medium' ? 2 : 3;
      const m = level === 'easy' && Math.random() < 0.3 ? g.moves({ verbose: true })[Math.floor(Math.random() * g.moves().length)] : bestMove(g.fen(), depth);
      if (m) {
        g.move(m);
        setLastMove({ from: m.from, to: m.to });
        playUi('click');
      }
      setFen(g.fen());
      setThinking(false);
    }, 250);
    return () => clearTimeout(t);
  }, [fen, level, g]);

  const click = (sq: Square) => {
    if (thinking || g.turn() !== 'w' || g.isGameOver()) return;
    const p = g.get(sq);
    if (sel && targets.includes(sq)) {
      const piece = g.get(sel);
      const promo = piece?.type === 'p' && sq[1] === '8' ? 'q' : undefined;
      const m = g.move({ from: sel, to: sq, promotion: promo });
      setLastMove({ from: m.from, to: m.to });
      playUi('click');
      setSel(null);
      setFen(g.fen());
      return;
    }
    setSel(p && p.color === 'w' ? sq : null);
  };
  const reset = () => {
    game.current = new Engine();
    setFen(game.current.fen());
    setSel(null);
    setLastMove(null);
  };
  const undo = () => {
    g.undo();
    if (g.turn() === 'b') g.undo();
    setFen(g.fen());
    setSel(null);
    setLastMove(null);
  };
  useMenus([{ title: 'Game', items: [{ label: 'New Game', shortcut: 'mod+n', action: reset }, { label: 'Take Back Move', shortcut: 'mod+z', action: undo }, { label: 'Rotate Board', shortcut: 'mod+r', action: () => setFlip(!flip) }] }], [flip]);

  const status = g.isCheckmate() ? (g.turn() === 'w' ? 'Checkmate — Computer wins' : 'Checkmate — You win! 🎉') : g.isDraw() ? 'Draw' : g.isCheck() ? (g.turn() === 'w' ? 'Check! Your move' : 'Check') : thinking ? 'Computer is thinking…' : g.turn() === 'w' ? 'Your move (White)' : '';
  const board = g.board();
  const rows = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;
  const history = g.history();

  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar title="Chess" className="chrome hairline-b">
        <div className="ml-auto flex items-center gap-2" data-no-drag>
          <Segmented value={level} onChange={setLevel} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
          <div className="tb-group">
            <button className="tb-btn" aria-label="Undo" onClick={undo}><Undo2 size={15} /></button>
            <button className="tb-btn" aria-label="Rotate board" onClick={() => setFlip(!flip)}><FlipVertical size={15} /></button>
            <button className="tb-btn" aria-label="New game" onClick={reset}><RotateCcw size={15} /></button>
          </div>
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 flex gap-4 p-4" style={{ background: 'linear-gradient(#3b2a1c,#21170f)' }}>
        <div className="flex-1 min-w-0 grid place-items-center">
          <div className="aspect-square h-full max-h-full max-w-full grid grid-cols-8 rounded-[6px] overflow-hidden" style={{ boxShadow: '0 10px 30px rgba(0,0,0,.5), 0 0 0 6px #5a3e26' }}>
            {rows.map((row, ri) =>
              row.map((p, fi) => {
                const rank = flip ? ri + 1 : 8 - ri;
                const file = flip ? 7 - fi : fi;
                const sq = `${'abcdefgh'[file]}${rank}` as Square;
                const dark = (rank + file) % 2 === 1;
                const isSel = sel === sq;
                const isTarget = targets.includes(sq);
                const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                return (
                  <div key={sq} className="relative grid place-items-center select-none" style={{ background: isSel ? '#f6eb72' : isLast ? (dark ? '#b9ae4f' : '#e6dc80') : dark ? '#b58863' : '#f0d9b5' }} onClick={() => click(sq)}>
                    {p && <span className="leading-none" style={{ fontSize: 'min(5.2vh, 44px)', color: p.color === 'w' ? '#fff' : '#111', textShadow: p.color === 'w' ? '0 0 2px #000, 0 1px 2px rgba(0,0,0,.6)' : '0 1px 1px rgba(255,255,255,.25)', fontFamily: '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", serif' }}>{GLYPH[p.color + p.type]}</span>}
                    {isTarget && <span className="absolute rounded-full" style={{ width: p ? '86%' : '28%', height: p ? '86%' : '28%', background: p ? 'transparent' : 'rgba(0,0,0,.2)', boxShadow: p ? 'inset 0 0 0 4px rgba(0,0,0,.25)' : undefined }} />}
                    {fi === 0 && <span className="absolute left-[3px] top-[1px] text-[10px] font-semibold" style={{ color: dark ? '#f0d9b5' : '#b58863' }}>{rank}</span>}
                    {ri === 7 && <span className="absolute right-[3px] bottom-[1px] text-[10px] font-semibold" style={{ color: dark ? '#f0d9b5' : '#b58863' }}>{'abcdefgh'[file]}</span>}
                  </div>
                );
              }),
            )}
          </div>
        </div>
        <div className="w-[180px] flex-none rounded-[12px] p-3 flex flex-col text-white" style={{ background: 'rgba(0,0,0,.3)' }}>
          <div className="font-semibold text-[13px] mb-1">{status}</div>
          <div className="text-[11px] opacity-70 mb-2">You play White against the computer.</div>
          <div className="scroll flex-1 text-[12px] font-mono">
            {Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => (
              <div key={i} className="flex gap-2"><span className="opacity-50 w-[22px]">{i + 1}.</span><span className="w-[48px]">{history[i * 2]}</span><span>{history[i * 2 + 1] ?? ''}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
