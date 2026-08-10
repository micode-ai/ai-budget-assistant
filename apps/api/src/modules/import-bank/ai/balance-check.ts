import type { ExtractionWarning } from '@budget/shared-types';
import type { ExtractedRow } from './statement-ai.validator';

// The filler between the label and the number must not swallow a leading
// minus sign (so the capture group's own `-?` can see it) or cross a
// newline (so a label on one line can't reach down to an unrelated number
// several lines below). Global (`g`) so every occurrence in a multi-page
// statement can be found, not just the first.
const OPENING = /(saldo\s+pocz[aą]tkowe|opening\s+balance|anfangssaldo|saldo\s+inicial|solde\s+initial)[^\d\n-]{0,20}(-?[\d\s.,]+)/gi;
const CLOSING = /(saldo\s+ko[nń]cowe|closing\s+balance|endsaldo|saldo\s+final|solde\s+final)[^\d\n-]{0,20}(-?[\d\s.,]+)/gi;

/**
 * Parse a money token that may use either a comma or a dot decimal
 * separator, with or without thousands grouping.
 *
 * When BOTH separator characters appear, the LAST one is the decimal
 * separator and the other groups thousands (`1.234,56` and `1,234.56` both
 * -> `1234.56`) — unambiguous, since a number has at most one decimal point.
 *
 * When only ONE separator character appears, its position can't disambiguate
 * "1,000" (one thousand, or 1.000?) on its own. Money has exactly two decimal
 * places, so instead:
 *   - it occurs more than once -> must be thousands grouping (a number has at
 *     most one decimal separator)
 *   - it occurs exactly once, followed by exactly 3 digits -> thousands
 *     grouping (a decimal amount never carries 3 decimal places)
 *   - otherwise -> it's the decimal separator
 */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/\s| /g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.';
    const lastIndex = lastComma !== -1 ? lastComma : lastDot;
    const occurrences = cleaned.split(sep).length - 1;
    const digitsAfter = cleaned.length - lastIndex - 1;
    const isThousands = occurrences > 1 || digitsAfter === 3;
    normalized = isThousands ? cleaned.split(sep).join('') : cleaned.replace(sep, '.');
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : NaN;
}

export function findStatementBalances(text: string): { opening: number; closing: number } | null {
  // Multi-page statements print a running balance on every page. The
  // statement's true totals are the FIRST "opening" occurrence and the LAST
  // "closing" occurrence. `matchAll` (rather than repeated `.exec()`) is used
  // because it does not mutate the source regex's `lastIndex`.
  const openingMatches = [...text.matchAll(OPENING)];
  const closingMatches = [...text.matchAll(CLOSING)];
  if (openingMatches.length === 0 || closingMatches.length === 0) return null;

  const o = parseMoney(openingMatches[0][2]);
  const c = parseMoney(closingMatches[closingMatches.length - 1][2]);
  if (Number.isNaN(o) || Number.isNaN(c)) return null;
  return { opening: o, closing: c };
}

/**
 * Confirm the extracted rows account for the whole statement.
 *
 * A missing balance is NOT treated as success — it returns 'no_balance', which
 * the client renders as the same "check before importing" warning. The
 * extraction path can hallucinate or skip rows, so silence is never reported
 * as completeness.
 */
export function reconcile(
  rows: ExtractedRow[],
  balances: { opening: number; closing: number } | null,
): ExtractionWarning | undefined {
  if (!balances) return 'no_balance';

  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  const expected = balances.closing - balances.opening;
  // One cent of tolerance absorbs float drift and per-row rounding.
  return Math.abs(sum - expected) <= 0.01 ? undefined : 'balance_mismatch';
}
