# Categorize Uncategorized Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One button proposes categories for all of an account's uncategorized expenses — reusing existing categories and adding only a handful of shared new ones — and applies them after the user reviews, on native and on desktop web.

**Architecture:** A read-only `POST /ai/categorize-uncategorized` resolves candidates by merchant rules first, then sends the rest to the cheap model in ONE call; a pure validator enforces the anti-sprawl rules (≥ 2 expenses per new category, ≤ 5 new). The client holds the review in a pure reducer, renders one shared `CategorizeReview` in a mobile route and a desktop dialog, and applies through the existing `createCategory` + `bulkUpdateExpenses` store actions. Bulk category updates now teach merchant rules; the receipt prompt may answer `null`.

**Tech Stack:** NestJS 10 + Prisma 5 + Redis (`CacheService`), OpenAI SDK (`resolveCheapModel`), Expo 54 / React Native 0.81 / react-native-web, Zustand, Jest (`apps/api`: ts-jest; `apps/mobile`: jest-expo).

**Spec:** `docs/superpowers/specs/2026-09-24-categorize-uncategorized-design.md`

## Global Constraints

- The model never sees or returns an id: input is indexes + category NAMES, output `{assignments:[{index,categoryName}], newCategories:[{name,indexes}]}`.
- A new category survives only if it covers **≥ 2** expenses; at most **5** new per pass; names 2–30 chars with ≥ 1 letter.
- An assignment to an existing category wins a contested index.
- The deposit category (`isDepositCategoryName`) never appears in the prompt or the valid-name set.
- `AI_CATEGORIZE_MAX_PER_DAY` default **5**, NaN-guarded, per account, Redis key `aicat:{accountId}:{YYYY-MM-DD}`, TTL 24 h, outside the monthly AI quota; incremented only after the model call returns.
- The endpoint writes nothing. Nothing creates a category before the user presses Apply.
- Candidates: `accountId`, `categoryId: null`, `isDeleted: false`, `isPlanned: false`, `isSplitReceivable: false`, `isDebt: false`, `encryptedPayload: null`; most recent 100 by `date desc`.
- Names are requested in the account OWNER's language (`accountMember.findFirst({ where: { accountId, role: 'owner' } })`, never sorted).
- API code must not import runtime values from `@budget/shared-*` (`import type` only).
- Fire-and-forget side effects use `logFireAndForget(this.logger, 'Class.what')`, never `.catch(() => {})`.
- New i18n keys go into ALL 9 locales (en, de, es, fr, pl, ru, ua, be, nl).
- A bottom-anchored `Modal` adds `useSafeAreaInsets().bottom` to its padding.
- Web alerts go through `showAlert` from `@/utils/alert`, never `Alert.alert`.
- Viewers never see the banner (`useAccountStore(s => s.canEdit())`).
- No `git push` without the owner's explicit OK; commit locally.

## Spec deltas (decided while planning — the spec is updated in Task 1)

- The response also carries `expenses: CategorizeCandidateExpense[]` (id, clientId, merchant, description, amount, currency, date) so the review can render rows the client has not loaded (web pages its list) and resolve local ids.
- `CategorizeSuggestionGroup.source` is dropped — nothing in the UI reads it.
- No second entry point inside the "without category" filter: the banner sits directly above that filter on both screens, so a button inside it would be a duplicate.
- No offline detection (the app has no network-status hook): a failed request shows the error state with Retry.

## Review Focus

- **Two members categorize at once / the list changes during review** — an expense categorized elsewhere in between must not be re-uncategorized; `bulkUpdate` only sets the category, so it just overwrites with the reviewed choice. Acceptable; no test beyond Task 5's.
- **A draft renamed to an existing category's name** — `categoryStore.createCategory` returns the existing row by name, so it must not create a duplicate (and must not count as created). Test in Task 7.
- **A draft renamed to empty/whitespace** — must not create a nameless category; its rows are skipped. Test in Task 6.
- **The server returns an expense the client does not hold locally (web, or a row beyond the loaded page)** — `resolveLocalExpenseId` falls back to the server id, which `bulkUpdate` resolves server-side. Test in Task 7.
- **Model returns a proposal equal to an existing category but in different case / with extra spaces** — folded into the existing category, never created. Test in Task 2.

## File Structure

**Create**
- `apps/api/src/modules/ai/utils/categorize-suggestions.util.ts` — pure validator (`validateCategorization`) + constants.
- `apps/api/src/modules/ai/utils/categorize-suggestions.util.spec.ts`
- `apps/api/src/modules/ai/services/categorize-suggestions.service.ts` — candidates, rules, model, quota, logging.
- `apps/api/src/modules/ai/services/categorize-suggestions.service.spec.ts`
- `apps/mobile/src/features/categorize/categorizeReview.ts` — pure reducer, group derivation, apply plan.
- `apps/mobile/src/features/categorize/applyCategorization.ts` — apply + local-id resolution.
- `apps/mobile/src/features/categorize/useCategorizeSuggestions.ts` — fetch + reducer + apply hook.
- `apps/mobile/src/features/categorize/__tests__/categorizeReview.test.ts`
- `apps/mobile/src/features/categorize/__tests__/applyCategorization.test.ts`
- `apps/mobile/src/components/categorize/CategorizeReview.tsx` — shared review content.
- `apps/mobile/src/components/categorize/CategoryTargetPicker.tsx` — row/group target picker sheet.
- `apps/mobile/src/components/categorize/UncategorizedBanner.tsx`
- `apps/mobile/src/components/expenses/desktop/CategorizeDialog.tsx` — desktop host.
- `apps/mobile/app/expense/categorize.tsx` — mobile host route.
- `docs/wiki/features/categorize-uncategorized.md`

**Modify**
- `packages/shared-types/src/dto/ai.ts` — DTOs.
- `apps/api/src/modules/ai/ai.controller.ts`, `apps/api/src/modules/ai/ai.module.ts`
- `apps/api/src/modules/ai/services/ocr.service.ts:324` — prompt line.
- `apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts` — null-suggestion test.
- `apps/api/src/modules/expenses/expense-bulk.service.ts` (+ `.spec.ts`) — rule learning.
- `apps/mobile/src/services/ai.api.ts` — client method.
- `apps/mobile/app/_layout.tsx` — route header.
- `apps/mobile/src/components/expenses/ExpensesMobile.tsx`, `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`, `apps/mobile/src/components/expenses/desktop/ExpensesDesktopDialogs.tsx`
- `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`
- `docs/superpowers/specs/2026-09-24-categorize-uncategorized-design.md`, `docs/wiki/log.md`, `docs/wiki/features/receipt-category-split.md` (cross-link), `user_docs/*/` expenses page.

---

### Task 1: Shared DTOs and spec deltas

**Files:**
- Modify: `packages/shared-types/src/dto/ai.ts` (append)
- Modify: `docs/superpowers/specs/2026-09-24-categorize-uncategorized-design.md`

**Interfaces:**
- Produces: `CategorizeCandidateExpense`, `CategorizeSuggestionGroup`, `CategorizeSuggestionsResponse` exported from `@budget/shared-types` (`dto/index.ts` already does `export * from './ai'`).

- [ ] **Step 1: Append the DTOs to `packages/shared-types/src/dto/ai.ts`**

```ts
/** One uncategorized expense offered for review by POST /ai/categorize-uncategorized. */
export interface CategorizeCandidateExpense {
  /** Server PK. */
  id: string;
  /** The creating device's local id, when it had one — lets a client find its own row. */
  clientId: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  currencyCode: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * A suggested destination for some expenses. Exactly one of `categoryId` /
 * `proposedName` is set: an existing category, or a new one the user may create.
 */
export interface CategorizeSuggestionGroup {
  categoryId: string | null;
  proposedName: string | null;
  /** Server PKs, each present in `expenses`. */
  expenseIds: string[];
}

export interface CategorizeSuggestionsResponse {
  expenses: CategorizeCandidateExpense[];
  groups: CategorizeSuggestionGroup[];
  /** Server PKs nothing confident was found for. */
  unassigned: string[];
  /** E2EE expenses the server cannot read and therefore skipped. */
  skippedEncrypted: number;
  /** Model passes left today for this account after this one. */
  remainingToday: number;
  /** True when the daily ceiling stopped the model step; rule-based groups are still returned. */
  limitReached: boolean;
}
```

- [ ] **Step 2: Record the deltas in the spec**

In the spec's `### POST /ai/categorize-uncategorized` response block, replace the `CategorizeSuggestionGroup`/`CategorizeSuggestionsResponse` sketch with the exact interfaces above, and add under **Entry points**:

```markdown
Planning deltas (2026-09-24): the response carries `expenses` so the review renders rows the client
has not loaded; `source` was dropped (nothing reads it); no second button inside the "without
category" filter (the banner sits directly above it); no offline detection — the app has no
network-status hook, so a failed request shows the error state with Retry.
```

- [ ] **Step 3: Typecheck shared-types**

Run: `npx tsc -p packages/shared-types --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/dto/ai.ts docs/superpowers/specs/2026-09-24-categorize-uncategorized-design.md
git commit -m "Add categorize-uncategorized DTOs"
```

---

### Task 2: Pure validator for the model's answer

**Files:**
- Create: `apps/api/src/modules/ai/utils/categorize-suggestions.util.ts`
- Test: `apps/api/src/modules/ai/utils/categorize-suggestions.util.spec.ts`

