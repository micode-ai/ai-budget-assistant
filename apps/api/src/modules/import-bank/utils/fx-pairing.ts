import type { ImportRow } from '@budget/shared-types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FX_KEYWORDS = [/wymiana/i, /przewalutowanie/i, /konwersja/i, /exchange/i, /\bfx\b/i, /kantor/i];

export function pairFxRows(rows: ImportRow[], bankId: string): ImportRow[] {
  const byDate = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const arr = byDate.get(r.date) ?? [];
    arr.push(r);
    byDate.set(r.date, arr);
  }

  const paired = new Set<number>();
  const out: ImportRow[] = [];

  for (const [date, group] of byDate.entries()) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (paired.has(a.idx)) continue;

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (paired.has(b.idx)) continue;
        if (a.kind === b.kind) continue;
        if (a.kind === 'fx' || b.kind === 'fx') continue;

        const differentCurrency = a.currencyCode !== b.currencyCode;
        // Per spec edge: same currency → skip pairing entirely (even with FX keyword)
        if (!differentCurrency) continue;

        const out_ = a.kind === 'expense' ? a : b;
        const in_ = a.kind === 'income' ? a : b;

        paired.add(a.idx);
        paired.add(b.idx);

        out.push({
          idx: a.idx,
          kind: 'fx',
          date,
          amount: out_.amount,
          currencyCode: out_.currencyCode,
          description: out_.description || in_.description,
          externalRef: `bank:${bankId}:fx:${date}:${out_.amount}:${in_.amount}`,
          alreadyImported: false,
          fxFromCurrency: out_.currencyCode,
          fxFromAmount: out_.amount,
          fxToCurrency: in_.currencyCode,
          fxToAmount: in_.amount,
          fxRate: in_.amount > 0 ? in_.amount / out_.amount : undefined,
        });
        break;
      }
    }
  }

  for (const r of rows) {
    if (!paired.has(r.idx)) out.push(r);
  }

  return out.sort((a, b) => a.idx - b.idx);
}
