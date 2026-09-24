/**
 * Validates the model's answer for POST /ai/categorize-uncategorized.
 *
 * Same never-trust-only-drop posture as ReceiptCategorySplitService: the model
 * speaks in candidate INDEXES and category NAMES only, and anything it invents
 * — an unknown name, an out-of-range index, a proposal too small to be a real
 * group — is dropped rather than repaired. What is dropped ends up in
 * `unassigned`, for the user to decide.
 */

export const MAX_NEW_CATEGORIES = 5;
/** A "new category" for one expense is exactly the sprawl this feature exists to prevent. */
export const MIN_EXPENSES_PER_NEW_CATEGORY = 2;

export interface ValidatedCategorization {
  /** candidate index → existing category id */
  assignments: Map<number, string>;
  proposals: Array<{ name: string; indexes: number[] }>;
  unassigned: number[];
}

export function normalizeProposalName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const collapsed = name.trim().replace(/\s+/g, ' ');
  if (collapsed.length < 2 || collapsed.length > 30) return null;
  if (!/\p{L}/u.test(collapsed)) return null;
  return collapsed;
}

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

function isValidIndex(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
}

export function validateCategorization(
  raw: unknown,
  candidateCount: number,
  categories: Array<{ id: string; name: string }>,
): ValidatedCategorization {
  // A Map, not an object: "constructor" must not resolve to a category.
  const idByName = new Map<string, string>();
  for (const c of categories) idByName.set(key(c.name), c.id);

  const assignments = new Map<number, string>();
  const claimed = new Set<number>();
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // Assignments first, so an existing category wins a contested index.
  const rawAssignments = Array.isArray(body.assignments) ? body.assignments : [];
  for (const a of rawAssignments) {
    if (!a || typeof a !== 'object') continue;
    const { index, categoryName } = a as Record<string, unknown>;
    if (!isValidIndex(index, candidateCount) || claimed.has(index)) continue;
    if (typeof categoryName !== 'string') continue;
    const id = idByName.get(key(categoryName));
    if (!id) continue;
    assignments.set(index, id);
    claimed.add(index);
  }

  // Proposals: merge same-named ones, fold existing names into assignments.
  const merged: Array<{ name: string; indexes: number[] }> = [];
  const rawProposals = Array.isArray(body.newCategories) ? body.newCategories : [];
  for (const p of rawProposals) {
    if (!p || typeof p !== 'object') continue;
    const { name, indexes } = p as Record<string, unknown>;
    const normalized = normalizeProposalName(name);
    if (!normalized || !Array.isArray(indexes)) continue;
    const free = indexes.filter(
      (i): i is number => isValidIndex(i, candidateCount) && !claimed.has(i),
    );

    const existingId = idByName.get(key(normalized));
    if (existingId) {
      for (const i of free) {
        assignments.set(i, existingId);
        claimed.add(i);
      }
      continue;
    }

    const same = merged.find((m) => key(m.name) === key(normalized));
    const target = same ?? { name: normalized, indexes: [] };
    if (!same) merged.push(target);
    for (const i of free) {
      if (!target.indexes.includes(i)) target.indexes.push(i);
    }
  }

  const proposals: Array<{ name: string; indexes: number[] }> = [];
  for (const m of merged) {
    if (proposals.length >= MAX_NEW_CATEGORIES) break;
    const indexes = m.indexes.filter((i) => !claimed.has(i));
    if (indexes.length < MIN_EXPENSES_PER_NEW_CATEGORY) continue;
    indexes.forEach((i) => claimed.add(i));
    proposals.push({ name: m.name, indexes });
  }

  const unassigned: number[] = [];
  for (let i = 0; i < candidateCount; i++) if (!claimed.has(i)) unassigned.push(i);

  return { assignments, proposals, unassigned };
}

/** A merchant as lowercase words; anything that is not a letter or digit separates them. */
export function merchantWords(merchant: string | null | undefined): string[] {
  return (merchant ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

const isPrefix = (short: string[], long: string[]) => short.every((w, i) => long[i] === w);

/**
 * Joins an unassigned expense to a suggested group when its merchant is the
 * same store as one already in that group — equal words, or one word list
 * extending the other ("leroy merlin gdynia" → "leroy merlin"). The model
 * misses these variants between runs; this makes them deterministic.
 *
 * Deliberately narrow: names match when their words are equal, or when a name
 * of at least TWO words is extended by more words — a one-word name is never
 * extended, because "uber" → "uber eats" is a different service, not a branch.
 * The first word must have at least three letters, and a merchant matching
 * more than one group is left alone — a wrong auto-grouping is worse than one
 * the user picks by hand.
 */
export function matchByMerchant(
  unassigned: Array<{ id: string; merchant: string | null }>,
  groups: Array<{ key: string; merchants: Array<string | null> }>,
): Map<string, string> {
  const groupWords = groups.map((g) => ({
    key: g.key,
    words: g.merchants.map(merchantWords).filter((w) => w.length > 0),
  }));
  const result = new Map<string, string>();
  for (const e of unassigned) {
    const words = merchantWords(e.merchant);
    if (words.length === 0) continue;
    const matches = groupWords.filter((g) =>
      g.words.some((gw) => {
        const [short, long] = gw.length <= words.length ? [gw, words] : [words, gw];
        const extendsOrEquals = short.length === long.length || short.length >= 2;
        return short[0].length >= 3 && extendsOrEquals && isPrefix(short, long);
      }),
    );
    if (matches.length === 1) result.set(e.id, matches[0].key);
  }
  return result;
}
