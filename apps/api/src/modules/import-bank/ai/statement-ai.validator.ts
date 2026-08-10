import type { ColumnMapping } from '@budget/shared-types';

export interface InferredMapping {
  mapping: ColumnMapping;
  amountFormat: 'polish' | 'standard';
  dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  bankLabel?: string;
}

export interface ExtractedRow {
  date: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
}

const AMOUNT_FORMATS = ['polish', 'standard'];
const DATE_FORMATS = ['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * Currencies this validator will accept from the model. Must stay in step
 * with the `Currency` union in `packages/shared-types/src/entities/primitives.ts`
 * (currently `'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'RUB' | 'BYN'`) —
 * apps/api may only `import type` that module (no runtime import of a
 * workspace package), so this is a hand-kept runtime copy, not an import.
 * A model can emit any three uppercase letters; a code with no FX-rate
 * lookup anywhere downstream must be dropped here rather than persisted, or
 * it silently books an amount nothing can convert or display correctly.
 * Keep this list's members identical to that union's — CLAUDE.md's own
 * currency summary line is stale (it omits `BYN`); the source of truth is
 * the `Currency` type itself, not that doc.
 */
const SUPPORTED_AI_CURRENCIES = new Set(['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN']);

/** Strip a ```json fence if the model wrapped its answer in one. */
function parseJson(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate a mapping response against the file's ACTUAL header cells.
 *
 * This is the guard that makes an amount hallucination structurally
 * impossible on the CSV/XLSX path: the model only ever names columns, and a
 * name it invented is rejected outright. Matching is EXACT — a
 * case-insensitive or trimmed match would let "data operacji" through for a
 * header that is really "Data operacji", and UniversalParser looks rows up by
 * exact key, so every row would then parse as null.
 *
 * Rejection is wholesale, including for optional columns. Silently dropping an
 * invented `currency` would produce a plausible-looking import in the wrong
 * currency, which is worse than falling back to the manual mapper.
 */
export function validateMappingResponse(raw: string, headers: string[]): InferredMapping | null {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const known = new Set(headers);
  const isKnown = (v: unknown): v is string => typeof v === 'string' && known.has(v);

  if (!isKnown(parsed.date) || !isKnown(parsed.description)) return null;

  let amount: ColumnMapping['amount'];
  if (isKnown(parsed.amount)) {
    amount = parsed.amount;
  } else if (
    parsed.amount &&
    typeof parsed.amount === 'object' &&
    isKnown(parsed.amount.debit) &&
    isKnown(parsed.amount.credit)
  ) {
    amount = { debit: parsed.amount.debit, credit: parsed.amount.credit };
  } else {
    return null;
  }

  if (parsed.currency !== undefined && parsed.currency !== null && !isKnown(parsed.currency)) return null;
  if (parsed.counterparty !== undefined && parsed.counterparty !== null && !isKnown(parsed.counterparty)) return null;

  if (!AMOUNT_FORMATS.includes(parsed.amountFormat)) return null;
  if (!DATE_FORMATS.includes(parsed.dateFormat)) return null;

  const mapping: ColumnMapping = {
    date: parsed.date,
    amount,
    description: parsed.description,
    ...(isKnown(parsed.currency) ? { currency: parsed.currency } : {}),
    ...(isKnown(parsed.counterparty) ? { counterparty: parsed.counterparty } : {}),
  };

  return {
    mapping,
    amountFormat: parsed.amountFormat,
    dateFormat: parsed.dateFormat,
    ...(typeof parsed.bankLabel === 'string' && parsed.bankLabel.trim()
      ? { bankLabel: parsed.bankLabel.trim().slice(0, 64) }
      : {}),
  };
}

/**
 * Validate extracted PDF rows. Unlike the mapping path this one CAN receive
 * hallucinated values, so every row is checked independently and a bad row is
 * dropped rather than failing the batch — a statement page with one unreadable
 * line should still import the other 40. Completeness is separately guarded by
 * the balance reconciliation in balance-check.ts.
 */
export function validateExtractedRows(raw: string): ExtractedRow[] {
  const parsed = parseJson(raw);
  const rows = parsed?.rows;
  if (!Array.isArray(rows)) return [];

  const out: ExtractedRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) continue;
    if (Number.isNaN(Date.parse(r.date))) continue;
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) continue;
    if (typeof r.currencyCode !== 'string' || !ISO_CURRENCY.test(r.currencyCode)) continue;
    if (!SUPPORTED_AI_CURRENCIES.has(r.currencyCode)) continue;
    const description = typeof r.description === 'string' ? r.description.trim() : '';
    const merchant = typeof r.merchant === 'string' && r.merchant.trim() ? r.merchant.trim() : undefined;
    if (!description && !merchant) continue;
    out.push({
      date: r.date,
      amount: r.amount,
      currencyCode: r.currencyCode,
      description,
      ...(merchant ? { merchant } : {}),
    });
  }
  return out;
}
