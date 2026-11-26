export type AmountExpressionResult =
  | { ok: true; value: number; isExpression: boolean }
  | { ok: false; reason: 'empty' | 'invalid' | 'divide_by_zero' };

type Token = { t: 'num'; v: number } | { t: 'op'; v: string };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === ' ') {
      i++;
    } else if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.,]/.test(src[j])) j++;
      const raw = src.slice(i, j).replace(/,/g, '.');
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) return null;
      tokens.push({ t: 'num', v: parseFloat(raw) });
      i = j;
    } else if ('+-*/()'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
    } else if (c === '×' || c === '−' || c === '÷') {
      tokens.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : '-' });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

/** Safe arithmetic evaluator for amount fields. Never uses eval. */
export function evaluateAmountExpression(input: string, decimals = 2): AmountExpressionResult {
  const src = (input ?? '').trim();
  if (!src) return { ok: false, reason: 'empty' };
  const parsed = tokenize(src);
  if (!parsed || parsed.length === 0) return { ok: false, reason: 'invalid' };
  const tokens: Token[] = parsed;

  let pos = 0;
  let divZero = false;
  const isOp = (v: string) => {
    const tok = tokens[pos];
    return !!tok && tok.t === 'op' && tok.v === v;
  };
  const takeOp = () => (tokens[pos++] as { v: string }).v;

  function expr(): number {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = takeOp();
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function term(): number {
    let left = factor();
    while (isOp('*') || isOp('/')) {
      const op = takeOp();
      const right = factor();
      if (op === '/' && right === 0) divZero = true;
      left = op === '*' ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  }
  function factor(): number {
    if (isOp('-')) {
      pos++;
      return -factor();
    }
    if (isOp('+')) {
      pos++;
      return factor();
    }
    const tok = tokens[pos];
    if (!tok) throw new Error('eof');
    if (tok.t === 'num') {
      pos++;
      return tok.v;
    }
    if (isOp('(')) {
      pos++;
      const v = expr();
      if (!isOp(')')) throw new Error('paren');
      pos++;
      return v;
    }
    throw new Error('unexpected');
  }

  let value: number;
  try {
    value = expr();
    if (pos !== tokens.length) return { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (divZero) return { ok: false, reason: 'divide_by_zero' };
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
  const f = Math.pow(10, decimals);
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
  const isExpression = tokens.length > 1 || tokens[0].t !== 'num';
  return { ok: true, value: rounded === 0 ? 0 : rounded, isExpression };
}
