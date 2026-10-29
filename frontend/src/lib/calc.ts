/**
 * Safe arithmetic expression evaluator (shunting-yard). Never uses eval().
 * Supports + - × ÷ * / ^ %, parentheses, unary minus, decimals, constants
 * (pi, e) and functions (sqrt, sin, cos, tan, log, ln, abs).
 */
type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' } | { t: 'fn'; v: string };

const FNS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
};
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2, neg: 2.5, '^': 3 };
const RIGHT = new Set(['^', 'neg']);

export function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '').toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (s[j] === 'e' && /[-+0-9]/.test(s[j + 1] ?? '') && !/[a-z]/.test(s[j + 1] ?? '')) {
        j++;
        if (s[j] === '-' || s[j] === '+') j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const v = Number(s.slice(i, j));
      if (Number.isNaN(v)) throw new Error('Invalid number');
      out.push({ t: 'num', v });
      i = j;
    } else if (/[a-zπ]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zπ]/.test(s[j])) j++;
      const w = s.slice(i, j);
      if (w === 'pi' || w === 'π') out.push({ t: 'num', v: Math.PI });
      else if (w === 'e') out.push({ t: 'num', v: Math.E });
      else if (FNS[w]) out.push({ t: 'fn', v: w });
      else if (w === 'mod') out.push({ t: 'op', v: 'mod' });
      else throw new Error(`Unknown name ${w}`);
      i = j;
    } else if ('+-*/^%'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else if (c === '(') {
      out.push({ t: 'lp' });
      i++;
    } else if (c === ')') {
      out.push({ t: 'rp' });
      i++;
    } else throw new Error(`Unexpected “${c}”`);
  }
  return out;
}

export function evaluate(src: string): number {
  const toks = tokenize(src);
  if (!toks.length) throw new Error('Empty');
  const output: (number | string)[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null;
  for (let ti = 0; ti < toks.length; ti++) {
    const tk = toks[ti];
    if (tk.t === 'num') {
      if (prev && (prev.t === 'num' || prev.t === 'rp')) pushOp('*'); // implicit multiply: 2pi
      output.push(tk.v);
    } else if (tk.t === 'fn') {
      if (prev && (prev.t === 'num' || prev.t === 'rp')) pushOp('*');
      ops.push(tk);
    } else if (tk.t === 'op') {
      const unary = tk.v === '-' && (!prev || prev.t === 'op' || prev.t === 'lp');
      if (unary) pushOp('neg');
      else if (tk.v === '+' && (!prev || prev.t === 'op' || prev.t === 'lp')) {
        /* unary plus: ignore */
      } else if (tk.v === '%') {
        const next = toks[ti + 1];
        if (next && (next.t === 'num' || next.t === 'lp' || next.t === 'fn')) pushOp('mod');
        else output.push('pct'); // postfix percent
      } else pushOp(tk.v);
    } else if (tk.t === 'lp') {
      if (prev && (prev.t === 'num' || prev.t === 'rp')) pushOp('*');
      ops.push(tk);
    } else {
      while (ops.length && ops[ops.length - 1].t !== 'lp') output.push(popOp());
      if (!ops.length) throw new Error('Mismatched parentheses');
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === 'fn') output.push(`fn:${(ops.pop() as { v: string }).v}`);
    }
    prev = tk;
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o.t === 'lp') throw new Error('Mismatched parentheses');
    output.push(o.t === 'fn' ? `fn:${o.v}` : (o as { v: string }).v);
  }

  function popOp(): string {
    const o = ops.pop()!;
    return o.t === 'fn' ? `fn:${o.v}` : (o as { v: string }).v;
  }
  function pushOp(op: string) {
    // prefix operators never pop anything off the stack
    while (op !== 'neg' && ops.length) {
      const top = ops[ops.length - 1];
      if (top.t === 'fn') {
        output.push(popOp());
        continue;
      }
      if (top.t !== 'op') break;
      const tp = PREC[top.v];
      const p = PREC[op];
      if (tp > p || (tp === p && !RIGHT.has(op))) output.push(popOp());
      else break;
    }
    ops.push({ t: 'op', v: op });
  }

  const st: number[] = [];
  for (const x of output) {
    if (typeof x === 'number') {
      st.push(x);
      continue;
    }
    if (x.startsWith('fn:')) {
      const a = st.pop();
      if (a === undefined) throw new Error('Missing argument');
      st.push(FNS[x.slice(3)](a));
      continue;
    }
    if (x === 'neg') {
      const a = st.pop();
      if (a === undefined) throw new Error('Syntax error');
      st.push(-a);
      continue;
    }
    if (x === 'pct') {
      const a = st.pop();
      if (a === undefined) throw new Error('Syntax error');
      st.push(a / 100);
      continue;
    }
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined) throw new Error('Syntax error');
    switch (x) {
      case '+':
        st.push(a + b);
        break;
      case '-':
        st.push(a - b);
        break;
      case '*':
        st.push(a * b);
        break;
      case '/':
        if (b === 0) throw new Error('Division by zero');
        st.push(a / b);
        break;
      case '^':
        st.push(Math.pow(a, b));
        break;
      case 'mod':
        st.push(a % b);
        break;
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error('Error');
  return st[0];
}

export function formatNumber(n: number, maxDigits = 12): string {
  if (!Number.isFinite(n)) return 'Error';
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  const r = Number(n.toPrecision(maxDigits));
  return r.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export function looksLikeMath(q: string): boolean {
  return /^[\d\s.+\-*/×÷^%()πe]+$|^(sqrt|sin|cos|tan|log|ln|abs)\(/i.test(q.trim()) && /\d/.test(q) && /[+\-*/×÷^%(]/.test(q);
}