**Interfaces:**
- Produces:
  - `MAX_NEW_CATEGORIES = 5`, `MIN_EXPENSES_PER_NEW_CATEGORY = 2`
  - `validateCategorization(raw: unknown, candidateCount: number, categories: Array<{ id: string; name: string }>): ValidatedCategorization`
  - `interface ValidatedCategorization { assignments: Map<number, string> /* index → existing categoryId */; proposals: Array<{ name: string; indexes: number[] }>; unassigned: number[] }`
  - `normalizeProposalName(name: unknown): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  validateCategorization,
  normalizeProposalName,
  MAX_NEW_CATEGORIES,
} from './categorize-suggestions.util';

const CATS = [
  { id: 'c-tax', name: 'Tax' },
  { id: 'c-notary', name: 'Kancelaria' },
];

describe('validateCategorization', () => {
  it('maps assignments by name, case-insensitively', () => {
    const r = validateCategorization(
      { assignments: [{ index: 0, categoryName: 'tax' }] },
      2,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-tax');
    expect(r.unassigned).toEqual([1]);
  });

  it('drops invented names and out-of-range or non-integer indexes', () => {
    const r = validateCategorization(
      {
        assignments: [
          { index: 0, categoryName: 'Groceries' },
          { index: 7, categoryName: 'Tax' },
          { index: -1, categoryName: 'Tax' },
          { index: 1.5, categoryName: 'Tax' },
          { index: 'x', categoryName: 'Tax' },
        ],
      },
      2,
      CATS,
    );
    expect(r.assignments.size).toBe(0);
    expect(r.unassigned).toEqual([0, 1]);
  });

  it('does not treat Object.prototype keys as category names', () => {
    const r = validateCategorization(
      { assignments: [{ index: 0, categoryName: 'constructor' }] },
      1,
      CATS,
    );
    expect(r.assignments.size).toBe(0);
  });

  it('keeps a proposal covering two or more expenses', () => {
    const r = validateCategorization(
      { newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1, 2] }] },
      3,
      CATS,
    );
    expect(r.proposals).toEqual([{ name: 'Materiały budowlane', indexes: [0, 1, 2] }]);
    expect(r.unassigned).toEqual([]);
  });

  it('drops a single-expense proposal and leaves its expense unassigned', () => {
    const r = validateCategorization(
      { newCategories: [{ name: 'Podróże', indexes: [1] }] },
      2,
      CATS,
    );
    expect(r.proposals).toEqual([]);
    expect(r.unassigned).toEqual([0, 1]);
  });

  it('gives a contested index to the existing-category assignment', () => {
    const r = validateCategorization(
      {
        assignments: [{ index: 0, categoryName: 'Tax' }],
        newCategories: [{ name: 'Fees', indexes: [0, 1] }],
      },
      2,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-tax');
    // Only index 1 is left for "Fees", below the two-expense minimum.
    expect(r.proposals).toEqual([]);
    expect(r.unassigned).toEqual([1]);
  });

  it('folds a proposal that names an existing category into that category', () => {
    const r = validateCategorization(
      { newCategories: [{ name: '  kancelaria ', indexes: [0] }] },
      1,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-notary');
    expect(r.proposals).toEqual([]);
  });

  it('merges two proposals with the same name', () => {
    const r = validateCategorization(
      {
        newCategories: [
          { name: 'Podróże', indexes: [0] },
          { name: 'podróże', indexes: [1] },
        ],
      },
      2,
      CATS,
    );
    expect(r.proposals).toEqual([{ name: 'Podróże', indexes: [0, 1] }]);
  });

  it(`keeps at most ${MAX_NEW_CATEGORIES} proposals`, () => {
    const newCategories = Array.from({ length: 6 }, (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      indexes: [i * 2, i * 2 + 1],
    }));
    const r = validateCategorization({ newCategories }, 12, CATS);
    expect(r.proposals).toHaveLength(MAX_NEW_CATEGORIES);
    expect(r.unassigned).toEqual([10, 11]);
  });

  it('returns everything unassigned for garbage input', () => {
    expect(validateCategorization(null, 2, CATS).unassigned).toEqual([0, 1]);
    expect(validateCategorization({ assignments: 'x' }, 1, CATS).unassigned).toEqual([0]);
  });
});

describe('normalizeProposalName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeProposalName('  Opłaty   notarialne ')).toBe('Opłaty notarialne');
  });
  it('rejects too short, too long, letterless and non-strings', () => {
    expect(normalizeProposalName('A')).toBeNull();
    expect(normalizeProposalName('x'.repeat(31))).toBeNull();
    expect(normalizeProposalName('123 45')).toBeNull();
    expect(normalizeProposalName(42)).toBeNull();
  });
  it('accepts Cyrillic', () => {
    expect(normalizeProposalName('Стройматериалы')).toBe('Стройматериалы');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/ai/utils/categorize-suggestions.util.spec.ts`
Expected: FAIL — `Cannot find module './categorize-suggestions.util'`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/modules/ai/utils/categorize-suggestions.util.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/utils/categorize-suggestions.util.ts apps/api/src/modules/ai/utils/categorize-suggestions.util.spec.ts
git commit -m "Validate the model's categorization answer against the anti-sprawl rules"
```

---

### Task 3: `CategorizeSuggestionsService` and the endpoint

**Files:**
- Create: `apps/api/src/modules/ai/services/categorize-suggestions.service.ts`
- Test: `apps/api/src/modules/ai/services/categorize-suggestions.service.spec.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts` (add provider), `apps/api/src/modules/ai/ai.controller.ts` (inject + route)

**Interfaces:**
- Consumes: `validateCategorization` (Task 2); `CategorizeSuggestionsResponse` (Task 1, `import type`); `MerchantRulesService.getRulesMap(accountId): Promise<Map<string, string>>` (merchantNormalized → categoryId); `CacheService.get<T>(key)`, `CacheService.set(key, value, ttlSec)`; `isDepositCategoryName(name: string): boolean` from `common/utils/deposit-category`; `resolveCheapModel()`; `sanitizeForPrompt(text, maxLen)`.
- Produces: `CategorizeSuggestionsService.suggest(accountId: string): Promise<CategorizeSuggestionsResponse>`; route `POST /ai/categorize-uncategorized`.

- [ ] **Step 1: Write the failing tests**

```ts
import { CategorizeSuggestionsService } from './categorize-suggestions.service';

function expense(id: string, merchant: string | null, description = 'x') {
  return {
    id,
    clientId: `local-${id}`,
    merchant,
    description,
    amount: { toString: () => '10.50' },
    currencyCode: 'PLN',
    date: new Date('2026-09-20T00:00:00Z'),
    items: [],
  };
}

function makeService(opts: {
  candidates: ReturnType<typeof expense>[];
  categories?: Array<{ id: string; name: string }>;
  rules?: Map<string, string>;
  used?: number;
  modelAnswer?: unknown;
  modelThrows?: boolean;
}) {
  const prisma: any = {
    expense: {
      findMany: jest.fn().mockResolvedValue(opts.candidates),
      count: jest.fn().mockResolvedValue(0),
    },
    category: { findMany: jest.fn().mockResolvedValue(opts.categories ?? [{ id: 'c-tax', name: 'Tax' }]) },
    account: { findUnique: jest.fn().mockResolvedValue({ name: 'House' }) },
    accountMember: { findFirst: jest.fn().mockResolvedValue({ user: { language: 'pl' } }) },
  };
  const cache: any = {
    get: jest.fn().mockResolvedValue(opts.used ?? 0),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const merchantRules: any = { getRulesMap: jest.fn().mockResolvedValue(opts.rules ?? new Map()) };
  const config: any = { get: () => 'test-key' };
  const service = new CategorizeSuggestionsService(config, prisma, cache, merchantRules);
  const create = opts.modelThrows
    ? jest.fn().mockRejectedValue(new Error('openai down'))
    : jest.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(opts.modelAnswer ?? {}) } }],
      });
  (service as any).openai = { chat: { completions: { create } } };
  return { service, prisma, cache, create };
}

