/**
 * Pure helpers for AI-powered semantic expense filtering.
 *
 * The chat service asks a cheap model to pick which expenses match a natural-language
 * keyword ("beer", "пиво", "coffee"). Small models cannot reliably echo back 36-char
 * UUIDs, so we number the candidate list and ask the model for the matching INDICES
 * (small integers echo reliably), then map them back server-side. A deterministic
 * substring pass is unioned in as insurance so exact / same-language matches never
 * depend on the model.
 *
 * Everything here is pure and unit-tested — the only non-deterministic part (the LLM
 * call itself) lives in ChatService.
 */

export interface FilterExpense {
  id: string;
  description?: string | null;
  merchant?: string | null;
  category?: string | null;
  amount: number;
  currencyCode?: string | null;
}

export interface RawItem {
  id: string;
  description?: string | null;
  canonicalName?: string | null;
  totalPrice: number | string;
}

export interface RawExpenseForUnits {
  id: string;
  amount: number;
  currencyCode?: string | null;
  description?: string | null;
  merchant?: string | null;
  category?: string | null; // category NAME, not the relation object
  date?: string;
  items?: RawItem[] | null;
}

/** A searchable unit: either a whole (non-itemized) expense or a single receipt line item. */
export interface SearchUnit extends FilterExpense {
  expenseId: string;
  isItem: boolean;
  date?: string;
}

/**
 * Flatten expenses into searchable units so a product query ("beer") can match line
 * items *inside* a grocery receipt, not just the receipt's top-level description.
 *
 * - An expense WITH line items → one unit per item, amount = item.totalPrice. This is
 *   what makes the total correct: a 150 zł Biedronka receipt contributes only its
 *   49.90 zł beer line, never the whole receipt.
 * - An expense WITHOUT items → one unit for the expense itself (amount = expense.amount),
 *   so a standalone "Beer" expense still counts.
 *
 * `convert` applies FX so every unit lands in the display currency (same rates the
 * caller already resolved). Kept pure/testable by injecting the converter.
 */
export function buildSearchUnits(
  expenses: RawExpenseForUnits[],
  convert: (amount: number, fromCurrency: string | null | undefined) => { amount: number; currencyCode: string },
): SearchUnit[] {
  const units: SearchUnit[] = [];
  for (const e of expenses) {
    const items = (e.items ?? []).filter((it): it is RawItem => it != null);
    if (items.length > 0) {
      for (const it of items) {
        const c = convert(Number(it.totalPrice) || 0, e.currencyCode);
        units.push({
          id: it.id,
          expenseId: e.id,
          isItem: true,
          description: (it.canonicalName && it.canonicalName.trim()) || it.description || null,
          merchant: e.merchant ?? null,
          category: e.category ?? null,
          amount: c.amount,
          currencyCode: c.currencyCode,
          date: e.date,
        });
      }
    } else {
      const c = convert(Number(e.amount) || 0, e.currencyCode);
      units.push({
        id: e.id,
        expenseId: e.id,
        isItem: false,
        description: e.description ?? null,
        merchant: e.merchant ?? null,
        category: e.category ?? null,
        amount: c.amount,
        currencyCode: c.currencyCode,
        date: e.date,
      });
    }
  }
  return units;
}

/**
 * Build a compact, 1-based numbered candidate list for the model to scan:
 *   `1. Żywiec 6-pack [Biedronka] (Groceries)`
 * Empty descriptions fall back to merchant / category so the row still carries signal.
 */
export function buildCandidateLines(expenses: FilterExpense[]): string {
  return expenses
    .map((e, i) => {
      const desc = (e.description ?? '').trim() || '(no description)';
      const parts = [`${i + 1}. ${desc}`];
      if (e.merchant && e.merchant.trim()) parts.push(`[${e.merchant.trim()}]`);
      if (e.category && e.category.trim()) parts.push(`(${e.category.trim()})`);
      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Robustly parse the model's response into a set of valid 1-based indices.
 * Accepts `{"indices":[1,2]}`, a bare `[1,2]` array, or free text containing numbers.
 * Any index outside `[1, count]` is discarded (guards against hallucinated numbers).
 */
export function parseMatchedIndices(raw: string, count: number): Set<number> {
  const valid = new Set<number>();
  if (!raw || count <= 0) return valid;

  const add = (n: unknown) => {
    const idx = typeof n === 'number' ? n : parseInt(String(n), 10);
    if (Number.isInteger(idx) && idx >= 1 && idx <= count) valid.add(idx);
  };

  let parsedFromJson = false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach(add);
      parsedFromJson = true;
    } else if (parsed && typeof parsed === 'object') {
      const arr =
        (Array.isArray(parsed.indices) && parsed.indices) ||
        (Array.isArray(parsed.ids) && parsed.ids) ||
        (Array.isArray(parsed.matches) && parsed.matches) ||
        null;
      if (arr) {
        arr.forEach(add);
        parsedFromJson = true;
      }
    }
  } catch {
    // fall through to regex
  }

  // Regex fallback only when JSON gave us nothing usable (e.g. truncated output).
  if (!parsedFromJson && valid.size === 0) {
    const nums = raw.match(/\d+/g);
    if (nums) nums.forEach(add);
  }

  return valid;
}

/** Case/locale-insensitive substring match on description / merchant / category. */
export function deterministicMatchIndices(expenses: FilterExpense[], keyword: string): Set<number> {
  const matched = new Set<number>();
  const needle = keyword.trim().toLocaleLowerCase();
  if (!needle) return matched;
  expenses.forEach((e, i) => {
    const haystack = [e.description, e.merchant, e.category]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    if (haystack.includes(needle)) matched.add(i + 1);
  });
  return matched;
}

/** Select expenses by a set of 1-based indices, preserving original order. */
export function selectByIndices<T>(expenses: T[], indices: Set<number>): T[] {
  return expenses.filter((_, i) => indices.has(i + 1));
}

/** Per-currency totals, rounded to cents. */
export function computeTotalsByCurrency(expenses: FilterExpense[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of expenses) {
    const cur = e.currencyCode || 'USD';
    totals[cur] = Math.round(((totals[cur] || 0) + e.amount) * 100) / 100;
  }
  return totals;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  count: number;
  currencyCode: string;
}

/**
 * Per-(category, currency) breakdown, sorted by amount desc. Same shape the get_expenses
 * tool produces, so the narration model sees a consistent structure after filtering.
 */
export function computeCategoryTotals(expenses: FilterExpense[]): CategoryTotal[] {
  const breakdown: Record<string, { amount: number; count: number; currency: string }> = {};
  for (const e of expenses) {
    const cur = e.currencyCode || 'USD';
    const key = `${e.category || 'Uncategorized'}|${cur}`;
    if (!breakdown[key]) breakdown[key] = { amount: 0, count: 0, currency: cur };
    breakdown[key].amount += e.amount;
    breakdown[key].count += 1;
  }
  return Object.entries(breakdown)
    .map(([key, val]) => ({
      category: key.split('|')[0],
      amount: Math.round(val.amount * 100) / 100,
      count: val.count,
      currencyCode: val.currency,
    }))
    .sort((a, b) => b.amount - a.amount);
}
