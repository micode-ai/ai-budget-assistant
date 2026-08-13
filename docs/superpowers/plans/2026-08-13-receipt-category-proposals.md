# Receipt Category Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a receipt's lines have no category that fits, let the classifier propose one and the user create it by saving the receipt — instead of refusing to split and saying nothing.

**Architecture:** The existing single classification call gains an optional `newCategories` key. The server validates it against the account's real categories, groups each proposal through the untouched `buildCategorySplits` under a synthetic key, and ships it as `categoryId: null`. Mobile seeds it as a `new:<name>` sentinel, renders it as a `+` chip, and calls the idempotent `createCategory` at save. Bots do the same on their existing confirm branch. Scan-time rule learning is deleted; the save-time learner already covers it.

**Tech Stack:** NestJS 10, Prisma 5, OpenAI SDK, Jest (API); Expo 54 / React Native, Zustand, Jest (mobile).

**Spec:** `docs/superpowers/specs/2026-08-13-receipt-category-proposals-design.md`

## Global Constraints

- **No migration, no new endpoint, no new table.** Nothing in `prisma/schema.prisma` changes.
- **`buildCategorySplits` and its type `ReceiptCategorySplit` do not change**, in either copy (`apps/api/src/common/utils/receipt-category-split.ts`, `packages/shared-utils/src/formatting/receipt-category-split.ts`). Nullability belongs to the transport payload only.
- **The AI module never creates a category.** No `category.create` call may appear under `apps/api/src/modules/ai/`. Creation happens on the mobile save path and on the bots' confirm branch.
- **The API must not runtime-import `@budget/shared-utils`** (`import type` only) — a deploy guard fails the build otherwise.
- **New i18n keys go into all 9 locale files**: `en, de, es, fr, pl, ru, ua, be, nl` under `apps/mobile/src/i18n/locales/`.
- **`MAX_PROPOSED_CATEGORIES = 3`**, name length 2–30 characters after normalization.
- Sentinel prefixes: server `proposed:`, client `new:`. Neither may reach a DTO or the database.
- Test commands: API — `cd apps/api && npx jest <path>`; mobile — `cd apps/mobile && npx jest <path>`.

---

### Task 1: Bots carry each line's category (pre-existing gap, must land first)

All three bots build `items` without `categoryId`, so the save-time rule learner (`expenses.service.ts:509-518`, which reads exactly that field) learns nothing from a bot receipt. Today the scan-time writer hides it; Task 2 deletes that writer, so this hole has to be closed first or Task 2 becomes a regression.

**Files:**
- Create: `apps/api/src/modules/ai/utils/receipt-split-items.ts`
- Create: `apps/api/src/modules/ai/utils/receipt-split-items.spec.ts`
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts` (the `expensesService.create` call in `handleReceiptAddCallback`)
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts` (same confirm branch)
- Modify: `apps/api/src/modules/slack/handlers/photo.handler.ts` (same confirm branch)

**Interfaces:**
- Consumes: nothing.
- Produces: `buildItemCategoryMap(splits: Array<{ categoryId: string | null; itemIndexes: number[] }>): Map<number, string>` — receipt-line index → category id, skipping entries with no id.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/ai/utils/receipt-split-items.spec.ts`:

```ts
import { buildItemCategoryMap } from './receipt-split-items';