describe('CategorizeSuggestionsService.suggest', () => {
  it('returns an empty response without calling the model when nothing is uncategorized', async () => {
    const { service, create } = makeService({ candidates: [] });
    const r = await service.suggest('acc');
    expect(r.expenses).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('resolves by merchant rule without calling the model or spending a pass', async () => {
    const { service, create, cache } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', ' obi ')],
      rules: new Map([['obi', 'c-tax']]),
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([{ categoryId: 'c-tax', proposedName: null, expenseIds: ['e1', 'e2'] }]);
    expect(create).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('ignores a rule pointing at a category the account no longer has', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'OBI')],
      rules: new Map([['obi', 'c-deleted']]),
      modelAnswer: {},
    });
    await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('turns model output into groups and counts the pass', async () => {
    const { service, cache } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama'), expense('e3', null, 'Tax imns')],
      modelAnswer: {
        assignments: [{ index: 2, categoryName: 'Tax' }],
        newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1] }],
      },
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([
      { categoryId: 'c-tax', proposedName: null, expenseIds: ['e3'] },
      { categoryId: null, proposedName: 'Materiały budowlane', expenseIds: ['e1', 'e2'] },
    ]);
    expect(r.unassigned).toEqual([]);
    expect(r.expenses[0]).toEqual({
      id: 'e1', clientId: 'local-e1', merchant: 'OBI', description: 'x',
      amount: 10.5, currencyCode: 'PLN', date: '2026-09-20',
    });
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^aicat:acc:\d{4}-\d{2}-\d{2}$/), 1, 86400);
    expect(r.remainingToday).toBe(4);
  });

  it('keeps the deposit category out of the prompt and the valid names', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'Biedronka')],
      categories: [{ id: 'c-tax', name: 'Tax' }, { id: 'c-dep', name: 'Kaucja' }],
      modelAnswer: { assignments: [{ index: 0, categoryName: 'Kaucja' }] },
    });
    const r = await service.suggest('acc');
    const prompt: string = create.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain('Kaucja');
    expect(r.unassigned).toEqual(['e1']);
  });

  it('does not spend a pass when the model throws', async () => {
    const { service, cache } = makeService({ candidates: [expense('e1', 'OBI')], modelThrows: true });
    const r = await service.suggest('acc');
    expect(cache.set).not.toHaveBeenCalled();
    expect(r.unassigned).toEqual(['e1']);
  });

  it('skips the model at the daily ceiling but still returns rule groups', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama')],
      rules: new Map([['obi', 'c-tax']]),
      used: 5,
    });
    const r = await service.suggest('acc');
    expect(create).not.toHaveBeenCalled();
    expect(r.limitReached).toBe(true);
    expect(r.groups).toEqual([{ categoryId: 'c-tax', proposedName: null, expenseIds: ['e1'] }]);
    expect(r.unassigned).toEqual(['e2']);
    expect(r.remainingToday).toBe(0);
  });

  it('queries only real, readable, uncategorized expenses of the account', async () => {
    const { service, prisma } = makeService({ candidates: [] });
    await service.suggest('acc');
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      accountId: 'acc',
      categoryId: null,
      isDeleted: false,
      isPlanned: false,
      isSplitReceivable: false,
      isDebt: false,
      encryptedPayload: null,
    });
    expect(prisma.expense.findMany.mock.calls[0][0].take).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/ai/services/categorize-suggestions.service.spec.ts`
Expected: FAIL — `Cannot find module './categorize-suggestions.service'`.

- [ ] **Step 3: Implement the service**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  CategorizeCandidateExpense,
  CategorizeSuggestionGroup,
  CategorizeSuggestionsResponse,
} from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { MerchantRulesService } from '../../merchant-rules/merchant-rules.service';
import { isDepositCategoryName } from '../../../common/utils/deposit-category';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import {
  MAX_NEW_CATEGORIES,
  MIN_EXPENSES_PER_NEW_CATEGORY,
  validateCategorization,
} from '../utils/categorize-suggestions.util';

const MAX_CANDIDATES = 100;
const DAY_SECONDS = 24 * 60 * 60;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', pl: 'Polish', de: 'German', es: 'Spanish', fr: 'French',
  ru: 'Russian', ua: 'Ukrainian', be: 'Belarusian', nl: 'Dutch',
};

/** NaN-guarded; default 5 passes per account per day. */
function resolveDailyLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

const normalizeMerchant = (m: string | null) => (m ?? '').trim().toLowerCase();

/**
 * Proposes categories for an account's uncategorized expenses. READ-ONLY: it
 * writes nothing — the client creates categories and applies them only after
 * the user reviews. Cheapest first: learned merchant rules, then ONE model
 * call for the rest, so the model sees the whole batch and can group it into
 * a few shared categories instead of inventing one per expense.
 */
@Injectable()
export class CategorizeSuggestionsService {
  private readonly logger = new Logger(CategorizeSuggestionsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly merchantRules: MerchantRulesService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async suggest(accountId: string): Promise<CategorizeSuggestionsResponse> {
    const baseWhere = {
      accountId,
      categoryId: null,
      isDeleted: false,
      isPlanned: false,
      isSplitReceivable: false,
      isDebt: false,
    };
    const [rows, skippedEncrypted] = await Promise.all([
      this.prisma.expense.findMany({
        where: { ...baseWhere, encryptedPayload: null },
        select: {
          id: true, clientId: true, merchant: true, description: true,
          amount: true, currencyCode: true, date: true,
          items: { select: { description: true }, take: 5 },
        },
        orderBy: { date: 'desc' },
        take: MAX_CANDIDATES,
      }),
      this.prisma.expense.count({ where: { ...baseWhere, encryptedPayload: { not: null } } }),
    ]);

    const expenses: CategorizeCandidateExpense[] = rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId ?? null,
      merchant: r.merchant ?? null,
      description: r.description ?? null,
      amount: Number(r.amount.toString()),
      currencyCode: r.currencyCode,
      date: r.date.toISOString().slice(0, 10),
    }));

    const limit = resolveDailyLimit(process.env.AI_CATEGORIZE_MAX_PER_DAY);
    const used = (await this.cache.get<number>(this.quotaKey(accountId))) ?? 0;
    const empty = { expenses, groups: [], unassigned: [], skippedEncrypted, remainingToday: Math.max(0, limit - used), limitReached: false };
    if (rows.length === 0) {
      this.logger.log(`[Categorize] no_candidates account=${accountId}`);
      return empty;
    }

    const allCategories = await this.prisma.category.findMany({
      where: { accountId, type: 'expense', isDeleted: false },
      select: { id: true, name: true },
    });
    const categories = allCategories.filter((c: { name: string }) => !isDepositCategoryName(c.name));
    const validIds = new Set(categories.map((c: { id: string }) => c.id));

    // 1. Merchant rules — free.
    const rules = await this.merchantRules.getRulesMap(accountId);
    const byCategory = new Map<string, string[]>();
    const remaining: typeof rows = [];
    for (const r of rows) {
      const ruled = rules.get(normalizeMerchant(r.merchant));
      if (ruled && validIds.has(ruled)) {
        byCategory.set(ruled, [...(byCategory.get(ruled) ?? []), r.id]);
      } else {
        remaining.push(r);
      }
    }
    const ruleCount = rows.length - remaining.length;

    const buildGroups = (proposals: Array<{ name: string; ids: string[] }>): CategorizeSuggestionGroup[] => [
      ...[...byCategory.entries()].map(([categoryId, expenseIds]) => ({ categoryId, proposedName: null, expenseIds })),
      ...proposals.map((p) => ({ categoryId: null, proposedName: p.name, expenseIds: p.ids })),
    ];

    if (remaining.length === 0) {
      this.logger.log(`[Categorize] all_rules candidates=${rows.length} rules=${ruleCount}`);
      return { ...empty, groups: buildGroups([]) };
    }
    if (used >= limit) {
      this.logger.log(`[Categorize] limit_reached candidates=${rows.length} rules=${ruleCount}`);
      return { ...empty, groups: buildGroups([]), unassigned: remaining.map((r) => r.id), remainingToday: 0, limitReached: true };
    }

    // 2. One model call for the rest.
    let raw: unknown;
    try {
      raw = await this.askModel(accountId, remaining, categories);
    } catch (err) {
      this.logger.warn(`[Categorize] ai_error candidates=${rows.length} rules=${ruleCount}: ${err instanceof Error ? err.message : String(err)}`);
      return { ...empty, groups: buildGroups([]), unassigned: remaining.map((r) => r.id) };
    }
    await this.cache.set(this.quotaKey(accountId), used + 1, DAY_SECONDS);

    const validated = validateCategorization(raw, remaining.length, categories);
    for (const [index, categoryId] of validated.assignments) {
      byCategory.set(categoryId, [...(byCategory.get(categoryId) ?? []), remaining[index].id]);
    }
    const proposals = validated.proposals.map((p) => ({ name: p.name, ids: p.indexes.map((i) => remaining[i].id) }));
    const unassigned = validated.unassigned.map((i) => remaining[i].id);

    this.logger.log(
      `[Categorize] candidates=${rows.length} rules=${ruleCount} ai=${validated.assignments.size + proposals.reduce((s, p) => s + p.ids.length, 0)} proposed=${proposals.length} unassigned=${unassigned.length}`,
    );
    return {
      expenses,
      groups: buildGroups(proposals),
      unassigned,
      skippedEncrypted,
      remainingToday: Math.max(0, limit - used - 1),
      limitReached: false,
    };
  }

  private async askModel(
    accountId: string,
    remaining: Array<{ merchant: string | null; description: string | null; amount: any; currencyCode: string; items: Array<{ description: string | null }> }>,
    categories: Array<{ name: string }>,
  ): Promise<unknown> {
    const [account, owner] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: accountId }, select: { name: true } }),
      this.prisma.accountMember.findFirst({
        where: { accountId, role: 'owner' },
        select: { user: { select: { language: true } } },
      }),
    ]);
    const language = LANGUAGE_NAMES[owner?.user.language ?? ''] ?? 'English';
    const names = categories.map((c) => sanitizeForPrompt(c.name, 50)).join(', ') || '(none)';
    const lines = remaining
      .map((r, i) => {
        const items = r.items.map((it) => it.description).filter(Boolean).slice(0, 5).join('; ');
        return `${i}. merchant="${sanitizeForPrompt(r.merchant ?? '', 60)}" description="${sanitizeForPrompt(r.description ?? '', 80)}" amount=${r.amount.toString()} ${r.currencyCode}${items ? ` items="${sanitizeForPrompt(items, 150)}"` : ''}`;
      })
      .join('\n');

    const prompt = `You organise a personal-finance account's expenses into categories.

--- INPUT DATA ---
Account name: "${sanitizeForPrompt(account?.name ?? '', 60)}"
Existing categories: ${names}
Expenses:
${lines}
--- END INPUT DATA ---

Rules:
- Prefer an EXISTING category whenever it genuinely fits. Put those in "assignments".
- Only when no existing category fits, group expenses into a NEW shared category in "newCategories". A new category must hold at least ${MIN_EXPENSES_PER_NEW_CATEGORY} expenses; never create one for a single expense. At most ${MAX_NEW_CATEGORIES} new categories. Prefer broad, conventional names (a standard budgeting category) over narrow ones, and use the account's purpose (its name and existing categories) to choose them.
- Name new categories in ${language}, as a short noun phrase of at most 30 characters, never restating an existing name.
- If you are not confident about an expense, leave it out entirely.
- Refer to expenses ONLY by their number.

Return JSON: {"assignments":[{"index":0,"categoryName":"..."}],"newCategories":[{"name":"...","indexes":[1,2]}]}`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty model response');
    return JSON.parse(content);
  }

  private quotaKey(accountId: string): string {
    return `aicat:${accountId}:${new Date().toISOString().slice(0, 10)}`;
  }
}
```

- [ ] **Step 4: Run to verify the service tests pass**

Run: `cd apps/api && npx jest src/modules/ai/services/categorize-suggestions.service.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Register the provider and the route**

In `apps/api/src/modules/ai/ai.module.ts`, add the import and put `CategorizeSuggestionsService` in `providers` (after `ReceiptCategorySplitService`). `MerchantRulesModule` is already in `imports`; `CacheService` is `@Global()`.

```ts
import { CategorizeSuggestionsService } from './services/categorize-suggestions.service';
```

In `apps/api/src/modules/ai/ai.controller.ts`, add the import, a constructor parameter `private readonly categorizeSuggestionsService: CategorizeSuggestionsService,`, and this route (next to `suggest-category`):

```ts
  /**
   * Suggests categories for this account's uncategorized expenses. Read-only —
   * the client applies the reviewed result through the ordinary category and
   * bulk-update endpoints. Outside the monthly AI quota; its own daily ceiling
   * (AI_CATEGORIZE_MAX_PER_DAY) lives in the service.
   */
  @Post('categorize-uncategorized')
  @UseGuards(new ViewerBlockGuard())
  async categorizeUncategorized(@Req() req: AuthenticatedRequest) {
    return this.categorizeSuggestionsService.suggest(req.accountId);
  }