describe('buildItemCategoryMap', () => {
  it('maps every line index of every split to its category id', () => {
    const map = buildItemCategoryMap([
      { categoryId: 'c-food', itemIndexes: [0, 2] },
      { categoryId: 'c-alc', itemIndexes: [1] },
    ]);

    expect(map.get(0)).toBe('c-food');
    expect(map.get(1)).toBe('c-alc');
    expect(map.get(2)).toBe('c-food');
    expect(map.size).toBe(3);
  });

  it('skips a split that has no category id yet, without dropping the others', () => {
    const map = buildItemCategoryMap([
      { categoryId: null, itemIndexes: [0] },
      { categoryId: 'c-food', itemIndexes: [1] },
    ]);

    expect(map.has(0)).toBe(false);
    expect(map.get(1)).toBe('c-food');
  });

  it('returns an empty map for an empty or undefined split list', () => {
    expect(buildItemCategoryMap([]).size).toBe(0);
    expect(buildItemCategoryMap(undefined).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/ai/utils/receipt-split-items.spec.ts`
Expected: FAIL — cannot find module `./receipt-split-items`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/ai/utils/receipt-split-items.ts`:

```ts
/**
 * Helpers shared by the three bot photo handlers for turning a receipt's
 * category splits into the per-line data an expense create needs.
 *
 * Pure: no I/O, no Prisma, no Nest. Lives in `ai/utils` because the payload
 * shape it consumes is produced by `OcrService`, which every bot already
 * imports its receipt types from.
 */

export interface SplitWithLines {
  /** `null` while the category is only proposed and does not exist yet. */
  categoryId: string | null;
  itemIndexes: number[];
}

/**
 * Receipt-line index → category id. Lines belonging to a split with no id yet
 * are absent rather than mapped to a placeholder: the consumer writes this into
 * `expense_items.category_id`, an FK, so an invented value would fail at the
 * database instead of at the boundary.
 */
export function buildItemCategoryMap(splits: SplitWithLines[] | undefined): Map<number, string> {
  const map = new Map<number, string>();
  for (const split of splits ?? []) {
    if (!split.categoryId) continue;
    for (const index of split.itemIndexes) {
      map.set(index, split.categoryId);
    }
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/ai/utils/receipt-split-items.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into all three bots**

In each of the three `photo.handler.ts` files, find the confirm branch that calls `this.expensesService.create(...)` (Telegram: `handleReceiptAddCallback`). Immediately before the call, add:

```ts
      const itemCategoryIds = buildItemCategoryMap(data.categorySplits);
```

and add `categoryId` to the item mapping inside that same call:

```ts
          items: data.items.map((item, index) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.totalPrice,
            totalPrice: item.totalPrice,
            sortOrder: index,
            categoryId: itemCategoryIds.get(index),
          })),
```

Add the import at the top of each file:

```ts
import { buildItemCategoryMap } from '../../ai/utils/receipt-split-items';
```

WhatsApp and Slack have a second `expensesService.create` call on their date-edit branch — apply the same two edits there too. Search each file for `sortOrder: index` and make sure every occurrence that belongs to a receipt confirm now carries `categoryId`.

- [ ] **Step 6: Verify nothing else broke**

Run: `cd apps/api && npx jest src/modules/telegram src/modules/whatsapp src/modules/slack`
Expected: PASS. If a handler spec asserts the exact `items` array, update the expectation to include `categoryId: undefined` for an unsplit receipt.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/utils/receipt-split-items.ts apps/api/src/modules/ai/utils/receipt-split-items.spec.ts apps/api/src/modules/telegram/handlers/photo.handler.ts apps/api/src/modules/whatsapp/handlers/photo.handler.ts apps/api/src/modules/slack/handlers/photo.handler.ts
git commit -m "Carry receipt line categories through the bot confirm branch"
```

---

### Task 2: The classifier proposes categories and stops writing rules

**Files:**
- Modify: `apps/api/src/modules/ai/services/receipt-category-split.service.ts`
- Modify: `apps/api/src/modules/ai/services/receipt-category-split.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `interface ProposedCategory { name: string; itemIndexes: number[] }`
  - `interface ClassifyResult { assignments: Map<number, string>; proposals: ProposedCategory[] }`
  - `classify(params: { accountId: string; items: ClassifyLine[]; categories: Array<{ id: string; name: string }>; language?: string }): Promise<ClassifyResult>` — **note the return type changed** from `Map<number, string>`; `OcrService` is the only caller and Task 3 updates it.
  - `const PROPOSED_KEY_PREFIX = 'proposed:'`, `proposedKey(name: string): string`, `isProposedKey(key: string): boolean`, `proposedNameFromKey(key: string): string`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/ai/services/receipt-category-split.service.spec.ts` (the `makeService` helper at the top of that file already builds the mocks these use):

```ts
describe('ReceiptCategorySplitService proposals', () => {
  it('returns a validated proposal alongside assignments', async () => {
    const { service } = makeService({
      completion: {
        assignments: [{ line: 1, category: 'Groceries' }],
        newCategories: [{ name: 'Chemia', lines: [2] }],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.proposals).toEqual([{ name: 'Chemia', itemIndexes: [1] }]);
  });

  it('drops a proposal that restates an existing category, whatever its casing', async () => {
    const { service } = makeService({
      completion: { assignments: [], newCategories: [{ name: '  aLCohol ', lines: [1, 2] }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toEqual([]);
  });

  it('drops a second proposal repeating the first name, and keeps at most three', async () => {
    const { service } = makeService({
      completion: {
        assignments: [],
        newCategories: [
          { name: 'Chemia', lines: [1] },
          { name: 'chemia', lines: [2] },
        ],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].itemIndexes).toEqual([0]);
  });

  it('lets an assignment win a line the model also claimed for a proposal', async () => {
    const { service } = makeService({
      completion: {
        assignments: [{ line: 1, category: 'Groceries' }],
        newCategories: [{ name: 'Chemia', lines: [1, 2] }],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.proposals[0].itemIndexes).toEqual([1]);
  });

  it('rejects malformed names and out-of-range lines', async () => {
    const { service } = makeService({
      completion: {
        assignments: [],
        newCategories: [
          { name: 'X', lines: [1] },
          { name: '12345', lines: [1] },
          { name: 'A'.repeat(31), lines: [1] },
          { name: 'Chemia', lines: [99] },
          { name: 'Chemia', lines: [] },
        ],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toEqual([]);
  });

  it('names the account language in the prompt', async () => {
    const { service, create } = makeService({ completion: { assignments: [] } });

    await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES, language: 'pl' });

    expect(create.mock.calls[0][0].messages[0].content).toContain('Polish');
  });

  it('never writes a product rule — learning belongs to the save path', async () => {
    const { service, productRules } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }] },
    });

    await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(productRules.upsertRules).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Update the two existing tests this change invalidates**

In the same file:

1. The test named `'asks the model only about lines the rules did not cover, and learns the answer'` — rename to `'asks the model only about lines the rules did not cover'`, change `result.get(1)` to `result.assignments.get(1)`, and **delete** the `expect(productRules.upsertRules).toHaveBeenCalledWith(...)` assertion (the new dedicated test above replaces it). Keep both `cache.set` assertions untouched — the daily ceiling is unchanged.
2. Every other `result.get(` in the file becomes `result.assignments.get(`, and any `expect(result.size)` becomes `expect(result.assignments.size)`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/ai/services/receipt-category-split.service.spec.ts`
Expected: FAIL — `result.assignments` is undefined and `proposals` does not exist.

- [ ] **Step 4: Implement**

In `apps/api/src/modules/ai/services/receipt-category-split.service.ts`:

Add above the class, after the existing `ClassifyLine` interface:

```ts
export interface ProposedCategory {
  /** Validated, normalized name. Never equal to an existing category's name. */
  name: string;
  /** Indexes in `ClassifyLine.index` space, not the 1-based prompt numbering. */
  itemIndexes: number[];
}

export interface ClassifyResult {
  assignments: Map<number, string>;
  proposals: ProposedCategory[];
}

export const MAX_PROPOSED_CATEGORIES = 3;
const MIN_PROPOSED_NAME_LEN = 2;
const MAX_PROPOSED_NAME_LEN = 30;

/**
 * Key a proposal is grouped under inside `buildCategorySplits`, which needs an
 * opaque string id. It is rewritten to `categoryId: null` before the payload
 * leaves the server and must never reach a DTO or the database.
 */
export const PROPOSED_KEY_PREFIX = 'proposed:';
export const proposedKey = (name: string): string => `${PROPOSED_KEY_PREFIX}${name}`;
export const isProposedKey = (key: string): boolean => key.startsWith(PROPOSED_KEY_PREFIX);
export const proposedNameFromKey = (key: string): string => key.slice(PROPOSED_KEY_PREFIX.length);

/**
 * A lookup table, not a dependency: `PromptBuilderService.localeToLanguageName`
 * is a method on a service this one has no other reason to inject.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  ua: 'Ukrainian',
  be: 'Belarusian',
  nl: 'Dutch',
};
const languageName = (language?: string): string => LANGUAGE_NAMES[language ?? ''] ?? 'English';
```

Change `classify` to take `language` and return `ClassifyResult`:

```ts
  async classify(params: {
    accountId: string;
    items: ClassifyLine[];
    categories: Array<{ id: string; name: string }>;
    language?: string;
  }): Promise<ClassifyResult> {
    const { accountId, items, categories, language } = params;
    const assigned = new Map<number, string>();
    const empty: ClassifyResult = { assignments: assigned, proposals: [] };
    if (items.length === 0 || categories.length === 0) return empty;
```

Both early returns after that (`unresolved.length === 0` and the spent-quota branch) return `empty`. The model branch becomes:

```ts
    try {
      const learned = await this.classifyWithModel(unresolved, categories, language);
      // Only a call that actually returned counts against the daily ceiling — a
      // thrown/failed call must not silently eat a user's quota for nothing.
      await this.recordInferenceUse(accountId);
      for (const [index, categoryId] of learned.assignments) assigned.set(index, categoryId);
      return { assignments: assigned, proposals: learned.proposals };
    } catch (error) {
      this.logger.warn(`[CategorySplit] model classification skipped: ${error}`);
    }

    return empty;
```

**Delete** the `newRules` block and the `upsertRules` call entirely. `ProductRulesService` is still injected — `getRulesMap` is what reads the rules — but nothing in this class writes one any more. Add a short comment where the block was:

```ts
      // No rule is learned here on purpose. The save-time learner in
      // ExpensesService.create writes rules from the categories the lines
      // actually ended up with, so a scan the user abandons teaches nothing.
```

Extend the prompt and the model call:

```ts
  private async classifyWithModel(
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
    language?: string,
  ): Promise<ClassifyResult> {
    const numbered = lines.map((line, i) => `${i + 1}. ${sanitizeForPrompt(line.label)}`).join('\n');
    const categoryNames = categories.map((c) => c.name).join(', ');

    const prompt = `Assign each receipt line to exactly one category.

Lines:
${numbered}

Categories: ${categoryNames}

Return JSON: {"assignments":[{"line":1,"category":"<one of the categories above>"}],"newCategories":[{"name":"<new category>","lines":[2,3]}]}
Use only the category names listed, spelled exactly as given.
Omit a line entirely if you are not confident.
Only when several lines clearly belong together and NONE of the listed categories fits them, propose up to ${MAX_PROPOSED_CATEGORIES} new categories in "newCategories", each named in ${languageName(language)} as a short noun phrase. Never propose a name that restates a listed category. Leave "newCategories" empty otherwise.
Do not return any amounts, prices, totals or percentages.`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const assignments = this.validateAssignments(parsed?.assignments, lines, categories);
    const proposals = this.validateProposals(parsed?.newCategories, lines, categories, new Set(assignments.keys()));
    return { assignments, proposals };
  }
```

Add the validator next to `validateAssignments`:

```ts
  /**
   * Same posture as `validateAssignments`: anything invented, malformed or
   * duplicated is dropped, never repaired. `claimed` carries the line indexes
   * the assignments already took, so an assignment always wins a contested line
   * and the outcome does not depend on the order the model emitted things in.
   */
  private validateProposals(
    raw: unknown,
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
    claimed: Set<number>,
  ): ProposedCategory[] {
    if (!Array.isArray(raw)) return [];

    const taken = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    const result: ProposedCategory[] = [];

    for (const entry of raw) {
      if (result.length >= MAX_PROPOSED_CATEGORIES) break;

      const name = String(entry?.name ?? '')
        .replace(/[ -]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.length < MIN_PROPOSED_NAME_LEN || name.length > MAX_PROPOSED_NAME_LEN) continue;
      // A name with no letter at all is a number, a code or punctuation.
      if (!/\p{L}/u.test(name)) continue;
      if (taken.has(name.toLowerCase())) continue;

      const itemIndexes: number[] = [];
      for (const rawLine of Array.isArray(entry?.lines) ? entry.lines : []) {
        const lineNumber = Number(rawLine);
        if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) continue;
        const index = lines[lineNumber - 1].index;
        if (claimed.has(index)) continue;
        claimed.add(index);
        itemIndexes.push(index);
      }
      if (itemIndexes.length === 0) continue;

      taken.add(name.toLowerCase());
      result.push({ name, itemIndexes });
    }

    return result;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/ai/services/receipt-category-split.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/services/receipt-category-split.service.ts apps/api/src/modules/ai/services/receipt-category-split.service.spec.ts
git commit -m "Let the receipt classifier propose missing categories"
```

---

### Task 3: `OcrService` ships proposals as `categoryId: null`, and says why it refused

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts` (`ReceiptExpense` type near line 104; `runCategorySplit` at 453-506; `finalizeReceipt` at 513-522; its four call sites at 765, 815, 900, 922)
- Modify: `apps/api/src/modules/ai/services/ocr.service.spec.ts`

**Interfaces:**
- Consumes: `ClassifyResult`, `proposedKey`, `isProposedKey`, `proposedNameFromKey` from Task 2.
- Produces: `interface ReceiptCategorySplitPayload { categoryId: string | null; categoryName: string; amount: number; percentage: number; itemIndexes: number[] }` and `ReceiptExpense.categorySplits: ReceiptCategorySplitPayload[]`.

- [ ] **Step 1: Update the shared mock, then write the failing tests**

`ocr.service.spec.ts` already builds the service with `categorySplitterMock = { classify: jest.fn().mockResolvedValue(new Map()) }` and a `prisma.user.findUnique` that already returns `{ language: 'en' }`. The mock's resolved value must change shape first, or every existing test in the file breaks on destructuring:

```ts
    categorySplitterMock = {
      classify: jest.fn().mockResolvedValue({ assignments: new Map(), proposals: [] }),
    };
```

Then append:

```ts
describe('OcrService.runCategorySplit with proposals', () => {
  const RECEIPT = {
    amount: 30,
    receiptItems: [
      { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 20 },
      { description: 'Płyn do naczyń', canonicalName: 'Płyn do naczyń', totalPrice: 10 },
    ],
  } as any;

  beforeEach(() => {
    prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Food & Dining' }]);
  });

  it('emits a proposed group as categoryId null and keeps the total exact', async () => {
    categorySplitterMock.classify.mockResolvedValue({
      assignments: new Map([[0, 'c-food']]),
      proposals: [{ name: 'Chemia', itemIndexes: [1] }],
    });

    const splits = await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

    expect(splits).toHaveLength(2);
    const proposed = splits.find((s: any) => s.categoryId === null);
    expect(proposed.categoryName).toBe('Chemia');
    expect(proposed.amount).toBeCloseTo(10, 2);
    expect(splits.reduce((sum: number, s: any) => sum + s.amount, 0)).toBeCloseTo(30, 2);
    expect(JSON.stringify(splits)).not.toContain('proposed:');
  });

  it('passes the account language to the classifier', async () => {
    prisma.user.findUnique.mockResolvedValue({ language: 'pl' });

    await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

    expect(categorySplitterMock.classify).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'pl' }),
    );
  });

  it('still refuses when everything lands in one category, and logs the reason', async () => {
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    categorySplitterMock.classify.mockResolvedValue({
      assignments: new Map([[0, 'c-food'], [1, 'c-food']]),
      proposals: [],
    });

    const splits = await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

    expect(splits).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('one_category'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/ai/services/ocr.service.spec.ts`
Expected: FAIL — `runCategorySplit` takes two arguments and never emits a null id.

- [ ] **Step 3: Change the payload type**

In `ocr.service.ts`, replace the `categorySplits` field's type on `ReceiptExpense` (line ~104) and add the payload interface above it:

```ts
/**
 * What leaves the server. Distinct from the arithmetic type
 * `ReceiptCategorySplit`: here `categoryId` may be `null`, meaning "a category
 * the model proposed that does not exist yet — create it if the user saves".
 */
export interface ReceiptCategorySplitPayload {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}
```

```ts
  categorySplits: ReceiptCategorySplitPayload[];
```

Update the import line to bring in the sentinel helpers:

```ts
import {
  ReceiptCategorySplitService,
  proposedKey,
  isProposedKey,
  proposedNameFromKey,
} from './receipt-category-split.service';
```

- [ ] **Step 4: Rewrite `runCategorySplit`**

Replace the body from the `classify` call onward, and change the signature to take `userId`:

```ts
  private async runCategorySplit(
    accountId: string,
    receipt: ReceiptExpense,
    userId: string,
  ): Promise<ReceiptCategorySplitPayload[]> {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { encryptionTier: true },
      });
      if ((account?.encryptionTier ?? 0) >= 2) return [];

      const allLines = (receipt.receiptItems ?? [])
        .map((item, index) => ({
          index,
          label: (item.canonicalName?.trim() || item.description?.trim() || ''),
          amount: Number(item.totalPrice),
        }))
        .filter((line) => Number.isFinite(line.amount) && line.amount > 0);
      const labeledLines = allLines.filter((line) => line.label.length > 0);
      if (labeledLines.length < 2) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped few_lines`);
        return [];
      }

      const categories = await this.prisma.category.findMany({
        where: { OR: [{ isSystem: true }, { accountId }], type: 'expense', isDeleted: false },
        select: { id: true, name: true },
      });
      if (categories.length === 0) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped no_categories`);
        return [];
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      });

      const { assignments, proposals } = await this.categorySplitter.classify({
        accountId,
        items: labeledLines,
        categories,
        language: user?.language ?? undefined,
      });
      if (assignments.size === 0 && proposals.length === 0) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped no_assignments`);
        return [];
      }

      // A proposal has no id yet, so it is grouped under a synthetic key. The
      // key never leaves this method — it is mapped to `categoryId: null` below.
      const keyByIndex = new Map<number, string>();
      const nameByKey = new Map<string, string>();
      const byId = new Map(categories.map((c) => [c.id, c.name]));
      for (const [index, categoryId] of assignments) {
        keyByIndex.set(index, categoryId);
        nameByKey.set(categoryId, byId.get(categoryId) ?? '');
      }
      for (const proposal of proposals) {
        const key = proposedKey(proposal.name);
        nameByKey.set(key, proposal.name);
        for (const index of proposal.itemIndexes) keyByIndex.set(index, key);
      }

      const splits = buildCategorySplits({
        total: receipt.amount,
        items: allLines.map((line) => {
          const key = keyByIndex.get(line.index) ?? null;
          return {
            index: line.index,
            amount: line.amount,
            categoryId: key,
            categoryName: key ? nameByKey.get(key) ?? null : null,
          };
        }),
      });

      if (splits.length === 0) {
        this.logger.log(
          `[CategorySplit] ${accountId}: refused ${new Set(keyByIndex.values()).size < 2 ? 'one_category' : 'gap_over_tolerance'}`,
        );
        return [];
      }

      this.logger.log(`[CategorySplit] ${accountId}: ok groups=${splits.length} proposed=${proposals.length}`);
      return splits.map((split) => ({
        ...split,
        categoryId: isProposedKey(split.categoryId) ? null : split.categoryId,
        categoryName: isProposedKey(split.categoryId)
          ? proposedNameFromKey(split.categoryId)
          : split.categoryName,
      }));
    } catch (error) {
      this.logger.warn(`[CategorySplit] skipped: ${error}`);
      return [];
    }
  }
```

- [ ] **Step 5: Thread `userId` through `finalizeReceipt`**

```ts
  private async finalizeReceipt(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    categories: CategoryWithName[],
    accountId: string,
    userId: string,
  ): Promise<ReceiptExpense> {
    const receipt = await this.buildReceiptExpense(parsed, categories);
    receipt.priceFindings = await this.runPriceCheck(accountId, receipt);
    receipt.categorySplits = await this.runCategorySplit(accountId, receipt, userId);
    return receipt;
  }
```

Then update all four call sites (grep for `finalizeReceipt(` — lines ~765, 815, 900, 922) to pass `userId`. Three of them already have it in scope: `parseReceipt` (signature at 708-711) and `parseReceiptPdf` (768-771) both take `userId` as their second parameter.

The fourth does not. `parseReceiptFile` (853-860) takes `(pdfBase64, accountId, context, userPrompt?, aiModel?, maxTokens?)` and owns the two call sites at 900 and 922. Add `userId` after `pdfBase64` so it mirrors the two public methods:

```ts
  private async parseReceiptFile(
    pdfBase64: string,
    userId: string,
    accountId: string,
    context: OcrContext,
    userPrompt?: string,
    aiModel?: string,
    maxTokens?: number,
  ): Promise<ReceiptExpense> {
```

It has exactly one caller, line 820 inside `parseReceiptPdf`, where `userId` is already in scope:

```ts
      return this.parseReceiptFile(pdfBase64, userId, accountId, context, userPrompt, aiModel, ocrMaxTokens);
```

No controller or bot signature changes — `parseReceiptFile` is private.

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest src/modules/ai`
Expected: PASS. Then `cd apps/api && npx tsc --noEmit` — expect errors ONLY where a consumer now has to handle a nullable `categoryId`; fix each by handling `null` explicitly, never by casting.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/services/ocr.service.ts apps/api/src/modules/ai/services/ocr.service.spec.ts
git commit -m "Ship proposed receipt categories as a null-id split group"
```

---

### Task 4: Mobile transport types and the sentinel helper

**Files:**
- Create: `apps/mobile/src/features/receipt/proposedCategory.ts`
- Create: `apps/mobile/src/features/receipt/__tests__/proposedCategory.test.ts`
- Modify: `apps/mobile/src/features/receipt/useReceiptScanner.ts` (the `ReceiptCategorySplitItem` interface, ~line 16-22)
- Modify: `apps/mobile/src/services/ai.api.ts` (the inline `categorySplits` response type, ~line 158)

**Interfaces:**
- Consumes: the wire shape from Task 3.
- Produces: `PROPOSED_PREFIX`, `proposedKey(name)`, `isProposedKey(key)`, `proposedName(key)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/receipt/__tests__/proposedCategory.test.ts`:

```ts
import { proposedKey, isProposedKey, proposedName } from '../proposedCategory';

describe('proposed category keys', () => {
  it('round-trips a name through a key', () => {
    const key = proposedKey('Chemia gospodarcza');
    expect(isProposedKey(key)).toBe(true);
    expect(proposedName(key)).toBe('Chemia gospodarcza');
  });

  it('does not mistake a real category id for a proposal', () => {
    expect(isProposedKey('4c6595d1-a2a5-4c7a-8573-6931474f4194')).toBe(false);
    expect(isProposedKey(null)).toBe(false);
    expect(isProposedKey(undefined)).toBe(false);
  });

  it('keeps a name containing a colon intact', () => {
    expect(proposedName(proposedKey('Dom: chemia'))).toBe('Dom: chemia');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/features/receipt/__tests__/proposedCategory.test.ts`
Expected: FAIL — cannot find module `../proposedCategory`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/features/receipt/proposedCategory.ts`:

```ts
/**
 * A category the server proposed for a scanned receipt but that does not exist
 * yet. It arrives as `categoryId: null` and is held in local state under this
 * sentinel key so the untouched `buildCategorySplits` — which groups by an
 * opaque string id — can treat it as an ordinary group. The save path swaps
 * every sentinel for the id of a real, created category; a sentinel must never
 * reach the API or SQLite.
 */
export const PROPOSED_PREFIX = 'new:';

export const proposedKey = (name: string): string => `${PROPOSED_PREFIX}${name}`;

export const isProposedKey = (key: string | null | undefined): boolean =>
  typeof key === 'string' && key.startsWith(PROPOSED_PREFIX);

export const proposedName = (key: string): string => key.slice(PROPOSED_PREFIX.length);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/features/receipt/__tests__/proposedCategory.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Widen both transport types**

In `useReceiptScanner.ts`, on the `ReceiptCategorySplitItem` interface:

```ts
export interface ReceiptCategorySplitItem {
  /** `null` means the server proposed this category and it does not exist yet. */
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}
```

In `ai.api.ts`, the inline `categorySplits` type in the `scanReceipt` response:

```ts
      categorySplits: {
        categoryId: string | null;
        categoryName: string;
        amount: number;
        percentage: number;
        itemIndexes: number[];
      }[];
```

- [ ] **Step 6: Write the failing test for the seeding rule**

The screen's seeding decision (resolve locally, hold as a proposal, or drop the whole set) is the one piece of Task 5 worth testing, and it cannot be tested through the component — this repo has no `@testing-library/react-native`. So it goes in a pure function, like every other tested piece of mobile logic here.

Create `apps/mobile/src/features/receipt/__tests__/seedItemCategories.test.ts`:

```ts
import { seedItemCategories } from '../seedItemCategories';

const SPLIT = (over: Partial<{ categoryId: string | null; categoryName: string; itemIndexes: number[] }> = {}) => ({
  categoryId: 'c-food',
  categoryName: 'Groceries',
  itemIndexes: [0],
  ...over,
});

describe('seedItemCategories', () => {
  it('maps a resolved split to its local category id', () => {
    const result = seedItemCategories([SPLIT({ itemIndexes: [0, 2] })], () => 'local-food');

    expect(result.itemCategories).toEqual({ 0: 'local-food', 2: 'local-food' });
    expect(result.dropped).toBe(false);
  });

  it('holds an unresolvable proposal under a sentinel instead of dropping the set', () => {
    const result = seedItemCategories(
      [SPLIT(), SPLIT({ categoryId: null, categoryName: 'Chemia', itemIndexes: [1] })],
      (split) => (split.categoryId ? 'local-food' : undefined),
    );

    expect(result.itemCategories).toEqual({ 0: 'local-food', 1: 'new:Chemia' });
    expect(result.dropped).toBe(false);
  });

  it('prefers a real category the account has acquired since the scan', () => {
    const result = seedItemCategories(
      [SPLIT({ categoryId: null, categoryName: 'Chemia', itemIndexes: [1] })],
      () => 'local-chemia',
    );

    expect(result.itemCategories).toEqual({ 1: 'local-chemia' });
  });

  it('drops the whole set when a real split cannot be resolved', () => {
    const result = seedItemCategories([SPLIT(), SPLIT({ categoryId: 'c-gone', itemIndexes: [1] })], (split) =>
      split.categoryId === 'c-food' ? 'local-food' : undefined,
    );

    expect(result.itemCategories).toEqual({});
    expect(result.dropped).toBe(true);
  });

  it('treats an empty or absent split list as nothing to seed', () => {
    expect(seedItemCategories([], () => undefined)).toEqual({ itemCategories: {}, dropped: false });
    expect(seedItemCategories(undefined, () => undefined)).toEqual({ itemCategories: {}, dropped: false });
  });
});
```

- [ ] **Step 7: Implement it**

Create `apps/mobile/src/features/receipt/seedItemCategories.ts`:

```ts
import { proposedKey } from './proposedCategory';

export interface SeedableSplit {
  /** `null` when the server proposed this category and it does not exist yet. */
  categoryId: string | null;
  categoryName: string;
  itemIndexes: number[];
}

export interface SeedResult {
  /** Receipt-line index → local category id, or a `new:` sentinel. */
  itemCategories: Record<number, string>;
  /** True when a real split could not be matched and the set was discarded. */
  dropped: boolean;
}

/**
 * Turns the server's splits into the screen's line→category state.
 *
 * A real split that does not resolve to a local category discards the WHOLE
 * set: a partially resolved split no longer sums to the expense amount, which
 * is the one thing the split arithmetic must guarantee. A proposal is different
 * — it has no local category by definition, so it is held under a sentinel
 * until save. `resolveLocalId` is expected to try the id first and then the
 * name, so a proposal whose name the account has acquired since the scan
 * resolves to that real category and no duplicate is ever created.
 */
export function seedItemCategories(
  splits: SeedableSplit[] | undefined,
  resolveLocalId: (split: SeedableSplit) => string | undefined,
): SeedResult {
  const itemCategories: Record<number, string> = {};
  if (!splits || splits.length === 0) return { itemCategories, dropped: false };

  for (const split of splits) {
    const localId = resolveLocalId(split);
    if (!localId && split.categoryId !== null) {
      return { itemCategories: {}, dropped: true };
    }
    const key = localId ?? proposedKey(split.categoryName);
    for (const index of split.itemIndexes) {
      itemCategories[index] = key;
    }
  }

  return { itemCategories, dropped: false };
}
```

- [ ] **Step 8: Run both test files**

Run: `cd apps/mobile && npx jest src/features/receipt`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/features/receipt apps/mobile/src/services/ai.api.ts
git commit -m "Add the proposed-category sentinel and seeding rule for scanned splits"
```

---

### Task 5: The scan screen shows proposals and creates them on save

**Files:**
- Modify: `apps/mobile/app/expense/receipt.tsx` (seeding effect 90-127, recompute 129-145, sheet items 147-151, save 169-230, sheet render ~492)
- Modify: `apps/mobile/src/components/receipt/CategorySplitChips.tsx`
- Modify: `apps/mobile/src/components/receipt/ItemCategorySheet.tsx`
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**Interfaces:**
- Consumes: `proposedKey`, `isProposedKey`, `proposedName` (Task 4); `categoryStore.createCategory(name, type, icon?, color?): Promise<Category>`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the i18n key to all 9 locales**

In each `apps/mobile/src/i18n/locales/<lang>.ts`, inside the existing `receiptCategorySplit` object, add `newCategory`:

```
en: newCategory: 'New category',
pl: newCategory: 'Nowa kategoria',
de: newCategory: 'Neue Kategorie',
es: newCategory: 'Nueva categoría',
fr: newCategory: 'Nouvelle catégorie',
ru: newCategory: 'Новая категория',
ua: newCategory: 'Нова категорія',
be: newCategory: 'Новая катэгорыя',
nl: newCategory: 'Nieuwe categorie',
```

- [ ] **Step 2: Seed proposals in the scan effect**

In `receipt.tsx`, replace the whole resolution block inside the `useEffect` (lines 103-124, from `if (incomingSplits && incomingSplits.length > 0) {` to the closing `}` of its `else`) with a call to the tested helper:

```ts
      // Resolve the server's splits against local categories: by id first,
      // falling back to a name lookup (the same fallback this screen already
      // uses for categorySuggestion). A proposal (categoryId null) has no local
      // category by definition and is held under a sentinel until save.
      const catStore = useCategoryStore.getState();
      const { itemCategories: seeded, dropped } = seedItemCategories(
        scannedReceipt.categorySplits,
        (split) =>
          ((split.categoryId ? catStore.getCategoryById(split.categoryId) : undefined) ||
            catStore.getCategoryByName(split.categoryName, 'expense'))?.id,
      );
      setItemCategories(seeded);
      setSplitDropped(dropped);
```

Imports at the top of the file:

```ts
import { proposedKey, isProposedKey, proposedName } from '@/features/receipt/proposedCategory';
import { seedItemCategories } from '@/features/receipt/seedItemCategories';
```

- [ ] **Step 3: Teach the recompute to name a proposal**

Replace the `categoryName` line inside the `currentSplits` memo (line 141):

```ts
        categoryName: categoryId
          ? isProposedKey(categoryId)
            ? proposedName(categoryId)
            : catStore.getCategoryById(categoryId)?.name ?? null
          : null,
```

- [ ] **Step 4: Mark proposed chips**

In `CategorySplitChips.tsx`, import the helper and render the marker:

```ts
import { isProposedKey } from '@/features/receipt/proposedCategory';
```

```tsx
          {splits.map((split) => {
            const proposed = isProposedKey(split.categoryId);
            return (
              <View key={split.categoryId} style={[styles.chip, proposed && styles.chipProposed]}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {proposed ? '+ ' : ''}{split.categoryName} {formatCurrency(split.amount, currencyCode as Currency)}
                </Text>
              </View>
            );
          })}
```

Add to `createStyles`:

```ts
  chipProposed: {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent' as const,
  },
```

- [ ] **Step 5: Offer proposals in the item sheet**

`ItemCategorySheet.tsx` needs the helpers imported:

```ts
import { proposedKey, isProposedKey, proposedName } from '@/features/receipt/proposedCategory';
```

and gains one prop:

```ts
interface Props {
  visible: boolean;
  items: ItemCategorySheetItem[];
  categories: Category[];
  /** Names of categories the server proposed; picked with a `new:` sentinel id. */
  proposedNames: string[];
  onChange: (itemIndex: number, categoryId: string | null) => void;
  onClose: () => void;
}
```

The current-category label (line 73-75) must resolve a sentinel:

```tsx
                      <Text style={[styles.categoryLine, !item.categoryId && styles.categoryLineUnassigned]}>
                        {t('receiptCategorySplit.itemCategory')}:{' '}
                        {isProposedKey(item.categoryId)
                          ? `${proposedName(item.categoryId as string)} (${t('receiptCategorySplit.newCategory')})`
                          : category
                            ? category.name
                            : t('receiptCategorySplit.unassigned')}
                      </Text>
```

And the picker list gains the proposed rows immediately after the "unassigned" row and before `categories.map`:

```tsx
                      {proposedNames.map((name) => {
                        const key = proposedKey(name);
                        const selected = key === item.categoryId;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={styles.pickerRow}
                            onPress={() => {
                              onChange(item.index, key);
                              setExpandedIndex(null);
                            }}
                          >
                            <Ionicons
                              name="add-circle-outline"
                              size={16}
                              color={selected ? theme.colors.primary : theme.colors.textSecondary}
                            />
                            <Text
                              style={[styles.pickerRowText, selected && styles.pickerRowTextSelected]}
                              numberOfLines={1}
                            >
                              {name} ({t('receiptCategorySplit.newCategory')})
                            </Text>
                            {selected && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                          </TouchableOpacity>
                        );
                      })}
```

In `receipt.tsx`, pass the prop where the sheet is rendered (~line 492):

```tsx
              proposedNames={proposedNamesInPlay}
```

computed above the return:

```ts
  // Names still attached to at least one line. A proposal the user emptied
  // disappears from the picker and is never created.
  const proposedNamesInPlay = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(itemCategories)
            .filter(isProposedKey)
            .map((key) => proposedName(key as string)),
        ),
      ),
    [itemCategories],
  );