```

- [ ] **Step 6: Typecheck and run the AI module tests**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/modules/ai`
Expected: tsc exit 0; all AI specs pass (if an existing `ai.controller.spec.ts` builds the controller with positional args, add a `{ suggest: jest.fn() }` stub in the new position).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai
git commit -m "Suggest categories for uncategorized expenses in one batched pass"
```

---

### Task 4: Let the receipt prompt answer "nothing fits"

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts:324`
- Test: `apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts`

**Interfaces:**
- Consumes: `ReceiptFinalizerService` — `receipt-finalizer.service.ts:58` matches `parsed.suggestedCategory` by name, `:102` emits `categorySuggestion: parsed.suggestedCategory || null`.

- [ ] **Step 1: Write the failing-or-pinning test**

Open `receipt-finalizer.service.spec.ts`, find the existing test that calls the finalizer with `BASE_PARSED_RECEIPT` (a `describe` whose `it` asserts on the returned `categoryId`), and add alongside it, reusing that file's own setup helper for the service and categories:

```ts
  it('leaves the expense uncategorized when the model says no category fits', async () => {
    const result = await finalize({ ...BASE_PARSED_RECEIPT, suggestedCategory: null as any });
    expect(result.categoryId).toBeNull();
    expect(result.categorySuggestion).toBeNull();
  });
```

(`finalize` stands for whatever that spec file already calls — use its exact helper name and arguments; do not invent a new harness.)

- [ ] **Step 2: Run it**

Run: `cd apps/api && npx jest src/modules/ai/services/receipt-finalizer.service.spec.ts`
Expected: PASS already (the finalizer handles a missing value) — this pins the behaviour the prompt change relies on. If it FAILS, change `receipt-finalizer.service.ts:58` to guard `parsed.suggestedCategory ? … : undefined` and `:102` stays `|| null`.

- [ ] **Step 3: Change the prompt line**

In `ocr.service.ts` replace

```ts
  "suggestedCategory": "best matching category from the available list",
```

with

```ts
  "suggestedCategory": "a category from the available list, or null if none of them genuinely fits this purchase — never pick the closest wrong one",
```

- [ ] **Step 4: Run the OCR and finalizer specs**

Run: `cd apps/api && npx jest src/modules/ai/services/ocr.service.spec.ts src/modules/ai/services/receipt-finalizer.service.spec.ts`
Expected: PASS (no spec snapshots the prompt text; if one does, update the expected string to the new line).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/services/ocr.service.ts apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts
git commit -m "Let the receipt scan leave a category empty instead of forcing a wrong one"
```

---

### Task 5: Bulk category updates teach merchant rules

**Files:**
- Modify: `apps/api/src/modules/expenses/expense-bulk.service.ts`
- Test: `apps/api/src/modules/expenses/expense-bulk.service.spec.ts`

**Interfaces:**
- Consumes: `MerchantRulesService.upsertRule(accountId: string, merchantNormalized: string, categoryId: string): Promise<void>`; `logFireAndForget(logger, context)` from `../../common/utils/fire-and-forget`.
- Produces: `new ExpenseBulkService(prisma, cacheService, merchantRules?)` — the third parameter is `@Optional()` so existing two-argument constructions keep compiling.

- [ ] **Step 1: Write the failing tests** (append to the spec file, reusing its style)

```ts
describe('ExpenseBulkService.bulkUpdate merchant-rule learning', () => {
  function make(owned: Array<{ id: string; merchant: string | null }>) {
    const tx = { expense: { updateMany: jest.fn().mockResolvedValue({ count: owned.length }) } };
    const prisma: any = {
      expense: { findMany: jest.fn().mockResolvedValue(owned) },
      category: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn() };
    const merchantRules: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
    return { service: new ExpenseBulkService(prisma, cacheService, merchantRules), merchantRules };
  }

  it('upserts one rule per distinct non-empty merchant when a category is set', async () => {
    const { service, merchantRules } = make([
      { id: 'e1', merchant: 'OBI' },
      { id: 'e2', merchant: ' obi ' },
      { id: 'e3', merchant: null },
      { id: 'e4', merchant: 'Castorama' },
    ]);
    await service.bulkUpdate('acc', { ids: ['e1', 'e2', 'e3', 'e4'], categoryId: 'cat-1' });
    await new Promise((r) => setImmediate(r));
    const calls = merchantRules.upsertRule.mock.calls.map((c: any[]) => c.slice(1));
    expect(calls).toEqual([['obi', 'cat-1'], ['castorama', 'cat-1']]);
  });

  it('learns nothing when clearing a category or deleting', async () => {
    const { service, merchantRules } = make([{ id: 'e1', merchant: 'OBI' }]);
    await service.bulkUpdate('acc', { ids: ['e1'], categoryId: null });
    await service.bulkUpdate('acc', { ids: ['e1'], isDeleted: true });
    expect(merchantRules.upsertRule).not.toHaveBeenCalled();
  });
});
```

Before running, check how `resolveExpenseCategoryId` (`expense-category-resolver.util.ts`) queries Prisma and make the mock above return `{ id: 'cat-1' }` from exactly that call (adjust `findFirst`/`findUnique` to the method it uses).

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/expenses/expense-bulk.service.spec.ts`
Expected: FAIL — `upsertRule` never called.

- [ ] **Step 3: Implement**

In `expense-bulk.service.ts`:

```ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
```

```ts
export class ExpenseBulkService {
  private readonly logger = new Logger(ExpenseBulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    // Optional so the many two-argument test constructions keep compiling;
    // ExpensesModule imports MerchantRulesModule, so Nest always supplies it.
    @Optional() private readonly merchantRules?: MerchantRulesService,
  ) {}
```

Change the ownership lookup's `select` to `{ id: true, merchant: true }`, and after `await invalidateExpenseChatCache(...)` add:

```ts
    // A bulk recategorization is the same signal as a single edit
    // (ExpensesService.update learns from it): teach merchant → category, so
    // the next import or categorize pass resolves these merchants for free.
    if (!isDeleted && typeof updateData.categoryId === 'string' && this.merchantRules) {
      const merchants = new Set(
        owned.map((e) => (e.merchant ?? '').trim().toLowerCase()).filter((m) => m.length > 0),
      );
      for (const merchant of merchants) {
        void this.merchantRules
          .upsertRule(accountId, merchant, updateData.categoryId)
          .catch(logFireAndForget(this.logger, 'ExpenseBulkService.learnMerchantRule'));
      }
    }
```

- [ ] **Step 4: Run the expenses specs**

Run: `cd apps/api && npx jest src/modules/expenses`
Expected: PASS (the pre-existing id-resolution tests still pass: they mock `findMany` returning `{ id }` only, so `merchant` is `undefined` and nothing is learned).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/expenses/expense-bulk.service.ts apps/api/src/modules/expenses/expense-bulk.service.spec.ts
git commit -m "Learn merchant category rules from bulk recategorization"
```

---

### Task 6: Mobile review reducer (pure)

**Files:**
- Create: `apps/mobile/src/features/categorize/categorizeReview.ts`
- Test: `apps/mobile/src/features/categorize/__tests__/categorizeReview.test.ts`

**Interfaces:**
- Consumes: `CategorizeSuggestionsResponse` (Task 1, type-only).
- Produces:
  ```ts
  export type Target =
    | { kind: 'existing'; categoryId: string }
    | { kind: 'new'; draftKey: string }
    | { kind: 'skip' };
  export interface ReviewState {
    targets: Record<string, Target>;            // server expense id → target
    drafts: Record<string, string>;             // draftKey → name
    excludedGroups: string[];                   // groupKey list
  }
  export type ReviewAction =
    | { type: 'setRowTarget'; expenseId: string; target: Target }
    | { type: 'setGroupTarget'; groupKey: string; target: Target }
    | { type: 'addDraft'; draftKey: string; name: string }
    | { type: 'renameDraft'; draftKey: string; name: string }
    | { type: 'toggleGroup'; groupKey: string };
  export function groupKeyOf(t: Target): string;              // 'existing:<id>' | 'new:<key>' | 'skip'
  export function initReview(r: CategorizeSuggestionsResponse): ReviewState;
  export function reviewReducer(s: ReviewState, a: ReviewAction): ReviewState;
  export interface ReviewGroup { key: string; target: Target; expenseIds: string[]; included: boolean }
  export function deriveGroups(s: ReviewState, order: string[]): ReviewGroup[];  // order = response.expenses ids
  export interface ApplyPlan {
    newCategories: Array<{ draftKey: string; name: string }>;
    assignments: Array<{ target: Exclude<Target, { kind: 'skip' }>; expenseIds: string[] }>;
    expenseCount: number;
  }
  export function buildApplyPlan(s: ReviewState, order: string[]): ApplyPlan;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import type { CategorizeSuggestionsResponse } from '@budget/shared-types';
import {
  initReview, reviewReducer, deriveGroups, buildApplyPlan, groupKeyOf,
} from '../categorizeReview';

const exp = (id: string) => ({ id, clientId: null, merchant: id, description: null, amount: 1, currencyCode: 'PLN', date: '2026-09-20' });

const RESPONSE: CategorizeSuggestionsResponse = {
  expenses: ['a', 'b', 'c', 'd', 'e'].map(exp),
  groups: [
    { categoryId: 'tax', proposedName: null, expenseIds: ['a'] },
    { categoryId: null, proposedName: 'Materiały', expenseIds: ['b', 'c'] },
  ],
  unassigned: ['d', 'e'],
  skippedEncrypted: 0,
  remainingToday: 4,
  limitReached: false,
};
const ORDER = RESPONSE.expenses.map((e) => e.id);