```

- [ ] **Step 6: Create the categories on save**

In `handleConfirmExpense`, before the `items` array is built (line ~183), insert:

```ts
      // Proposals become real categories only here — a scan the user abandons
      // must leave the account exactly as it found it. createCategory is
      // idempotent on (name, type) and offline-first.
      const realIdByKey = new Map<string, string>();
      for (const name of proposedNamesInPlay) {
        const created = await useCategoryStore.getState().createCategory(name, 'expense', '🏷️');
        realIdByKey.set(proposedKey(name), created.id);
      }
      const resolveKey = (key: string | null | undefined): string | undefined =>
        key ? realIdByKey.get(key) ?? key : undefined;
```

Then use it in the two places that carry a category id — the item mapping (line 191) and the splits payload (line 227-229):

```ts
        categoryId: resolveKey(itemCategories[index]),
```

```ts
        splits: currentSplits.length > 1
          ? currentSplits.map((s) => ({
              categoryId: resolveKey(s.categoryId) as string,
              amount: s.amount,
              percentage: s.percentage,
            }))
          : undefined,
```

- [ ] **Step 7: Verify**

Run: `cd apps/mobile && npx jest src/features/receipt`
Expected: PASS.
Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.
Then run the app on web (`npm run dev:web`), scan a receipt on an account with few categories, and confirm: a `+` chip appears, opening the editor lists the proposal, moving its last line away makes it vanish, and saving creates exactly one category with icon 🏷️.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/expense/receipt.tsx apps/mobile/src/components/receipt/CategorySplitChips.tsx apps/mobile/src/components/receipt/ItemCategorySheet.tsx apps/mobile/src/i18n/locales
git commit -m "Show proposed receipt categories and create them on save"
```