describe('categorizeReview', () => {
  it('starts from the server groups, with unassigned rows skipped', () => {
    const s = initReview(RESPONSE);
    expect(s.targets.a).toEqual({ kind: 'existing', categoryId: 'tax' });
    expect(s.targets.b).toEqual({ kind: 'new', draftKey: 'p0' });
    expect(s.drafts).toEqual({ p0: 'Materiały' });
    expect(s.targets.d).toEqual({ kind: 'skip' });
  });

  it('orders groups new first, then existing, then skip', () => {
    const groups = deriveGroups(initReview(RESPONSE), ORDER);
    expect(groups.map((g) => g.key)).toEqual(['new:p0', 'existing:tax', 'skip']);
    expect(groups[2].expenseIds).toEqual(['d', 'e']);
    expect(groups[2].included).toBe(false);
  });

  it('moves a row to another group when its target changes', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'setRowTarget', expenseId: 'd', target: { kind: 'existing', categoryId: 'tax' } });
    const tax = deriveGroups(s, ORDER).find((g) => g.key === 'existing:tax')!;
    expect(tax.expenseIds).toEqual(['a', 'd']);
  });

  it('retargets a whole group at once', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'setGroupTarget', groupKey: 'new:p0', target: { kind: 'existing', categoryId: 'tax' } });
    expect(deriveGroups(s, ORDER).map((g) => g.key)).toEqual(['existing:tax', 'skip']);
    expect(buildApplyPlan(s, ORDER).newCategories).toEqual([]);
  });

  it('renames a draft and adds a new one', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'renameDraft', draftKey: 'p0', name: 'Budowa' });
    s = reviewReducer(s, { type: 'addDraft', draftKey: 'u1', name: 'Podróże' });
    s = reviewReducer(s, { type: 'setRowTarget', expenseId: 'e', target: { kind: 'new', draftKey: 'u1' } });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([
      { draftKey: 'p0', name: 'Budowa' },
      { draftKey: 'u1', name: 'Podróże' },
    ]);
  });

  it('leaves out an unchecked group and counts only applied rows', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'toggleGroup', groupKey: 'new:p0' });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([]);
    expect(plan.assignments).toEqual([{ target: { kind: 'existing', categoryId: 'tax' }, expenseIds: ['a'] }]);
    expect(plan.expenseCount).toBe(1);
  });

  it('never creates a draft whose name was cleared, and skips its rows', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'renameDraft', draftKey: 'p0', name: '   ' });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([]);
    expect(plan.expenseCount).toBe(1);
  });

  it('does not create an unused draft', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'addDraft', draftKey: 'u1', name: 'Unused' });
    expect(buildApplyPlan(s, ORDER).newCategories.map((n) => n.draftKey)).toEqual(['p0']);
  });

  it('builds stable group keys', () => {
    expect(groupKeyOf({ kind: 'skip' })).toBe('skip');
    expect(groupKeyOf({ kind: 'new', draftKey: 'x' })).toBe('new:x');
    expect(groupKeyOf({ kind: 'existing', categoryId: 'y' })).toBe('existing:y');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/features/categorize/__tests__/categorizeReview.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { CategorizeSuggestionsResponse } from '@budget/shared-types';

/**
 * State of the "categorize uncategorized" review. Groups are DERIVED from each
 * row's chosen target, so moving a row is just changing its target — there is
 * no second list to keep in sync. Pure: the screen and the desktop dialog both
 * drive it through `useCategorizeSuggestions`.
 */

export type Target =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; draftKey: string }
  | { kind: 'skip' };

export interface ReviewState {
  targets: Record<string, Target>;
  drafts: Record<string, string>;
  excludedGroups: string[];
}

export type ReviewAction =
  | { type: 'setRowTarget'; expenseId: string; target: Target }
  | { type: 'setGroupTarget'; groupKey: string; target: Target }
  | { type: 'addDraft'; draftKey: string; name: string }
  | { type: 'renameDraft'; draftKey: string; name: string }
  | { type: 'toggleGroup'; groupKey: string };

export interface ReviewGroup {
  key: string;
  target: Target;
  expenseIds: string[];
  included: boolean;
}

export interface ApplyPlan {
  newCategories: Array<{ draftKey: string; name: string }>;
  assignments: Array<{ target: Exclude<Target, { kind: 'skip' }>; expenseIds: string[] }>;
  expenseCount: number;
}

export function groupKeyOf(t: Target): string {
  if (t.kind === 'skip') return 'skip';
  return t.kind === 'new' ? `new:${t.draftKey}` : `existing:${t.categoryId}`;
}

export function initReview(r: CategorizeSuggestionsResponse): ReviewState {
  const targets: Record<string, Target> = {};
  const drafts: Record<string, string> = {};
  let n = 0;
  for (const g of r.groups) {
    let target: Target;
    if (g.categoryId) {
      target = { kind: 'existing', categoryId: g.categoryId };
    } else {
      const draftKey = `p${n++}`;
      drafts[draftKey] = g.proposedName ?? '';
      target = { kind: 'new', draftKey };
    }
    for (const id of g.expenseIds) targets[id] = target;
  }
  for (const id of r.unassigned) targets[id] = { kind: 'skip' };
  return { targets, drafts, excludedGroups: [] };
}

export function reviewReducer(s: ReviewState, a: ReviewAction): ReviewState {
  switch (a.type) {
    case 'setRowTarget':
      return { ...s, targets: { ...s.targets, [a.expenseId]: a.target } };
    case 'setGroupTarget': {
      const targets = { ...s.targets };
      for (const [id, t] of Object.entries(s.targets)) {
        if (groupKeyOf(t) === a.groupKey) targets[id] = a.target;
      }
      return { ...s, targets };
    }
    case 'addDraft':
    case 'renameDraft':
      return { ...s, drafts: { ...s.drafts, [a.draftKey]: a.name } };
    case 'toggleGroup':
      return {
        ...s,
        excludedGroups: s.excludedGroups.includes(a.groupKey)
          ? s.excludedGroups.filter((k) => k !== a.groupKey)
          : [...s.excludedGroups, a.groupKey],
      };
  }
}

const RANK: Record<Target['kind'], number> = { new: 0, existing: 1, skip: 2 };

export function deriveGroups(s: ReviewState, order: string[]): ReviewGroup[] {
  const byKey = new Map<string, ReviewGroup>();
  for (const id of order) {
    const target = s.targets[id];
    if (!target) continue;
    const key = groupKeyOf(target);
    let g = byKey.get(key);
    if (!g) {
      g = { key, target, expenseIds: [], included: target.kind !== 'skip' && !s.excludedGroups.includes(key) };
      byKey.set(key, g);
    }
    g.expenseIds.push(id);
  }
  return [...byKey.values()].sort((a, b) => RANK[a.target.kind] - RANK[b.target.kind]);
}

export function buildApplyPlan(s: ReviewState, order: string[]): ApplyPlan {
  const newCategories: ApplyPlan['newCategories'] = [];
  const assignments: ApplyPlan['assignments'] = [];
  let expenseCount = 0;
  for (const g of deriveGroups(s, order)) {
    if (!g.included || g.target.kind === 'skip') continue;
    if (g.target.kind === 'new') {
      const name = (s.drafts[g.target.draftKey] ?? '').trim();
      if (!name) continue;
      newCategories.push({ draftKey: g.target.draftKey, name });
    }
    assignments.push({ target: g.target, expenseIds: g.expenseIds });
    expenseCount += g.expenseIds.length;
  }
  return { newCategories, assignments, expenseCount };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mobile && npx jest src/features/categorize/__tests__/categorizeReview.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/categorize
git commit -m "Add the categorize review reducer"
```

---

### Task 7: API client, apply, and local-id resolution

**Files:**
- Modify: `apps/mobile/src/services/ai.api.ts`
- Create: `apps/mobile/src/features/categorize/applyCategorization.ts`
- Test: `apps/mobile/src/features/categorize/__tests__/applyCategorization.test.ts`

**Interfaces:**
- Consumes: `ApplyPlan` (Task 6); `CategorizeCandidateExpense` (Task 1).
- Produces:
  - `api.categorizeUncategorized(): Promise<CategorizeSuggestionsResponse>` (via `aiApi`, spread into `api`).
  - `resolveLocalExpenseId(ref: { id: string; clientId: string | null }, local: Array<{ id: string; serverId?: string }>): string`
  - `applyCategorization(plan: ApplyPlan, refs: CategorizeCandidateExpense[], deps: ApplyDeps): Promise<{ categorized: number; created: number }>`
  - `interface ApplyDeps { createCategory(name: string): Promise<{ id: string }>; bulkSetCategory(ids: string[], categoryId: string): Promise<void>; localExpenses: Array<{ id: string; serverId?: string }> }`

- [ ] **Step 1: Add the client method** to `aiApi` in `ai.api.ts` (add `CategorizeSuggestionsResponse` to the existing `import type` from `@budget/shared-types`):

```ts
  /** Read-only suggestions for this account's uncategorized expenses. */
  categorizeUncategorized() {
    return httpClient.request<CategorizeSuggestionsResponse>('/ai/categorize-uncategorized', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
```

- [ ] **Step 2: Write the failing tests**

```ts
import { applyCategorization, resolveLocalExpenseId } from '../applyCategorization';
import type { ApplyPlan } from '../categorizeReview';

const ref = (id: string, clientId: string | null = null) => ({
  id, clientId, merchant: null, description: null, amount: 1, currencyCode: 'PLN', date: '2026-09-20',
});

describe('resolveLocalExpenseId', () => {
  const local = [{ id: 'local-1', serverId: 'srv-1' }, { id: 'srv-2' }, { id: 'local-3' }];
  it('finds a row by serverId, by id, and by clientId', () => {
    expect(resolveLocalExpenseId(ref('srv-1'), local)).toBe('local-1');
    expect(resolveLocalExpenseId(ref('srv-2'), local)).toBe('srv-2');
    expect(resolveLocalExpenseId(ref('srv-3', 'local-3'), local)).toBe('local-3');
  });
  it('falls back to the server id for a row the client does not hold', () => {
    expect(resolveLocalExpenseId(ref('srv-9'), local)).toBe('srv-9');
  });
});

describe('applyCategorization', () => {
  const plan: ApplyPlan = {
    newCategories: [{ draftKey: 'p0', name: 'Materiały' }],
    assignments: [
      { target: { kind: 'new', draftKey: 'p0' }, expenseIds: ['srv-1', 'srv-2'] },
      { target: { kind: 'existing', categoryId: 'tax' }, expenseIds: ['srv-9'] },
    ],
    expenseCount: 3,
  };

  it('creates categories before assigning, and assigns by local id', async () => {
    const calls: string[] = [];
    const deps = {
      createCategory: jest.fn(async (name: string) => { calls.push(`create:${name}`); return { id: 'new-cat' }; }),
      bulkSetCategory: jest.fn(async (ids: string[], cat: string) => { calls.push(`bulk:${cat}:${ids.join(',')}`); }),
      localExpenses: [{ id: 'local-1', serverId: 'srv-1' }, { id: 'srv-2' }],
    };
    const r = await applyCategorization(plan, [ref('srv-1'), ref('srv-2'), ref('srv-9')], deps);
    expect(calls).toEqual(['create:Materiały', 'bulk:new-cat:local-1,srv-2', 'bulk:tax:srv-9']);
    expect(r).toEqual({ categorized: 3, created: 1 });
  });

  it('counts an existing category returned for a draft name as not created', async () => {
    // categoryStore.createCategory returns the existing row when the name is taken.
    const deps = {
      createCategory: jest.fn(async () => ({ id: 'tax' })),
      bulkSetCategory: jest.fn(async () => undefined),
      localExpenses: [],
    };
    const r = await applyCategorization(
      { newCategories: [{ draftKey: 'p0', name: 'Tax' }], assignments: [{ target: { kind: 'new', draftKey: 'p0' }, expenseIds: ['srv-1'] }], expenseCount: 1 },
      [ref('srv-1')],
      { ...deps, existingCategoryIds: new Set(['tax']) },
    );
    expect(deps.createCategory).toHaveBeenCalledTimes(1);
    expect(r.created).toBe(0);
  });

  it('does nothing for an empty plan', async () => {
    const deps = { createCategory: jest.fn(), bulkSetCategory: jest.fn(), localExpenses: [] };
    const r = await applyCategorization({ newCategories: [], assignments: [], expenseCount: 0 }, [], deps as any);
    expect(deps.createCategory).not.toHaveBeenCalled();
    expect(r).toEqual({ categorized: 0, created: 0 });
  });
});
```

So `ApplyDeps` gains an optional `existingCategoryIds?: Set<string>` (ids present before apply) used only to count `created` honestly.

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/features/categorize/__tests__/applyCategorization.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import type { CategorizeCandidateExpense } from '@budget/shared-types';
import type { ApplyPlan } from './categorizeReview';

export interface ApplyDeps {
  createCategory(name: string): Promise<{ id: string }>;
  bulkSetCategory(ids: string[], categoryId: string): Promise<void>;
  localExpenses: Array<{ id: string; serverId?: string }>;
  /** Category ids that existed before apply — lets `created` exclude a draft that resolved to one. */
  existingCategoryIds?: Set<string>;
}

/**
 * The suggestions carry SERVER ids; the store addresses rows by its local id.
 * Match serverId, then id, then the creating device's clientId. A row the
 * client does not hold (web pages its list) keeps the server id — the bulk
 * endpoint resolves id-or-clientId itself.
 */
export function resolveLocalExpenseId(
  ref: { id: string; clientId: string | null },
  local: Array<{ id: string; serverId?: string }>,
): string {
  const hit =
    local.find((e) => e.serverId === ref.id) ??
    local.find((e) => e.id === ref.id) ??
    (ref.clientId ? local.find((e) => e.id === ref.clientId) : undefined);
  return hit?.id ?? ref.id;
}

/** Creates the reviewed new categories FIRST, then assigns every group. */
export async function applyCategorization(
  plan: ApplyPlan,
  refs: CategorizeCandidateExpense[],
  deps: ApplyDeps,
): Promise<{ categorized: number; created: number }> {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const draftToCategory = new Map<string, string>();
  let created = 0;
  for (const draft of plan.newCategories) {
    const category = await deps.createCategory(draft.name);
    draftToCategory.set(draft.draftKey, category.id);
    if (!deps.existingCategoryIds?.has(category.id)) created++;
  }

  let categorized = 0;
  for (const a of plan.assignments) {
    const categoryId = a.target.kind === 'existing' ? a.target.categoryId : draftToCategory.get(a.target.draftKey);
    if (!categoryId) continue;
    const ids = a.expenseIds.map((id) => resolveLocalExpenseId(byId.get(id) ?? { id, clientId: null }, deps.localExpenses));
    await deps.bulkSetCategory(ids, categoryId);
    categorized += ids.length;
  }
  return { categorized, created };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/mobile && npx jest src/features/categorize`
Expected: PASS, 14 tests (9 + 5).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/services/ai.api.ts apps/mobile/src/features/categorize
git commit -m "Apply reviewed categorization through the existing store actions"
```

---

### Task 8: i18n keys (9 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts` — add a top-level `categorize` object (place it right after the `expenses` object in each file).

Keys are count-neutral on purpose (no plural forms needed).

- [ ] **Step 1: Add to `en.ts`**

```ts
  categorize: {
    bannerText: 'Expenses without a category: {{count}}',
    bannerAction: 'Suggest categories',
    title: 'Categorize expenses',
    analyzing: 'Analyzing expenses…',
    newCategory: 'New category',
    existingCategory: 'Existing category',
    unassigned: "Couldn't determine",
    choose: 'Choose',
    createNew: '+ Create new category',
    newNamePlaceholder: 'Category name',
    apply: 'Apply ({{count}})',
    applyWithNew: 'Apply ({{count}}) · new categories: {{created}}',
    done: 'Categorized: {{count}} · new categories: {{created}}',
    nothingToSuggest: 'Nothing to suggest right now.',
    limitReached: 'AI suggestions are used up for today — only rule-based ones are shown.',
    skippedEncrypted: 'Encrypted expenses skipped: {{count}}',
    error: "Couldn't load suggestions.",
    retry: 'Retry',
  },
```

- [ ] **Step 2: Add the same keys to the other 8 locales**

`pl.ts`:
```ts
  categorize: {
    bannerText: 'Wydatki bez kategorii: {{count}}',
    bannerAction: 'Zaproponuj kategorie',
    title: 'Kategoryzuj wydatki',
    analyzing: 'Analizuję wydatki…',
    newCategory: 'Nowa kategoria',
    existingCategory: 'Istniejąca kategoria',
    unassigned: 'Nie udało się ustalić',
    choose: 'Wybierz',
    createNew: '+ Utwórz nową kategorię',
    newNamePlaceholder: 'Nazwa kategorii',
    apply: 'Zastosuj ({{count}})',
    applyWithNew: 'Zastosuj ({{count}}) · nowe kategorie: {{created}}',
    done: 'Skategoryzowano: {{count}} · nowe kategorie: {{created}}',
    nothingToSuggest: 'Na razie nie ma czego proponować.',
    limitReached: 'Limit podpowiedzi AI na dziś wyczerpany — pokazano tylko te z reguł.',
    skippedEncrypted: 'Pominięto zaszyfrowane wydatki: {{count}}',
    error: 'Nie udało się wczytać propozycji.',
    retry: 'Spróbuj ponownie',
  },
```

`ru.ts`:
```ts
  categorize: {
    bannerText: 'Расходов без категории: {{count}}',
    bannerAction: 'Предложить категории',
    title: 'Разложить по категориям',
    analyzing: 'Анализирую расходы…',
    newCategory: 'Новая категория',
    existingCategory: 'Существующая категория',
    unassigned: 'Не удалось определить',
    choose: 'Выбрать',
    createNew: '+ Создать новую категорию',
    newNamePlaceholder: 'Название категории',
    apply: 'Применить ({{count}})',
    applyWithNew: 'Применить ({{count}}) · новых категорий: {{created}}',
    done: 'Разложено: {{count}} · новых категорий: {{created}}',
    nothingToSuggest: 'Пока нечего предложить.',
    limitReached: 'Лимит AI-подсказок на сегодня исчерпан — показаны только предложения по правилам.',
    skippedEncrypted: 'Пропущено зашифрованных расходов: {{count}}',
    error: 'Не удалось загрузить предложения.',
    retry: 'Повторить',
  },
```

`ua.ts`:
```ts
  categorize: {
    bannerText: 'Витрат без категорії: {{count}}',
    bannerAction: 'Запропонувати категорії',
    title: 'Розкласти за категоріями',
    analyzing: 'Аналізую витрати…',
    newCategory: 'Нова категорія',
    existingCategory: 'Наявна категорія',
    unassigned: 'Не вдалося визначити',
    choose: 'Вибрати',
    createNew: '+ Створити нову категорію',
    newNamePlaceholder: 'Назва категорії',
    apply: 'Застосувати ({{count}})',
    applyWithNew: 'Застосувати ({{count}}) · нових категорій: {{created}}',
    done: 'Розкладено: {{count}} · нових категорій: {{created}}',
    nothingToSuggest: 'Поки що нічого запропонувати.',
    limitReached: 'Ліміт AI-підказок на сьогодні вичерпано — показано лише пропозиції за правилами.',
    skippedEncrypted: 'Пропущено зашифрованих витрат: {{count}}',
    error: 'Не вдалося завантажити пропозиції.',
    retry: 'Повторити',
  },
```

`be.ts`:
```ts
  categorize: {
    bannerText: 'Выдаткаў без катэгорыі: {{count}}',
    bannerAction: 'Прапанаваць катэгорыі',
    title: 'Раскласці па катэгорыях',
    analyzing: 'Аналізую выдаткі…',
    newCategory: 'Новая катэгорыя',
    existingCategory: 'Існуючая катэгорыя',
    unassigned: 'Не ўдалося вызначыць',
    choose: 'Выбраць',
    createNew: '+ Стварыць новую катэгорыю',
    newNamePlaceholder: 'Назва катэгорыі',
    apply: 'Ужыць ({{count}})',
    applyWithNew: 'Ужыць ({{count}}) · новых катэгорый: {{created}}',
    done: 'Раскладзена: {{count}} · новых катэгорый: {{created}}',
    nothingToSuggest: 'Пакуль няма чаго прапанаваць.',
    limitReached: 'Ліміт AI-падказак на сёння вычарпаны — паказаны толькі прапановы па правілах.',
    skippedEncrypted: 'Прапушчана зашыфраваных выдаткаў: {{count}}',
    error: 'Не ўдалося загрузіць прапановы.',
    retry: 'Паўтарыць',
  },
```

`de.ts`:
```ts
  categorize: {
    bannerText: 'Ausgaben ohne Kategorie: {{count}}',
    bannerAction: 'Kategorien vorschlagen',
    title: 'Ausgaben kategorisieren',
    analyzing: 'Ausgaben werden analysiert…',
    newCategory: 'Neue Kategorie',
    existingCategory: 'Bestehende Kategorie',
    unassigned: 'Nicht zuordenbar',
    choose: 'Auswählen',
    createNew: '+ Neue Kategorie erstellen',
    newNamePlaceholder: 'Name der Kategorie',
    apply: 'Übernehmen ({{count}})',
    applyWithNew: 'Übernehmen ({{count}}) · neue Kategorien: {{created}}',
    done: 'Kategorisiert: {{count}} · neue Kategorien: {{created}}',
    nothingToSuggest: 'Im Moment gibt es nichts vorzuschlagen.',
    limitReached: 'KI-Vorschläge für heute aufgebraucht — nur regelbasierte werden angezeigt.',
    skippedEncrypted: 'Verschlüsselte Ausgaben übersprungen: {{count}}',
    error: 'Vorschläge konnten nicht geladen werden.',
    retry: 'Erneut versuchen',
  },
```

`es.ts`:
```ts
  categorize: {
    bannerText: 'Gastos sin categoría: {{count}}',
    bannerAction: 'Sugerir categorías',
    title: 'Categorizar gastos',
    analyzing: 'Analizando gastos…',
    newCategory: 'Nueva categoría',
    existingCategory: 'Categoría existente',
    unassigned: 'No se pudo determinar',
    choose: 'Elegir',
    createNew: '+ Crear nueva categoría',
    newNamePlaceholder: 'Nombre de la categoría',
    apply: 'Aplicar ({{count}})',
    applyWithNew: 'Aplicar ({{count}}) · categorías nuevas: {{created}}',
    done: 'Categorizados: {{count}} · categorías nuevas: {{created}}',
    nothingToSuggest: 'Por ahora no hay nada que sugerir.',
    limitReached: 'Sugerencias de IA agotadas por hoy: solo se muestran las basadas en reglas.',
    skippedEncrypted: 'Gastos cifrados omitidos: {{count}}',
    error: 'No se pudieron cargar las sugerencias.',
    retry: 'Reintentar',
  },
```

`fr.ts`:
```ts
  categorize: {
    bannerText: 'Dépenses sans catégorie : {{count}}',
    bannerAction: 'Suggérer des catégories',
    title: 'Catégoriser les dépenses',
    analyzing: 'Analyse des dépenses…',
    newCategory: 'Nouvelle catégorie',
    existingCategory: 'Catégorie existante',
    unassigned: 'Impossible à déterminer',
    choose: 'Choisir',
    createNew: '+ Créer une catégorie',
    newNamePlaceholder: 'Nom de la catégorie',
    apply: 'Appliquer ({{count}})',
    applyWithNew: 'Appliquer ({{count}}) · nouvelles catégories : {{created}}',
    done: 'Catégorisées : {{count}} · nouvelles catégories : {{created}}',
    nothingToSuggest: 'Rien à suggérer pour le moment.',
    limitReached: "Suggestions IA épuisées pour aujourd'hui — seules celles issues des règles sont affichées.",
    skippedEncrypted: 'Dépenses chiffrées ignorées : {{count}}',
    error: 'Impossible de charger les suggestions.',
    retry: 'Réessayer',
  },
```

`nl.ts`:
```ts
  categorize: {
    bannerText: 'Uitgaven zonder categorie: {{count}}',
    bannerAction: 'Categorieën voorstellen',
    title: 'Uitgaven categoriseren',
    analyzing: 'Uitgaven analyseren…',
    newCategory: 'Nieuwe categorie',
    existingCategory: 'Bestaande categorie',
    unassigned: 'Kon niet bepalen',
    choose: 'Kiezen',
    createNew: '+ Nieuwe categorie maken',
    newNamePlaceholder: 'Naam van de categorie',
    apply: 'Toepassen ({{count}})',
    applyWithNew: 'Toepassen ({{count}}) · nieuwe categorieën: {{created}}',
    done: 'Gecategoriseerd: {{count}} · nieuwe categorieën: {{created}}',
    nothingToSuggest: 'Er valt nu niets voor te stellen.',
    limitReached: 'AI-suggesties voor vandaag op — alleen suggesties op basis van regels worden getoond.',
    skippedEncrypted: 'Versleutelde uitgaven overgeslagen: {{count}}',
    error: 'Suggesties konden niet worden geladen.',
    retry: 'Opnieuw proberen',
  },
```

- [ ] **Step 3: Typecheck the mobile app** (locale files are typed against `en`)

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "Add categorize strings in all nine locales"
```

---

### Task 9: Shared review UI, hook, mobile route

**Files:**
- Create: `apps/mobile/src/features/categorize/useCategorizeSuggestions.ts`
- Create: `apps/mobile/src/components/categorize/CategoryTargetPicker.tsx`
- Create: `apps/mobile/src/components/categorize/CategorizeReview.tsx`
- Create: `apps/mobile/app/expense/categorize.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register header next to `expense/merge`)

**Interfaces:**
- Consumes: Tasks 6–8; `useExpenseStore` (`expenses`, `bulkUpdateExpenses(ids, { categoryId })`); `useCategoryStore` (`categories`, `createCategory(name, 'expense')`); `showAlert`; `useTheme`, `useStyles`, `Theme` from `@/theme`; `formatCurrency` — use whatever `ExpenseListItem.tsx` imports to format an amount with its currency.
- Produces: `<CategorizeReview onDone={() => void} />`; `useCategorizeSuggestions()` returning `{ status: 'loading' | 'error' | 'ready'; response; groups; plan; state; dispatch; retry; apply(): Promise<void>; applying: boolean }`.

- [ ] **Step 1: The hook**

```ts
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { CategorizeSuggestionsResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import {
  buildApplyPlan, deriveGroups, initReview, reviewReducer, type ReviewState,
} from './categorizeReview';
import { applyCategorization } from './applyCategorization';

const EMPTY: ReviewState = { targets: {}, drafts: {}, excludedGroups: [] };

/** Loads suggestions once on mount, holds the review, applies it. */
export function useCategorizeSuggestions() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [response, setResponse] = useState<CategorizeSuggestionsResponse | null>(null);
  const [state, dispatch] = useReducer(
    (s: ReviewState, a: Parameters<typeof reviewReducer>[1] | { type: 'reset'; state: ReviewState }) =>
      a.type === 'reset' ? a.state : reviewReducer(s, a),
    EMPTY,
  );
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const r = await api.categorizeUncategorized();
      setResponse(r);
      dispatch({ type: 'reset', state: initReview(r) });
      setStatus('ready');
    } catch (e: any) {
      console.warn('[categorize] load failed:', e?.message || e);
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const order = useMemo(() => response?.expenses.map((e) => e.id) ?? [], [response]);
  const groups = useMemo(() => deriveGroups(state, order), [state, order]);
  const plan = useMemo(() => buildApplyPlan(state, order), [state, order]);

  const apply = useCallback(async () => {
    if (!response) return { categorized: 0, created: 0 };
    setApplying(true);
    try {
      const categoryStore = useCategoryStore.getState();
      return await applyCategorization(plan, response.expenses, {
        createCategory: (name) => categoryStore.createCategory(name, 'expense'),
        bulkSetCategory: (ids, categoryId) => useExpenseStore.getState().bulkUpdateExpenses(ids, { categoryId }),
        localExpenses: useExpenseStore.getState().expenses,
        existingCategoryIds: new Set(categoryStore.categories.map((c) => c.id)),
      });
    } finally {
      setApplying(false);
    }
  }, [plan, response]);

  return { status, response, state, dispatch, groups, plan, apply, applying, retry: load };
}
```

- [ ] **Step 2: The picker sheet** — `CategoryTargetPicker.tsx`. A bottom-anchored `Modal` (`transparent`, `animationType="slide"`), sheet `maxWidth: 520`, `alignSelf: 'center'`, width `'100%'`, `paddingBottom: theme.spacing[4] + insets.bottom` inline (from `useSafeAreaInsets()`, base NOT in the StyleSheet). Props:

```ts
interface Props {
  visible: boolean;
  categories: Array<{ id: string; name: string; icon?: string }>;
  drafts: Record<string, string>;   // this pass's proposals, by draftKey
  onSelect: (target: Target) => void;
  onCreate: (name: string) => void; // caller dispatches addDraft + target
  onClose: () => void;
}
```

Body: a `ScrollView` listing, in order, each draft (`✚ name`), each existing category (`icon name`), then a row `t('categorize.createNew')` that toggles an inline `TextInput` (placeholder `t('categorize.newNamePlaceholder')`, `autoFocus`) with an OK `Pressable` that calls `onCreate(trimmed)` only when `trimmed.length >= 2`. A backdrop `Pressable` (`theme.colors.overlay`) calls `onClose`. Every row is a `Pressable` with `accessibilityRole="button"`.

- [ ] **Step 3: The review component** — `CategorizeReview.tsx`, rendering by `status`:
  - `loading`: `ActivityIndicator` + `t('categorize.analyzing')`.
  - `error`: `t('categorize.error')` + a `Pressable` `t('categorize.retry')` → `retry()`.
  - `ready` with `groups.length === 0`: `t('categorize.nothingToSuggest')`.
  - `ready`: a `ScrollView` of groups. Above them, when `response.limitReached`, a note `t('categorize.limitReached')`; when `response.skippedEncrypted > 0`, `t('categorize.skippedEncrypted', { count })`.
  - Group header row: checkbox `Pressable` (hidden for `skip`) dispatching `toggleGroup`; marker `✚`/`●`/`?`; title — for `new`, a `TextInput` bound to `state.drafts[draftKey]` dispatching `renameDraft` on change; for `existing`, the category name (look up in `useCategoryStore(s => s.categories)`); for `skip`, `t('categorize.unassigned')`; a caption `t(kind === 'new' ? 'categorize.newCategory' : 'categorize.existingCategory')`; count + summed amount (sum per currency, display the first currency's sum when all share it, otherwise the count only); a `Pressable` (chevron) that opens the picker in **group** mode.
  - Expense rows: merchant (or description), date, formatted amount, and a `Pressable` showing `t('categorize.choose')` for skip rows or `▾` otherwise, opening the picker in **row** mode.
  - Picker wiring: one `CategoryTargetPicker`, state `{ mode: 'row' | 'group'; key: string } | null`. `onSelect(target)` dispatches `setRowTarget` or `setGroupTarget`. `onCreate(name)` generates `draftKey = \`u${Date.now()}\``, dispatches `addDraft`, then the same set-target action with `{ kind: 'new', draftKey }`.
  - Footer (fixed below the ScrollView): Cancel → `onDone()`; primary button disabled when `plan.expenseCount === 0 || applying`, label `plan.newCategories.length ? t('categorize.applyWithNew', { count: plan.expenseCount, created: plan.newCategories.length }) : t('categorize.apply', { count: plan.expenseCount })`. On press: `const r = await apply(); showAlert(t('categorize.done', { count: r.categorized, created: r.created })); onDone();`.
  - Colours only from `theme.colors`; the primary button text uses `theme.colors.textInverse` on `theme.colors.primary` (as other primary buttons do); styles via `useStyles(createStyles)`.

- [ ] **Step 4: The mobile route** — `app/expense/categorize.tsx`

```tsx
import { router } from 'expo-router';
import { CategorizeReview } from '@/components/categorize/CategorizeReview';

export default function CategorizeScreen() {
  return <CategorizeReview onDone={() => router.back()} />;
}
```

And in `app/_layout.tsx`, after the `expense/merge` screen:

```tsx
        <Stack.Screen
          name="expense/categorize"
          options={{
            headerShown: true,
            title: t('categorize.title'),
          }}
        />
```

- [ ] **Step 5: Typecheck + lint + tests**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/components/categorize src/features/categorize app/expense/categorize.tsx && npx jest src/features/categorize`
Expected: all clean, 14 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/categorize apps/mobile/src/features/categorize apps/mobile/app/expense/categorize.tsx apps/mobile/app/_layout.tsx
git commit -m "Add the categorize review screen"
```

---

### Task 10: Banner on both screens and the desktop dialog

**Files:**
- Create: `apps/mobile/src/components/categorize/UncategorizedBanner.tsx`
- Create: `apps/mobile/src/components/expenses/desktop/CategorizeDialog.tsx`
- Modify: `apps/mobile/src/components/expenses/ExpensesMobile.tsx` (above `<ExpenseFilterBar`, around line 227)
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx` (state + banner above `<SummaryStrip`, around line 492)
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktopDialogs.tsx` (new slot)

**Interfaces:**
- Consumes: `CategorizeReview` (Task 9); `useExpenseStore`, `useAccountStore`.
- Produces: `<UncategorizedBanner onPress={() => void} />`; `<CategorizeDialog onClose={() => void} />`; `ExpensesDesktopDialogs` props `showCategorize: boolean; onCloseCategorize: () => void`.

- [ ] **Step 1: The banner**

```tsx
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Shown above the expense list while the current account has uncategorized
 * expenses. Counts from the loaded list with the same exclusions the server
 * applies (planned, split receivables, debts), so the number matches what the
 * review will offer for everything loaded.
 */
export function UncategorizedBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const count = useExpenseStore(
    (s) => s.expenses.filter((e) => !e.categoryId && !e.isPlanned && !e.isSplitReceivable && !e.isDebt).length,
  );
  if (!canEdit || count === 0) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="pricetags-outline" size={18} color={theme.colors.primary} />
      <Text style={styles.text} numberOfLines={2}>{t('categorize.bannerText', { count })}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.action}>
        <Text style={styles.actionText}>{t('categorize.bannerAction')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  text: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  action: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  actionText: { ...theme.textStyles.label, color: theme.colors.textInverse },
});
```

(If `theme.textStyles.body`/`label` are named differently, use the names `SummaryStrip.tsx` uses.)

- [ ] **Step 2: Mount on mobile** — in `ExpensesMobile.tsx`, directly above `<ExpenseFilterBar`:

```tsx
      {activeTab === 'expenses' && (
        <UncategorizedBanner onPress={() => router.push('/expense/categorize')} />
      )}
```

with `import { UncategorizedBanner } from '@/components/categorize/UncategorizedBanner';`.

- [ ] **Step 3: The desktop dialog** — `CategorizeDialog.tsx`, the same chrome as `CreateDialog.tsx` (RN `Modal visible transparent animationType="fade" onRequestClose={onClose} aria-labelledby`, raw `<div role="presentation">` scrim closing on its own click, a panel `width: '90%'`, `maxWidth: 760`, definite `height: '85%'`, header with `nativeID` title `t('categorize.title')` and a close `Pressable` labelled `t('expensesDesktop.dialogClose')`), whose body is `<CategorizeReview onDone={onClose} />` rendered directly as the panel's second flex child (it has its own ScrollView + pinned footer — same reasoning as `CreateDialog`'s definite height). Use title id `'categorize-dialog-title'`.

- [ ] **Step 4: Wire the desktop screen**
  - `ExpensesDesktopDialogs.tsx`: add props `showCategorize: boolean; onCloseCategorize: () => void;` with a doc comment ("the categorize review, opened from the uncategorized banner"), and render `{showCategorize && <CategorizeDialog onClose={onCloseCategorize} />}` alongside the other slots.
  - `ExpensesDesktop.tsx`: `const [showCategorize, setShowCategorize] = useState(false);` next to the other dialog state; directly above `<SummaryStrip …/>` render `<UncategorizedBanner onPress={() => setShowCategorize(true)} />`; pass `showCategorize={showCategorize}` and `onCloseCategorize={() => setShowCategorize(false)}` to `<ExpensesDesktopDialogs`.

- [ ] **Step 5: Typecheck, lint, all mobile tests**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/components/categorize src/components/expenses && npx jest`
Expected: clean; full suite passes.

- [ ] **Step 6: Verify the web build locally**

Run: `npm run dev:web` (from repo root) and, against a local API (`npm run dev`) or with `EXPO_PUBLIC_API_URL` pointing at a dev API: open `http://localhost:8081` at ≥ 1024 px width, sign in, pick an account with uncategorized expenses, confirm the banner shows, the dialog opens, loading → groups render, a row moves when retargeted, Cancel creates nothing. Then resize below 1024 and confirm the banner routes to `/expense/categorize` with a header and back button. Record what was and was not verified.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/categorize/UncategorizedBanner.tsx apps/mobile/src/components/expenses
git commit -m "Offer categorization from a banner on the phone and desktop expense screens"
```

---

### Task 11: Full verification, wiki, user docs, issue

**Files:**
- Create: `docs/wiki/features/categorize-uncategorized.md`
- Modify: `docs/wiki/log.md`, `docs/wiki/features/receipt-category-split.md` (one cross-link line), the relevant hub page that lists ai-features, `user_docs/<lang>/` expenses section × 9 (extend the existing expenses page — no new help section registration needed), then `npm run generate:help`.

- [ ] **Step 1: Whole-repo checks**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all green. If anything fails, fix it before continuing; report the output honestly.

- [ ] **Step 2: Invoke the `finish-aba-task` skill** — it creates the ABA-{N} issue (English, no colon in the title; N = max ABA-N in titles `--state all` and recent commits, + 1), writes the wiki page in the one-shape format (What this is / Entry points / Key concepts / Invariants / Known gaps / History) with these invariants: the endpoint writes nothing; the model speaks indexes and names only; ≥ 2 per new category, ≤ 5 new; assignment wins a contested index; deposit category excluded; the counter increments only after a successful model call; bulk recategorization teaches merchant rules; the scan prompt may return `null`. Adds the log line and user docs.

- [ ] **Step 3: Commit docs** (the skill's own commit, or)

```bash
git add docs/wiki user_docs apps/mobile/src/help/content.ts
git commit -m "ABA-<N> Document categorizing uncategorized expenses"
```

- [ ] **Step 4: Stop and ask the owner before `git push`** (pushing `development` deploys API + web).

---

### Task 12: Live check on House (after the owner approves the push and the deploy is green)

- [ ] **Step 1: Snapshot** (read-only; owner granted prod reads). Write the query to a file in the session scratchpad and run it through the container, as done during brainstorming:

```sql
-- snapshot.sql
select id, category_id from expenses
where account_id = '93634ef5-57f7-4547-a19f-00bb8c3ad7be' and not is_deleted;
```

```bash
scp -i ~/.ssh/id_ed25519 snapshot.sql root@46.225.23.232:/tmp/snapshot.sql
ssh -i ~/.ssh/id_ed25519 root@46.225.23.232 'docker cp /tmp/snapshot.sql budget-db-prod:/tmp/snapshot.sql && docker exec budget-db-prod sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -F, -f /tmp/snapshot.sql"; rm /tmp/snapshot.sql' > house-snapshot.csv
```

Keep `house-snapshot.csv` in the scratchpad, not the repo.

- [ ] **Step 2: Drive the web app** with Chrome (claude-in-chrome): `app.ai-budget.pl` at desktop width → switch to House → banner reads 19 → open the dialog → screenshot the groups → confirm ≤ 5 new categories and sensible grouping (building materials / notary & official fees / travel) → ask the owner to confirm before pressing Apply (it writes to their real account) → Apply.

- [ ] **Step 3: Check the database**: count of House expenses with `category_id is null` (expect ~3–5), new category rows created, and `merchant_category_rules` rows for OBI/Castorama/Leroy Merlin.

- [ ] **Step 4: Second pass**: open the banner again on the remainder; the API log line should read `all_rules` or show `rules=` > 0 for any repeat merchants.

- [ ] **Step 5: Report** to the owner: before/after counts, the created categories, screenshots, and ask them to check the phone screen on a device. Rollback, only if the owner asks: `update expenses set category_id = NULL where id in (<ids from the snapshot that were NULL>)`.