---

### Task 6: Bots create proposed categories on confirm

**Files:**
- Modify: `apps/api/src/modules/ai/utils/receipt-split-items.ts` (add `resolveProposedSplits`)
- Modify: `apps/api/src/modules/ai/utils/receipt-split-items.spec.ts`
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts`
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/photo.handler.ts`

**Interfaces:**
- Consumes: `buildItemCategoryMap` (Task 1), `ReceiptCategorySplitPayload` (Task 3).
- Produces: `resolveProposedSplits(splits, createCategory)`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/ai/utils/receipt-split-items.spec.ts`:

```ts
import { resolveProposedSplits } from './receipt-split-items';

describe('resolveProposedSplits', () => {
  it('creates a category for a proposal and substitutes its id', async () => {
    const createCategory = jest.fn().mockResolvedValue({ id: 'c-new' });

    const resolved = await resolveProposedSplits(
      [
        { categoryId: 'c-food', categoryName: 'Groceries', amount: 20, percentage: 66.67, itemIndexes: [0] },
        { categoryId: null, categoryName: 'Chemia', amount: 10, percentage: 33.33, itemIndexes: [1] },
      ],
      createCategory,
    );

    expect(createCategory).toHaveBeenCalledTimes(1);
    expect(createCategory).toHaveBeenCalledWith('Chemia');
    expect(resolved.map((s) => s.categoryId)).toEqual(['c-food', 'c-new']);
    expect(resolved.reduce((sum, s) => sum + s.amount, 0)).toBeCloseTo(30, 2);
  });

  it('creates one category even when two groups share a proposed name', async () => {
    const createCategory = jest.fn().mockResolvedValue({ id: 'c-new' });

    await resolveProposedSplits(
      [
        { categoryId: null, categoryName: 'Chemia', amount: 5, percentage: 50, itemIndexes: [0] },
        { categoryId: null, categoryName: 'Chemia', amount: 5, percentage: 50, itemIndexes: [1] },
      ],
      createCategory,
    );

    expect(createCategory).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/ai/utils/receipt-split-items.spec.ts`
Expected: FAIL — `resolveProposedSplits` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/api/src/modules/ai/utils/receipt-split-items.ts`:

```ts
export interface ResolvedSplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

/**
 * Turns a scan payload into splits an expense create can accept, creating a
 * category for every proposed group. Called on the bots' confirm branch — the
 * point at which the user has explicitly agreed to the receipt — never when the
 * photo arrives.
 *
 * `createCategory` is injected rather than a service dependency so this stays
 * pure enough to unit-test; every caller passes the idempotent
 * `CategoriesService.create`, which returns the existing row on a name clash.
 */
export async function resolveProposedSplits(
  splits: Array<SplitWithLines & { categoryName: string; amount: number; percentage: number }>,
  createCategory: (name: string) => Promise<{ id: string }>,
): Promise<ResolvedSplit[]> {
  const createdByName = new Map<string, string>();
  const resolved: ResolvedSplit[] = [];

  for (const split of splits) {
    let categoryId = split.categoryId;
    if (!categoryId) {
      categoryId =
        createdByName.get(split.categoryName) ?? (await createCategory(split.categoryName)).id;
      createdByName.set(split.categoryName, categoryId);
    }
    resolved.push({
      categoryId,
      categoryName: split.categoryName,
      amount: split.amount,
      percentage: split.percentage,
      itemIndexes: split.itemIndexes,
    });
  }

  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/ai/utils/receipt-split-items.spec.ts`
Expected: PASS (5 tests total in the file).

- [ ] **Step 5: Wire it into all three bots**

In each handler, add `CategoriesService` to the constructor (each bot module already provides it — its `category.handler.ts` uses it; if a module does not, add `CategoriesModule` to that module's `imports`):

```ts
    private readonly categoriesService: CategoriesService,
```

In the confirm branch, replace the `buildItemCategoryMap` line added in Task 1 with:

```ts
      const resolvedSplits = await resolveProposedSplits(
        data.categorySplits ?? [],
        (name) => this.categoriesService.create(data.accountId, data.userId, { name, type: 'expense', icon: '🏷️' }),
      );
      const itemCategoryIds = buildItemCategoryMap(resolvedSplits);
```

and pass the resolved list to the create call:

```ts
          splits: resolvedSplits.length ? resolvedSplits : undefined,
```

- [ ] **Step 6: Verify**

Run: `cd apps/api && npx jest src/modules/telegram src/modules/whatsapp src/modules/slack src/modules/ai`
Expected: PASS.
Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/utils/receipt-split-items.ts apps/api/src/modules/ai/utils/receipt-split-items.spec.ts apps/api/src/modules/telegram/handlers/photo.handler.ts apps/api/src/modules/whatsapp/handlers/photo.handler.ts apps/api/src/modules/slack/handlers/photo.handler.ts
git commit -m "Create proposed receipt categories when a bot receipt is confirmed"
```

---

### Task 7: Regression guard for the production case, and documentation

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.spec.ts`
- Modify: `CLAUDE.md` (the "Receipt category auto-split (ABA-398)" entry)
- Modify: `user_docs/<lang>/` receipt/scan sections, all 9 languages

- [ ] **Step 1: Write the regression test**

The exact production shape that produced the silence — three categories on offer, a grocery receipt, everything legitimately in one of them, the model proposing nothing. Task 3's refusal test uses a single category; this one proves the refusal is about the *outcome* having one group, not about having had one choice.

Append inside the `describe('OcrService.runCategorySplit with proposals')` block:

```ts
  it('refuses when three categories were on offer and everything still lands in one (ABA-398 production case)', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'c-bills', name: 'Bills & Utilities' },
      { id: 'c-fun', name: 'Entertainment' },
      { id: 'c-food', name: 'Food & Dining' },
    ]);
    categorySplitterMock.classify.mockResolvedValue({
      assignments: new Map([[0, 'c-food'], [1, 'c-food'], [2, 'c-food']]),
      proposals: [],
    });

    const splits = await (service as any).runCategorySplit(
      'a1',
      {
        amount: 33,
        receiptItems: [
          { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 8 },
          { description: 'Whisky G Loch 0,7l', canonicalName: 'Whisky G Loch 0,7l', totalPrice: 20 },
          { description: 'Tulipan 9 Sztuk', canonicalName: 'Tulipan 9 Sztuk', totalPrice: 5 },
        ],
      } as any,
      'u1',
    );

    expect(splits).toEqual([]);
  });
```

- [ ] **Step 2: Run the whole API and mobile suites**

Run: `cd apps/api && npx jest`
Run: `cd apps/mobile && npx jest`
Expected: PASS in both. Investigate any failure — do not skip a test.

- [ ] **Step 3: Update CLAUDE.md**

Extend the ABA-398 entry with: proposals (`newCategories`, validation rules, `MAX_PROPOSED_CATEGORIES`, the account-language rule), the `categoryId: null` transport convention and both sentinel prefixes, the fact that rule learning is now save-time only with `expenses.service.ts:517` as the single writer, that bots now carry `items[].categoryId` and create proposed categories on confirm, and the `[CategorySplit]` log reasons.

- [ ] **Step 4: Update user docs in 9 languages**

In each `user_docs/<lang>/` receipt-scanning section, add a short paragraph: the app may suggest a category that does not exist yet, it is shown with a `+`, it is created only when the receipt is saved, and it can be reassigned or dropped before that.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/services/ocr.service.spec.ts CLAUDE.md user_docs
git commit -m "Pin the single-category refusal and document category proposals"
```

- [ ] **Step 6: Close out the task**

Use the `finish-aba-task` skill to create the ABA issue and finish the documentation pass. Do not push — this repo requires explicit approval before any push.
