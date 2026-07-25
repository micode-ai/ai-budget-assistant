# Receipt Price Check — API Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare every line of a freshly scanned receipt against what the user normally pays for that product in that store, return the findings in the scan response, and persist them as a non-pushing anomaly alert.

**Architecture:** A pure, IO-free comparison engine (`receipt-check.util.ts`) is called from exactly two places: inline from `OcrService` right after a receipt is parsed (so the app and all three bots get findings through one funnel), and post-create from a new `AnomalyService` detector that persists one alert per receipt. `PriceHistoryService` gains a narrowed query so the scan path never reads the account's whole item history.

**Tech Stack:** NestJS 10, Prisma 5, Jest. No new dependencies. No LLM calls. No database migration.

Spec: `docs/superpowers/specs/2026-07-25-receipt-price-check-design.md`

## Global Constraints

- **Copy may never accuse.** The data cannot prove a promotion failed to apply. No string, log line, or field name may claim "overcharged", "cheated", or "promo not applied". The user-facing framing is "more expensive than usual — check the receipt". (`overpaidAmount` is an internal field name and stays internal.)
- **Fail-silent.** If the price check throws, receipt scanning must still succeed with an empty findings list. A price comparison never breaks a scan.
- **Never compare across currencies.** No FX conversion anywhere in this feature.
- **No push notifications** for the new alert type. No new `NotificationType`, no new preference toggle.
- **No LLM in the hot path.** The engine is deterministic arithmetic.
- **`apps/api` must not import runtime values from `@budget/shared-types`/`shared-utils`** — `import type` only. Interfaces are fine; the config constants therefore live in the API-local util, never in shared-types. A runtime import fails the deploy guard (`scripts/check-no-shared-utils-runtime-import.sh`).
- **No migration in this plan.** `price_overcharge` is a plain string in `anomaly_alerts.type` (precedent: `possible_merge`).

## Deviations from the spec — read before starting

Three deliberate narrowings, all recorded here rather than silently applied:

1. **`checkReceiptPrices` returns `{ findings, stats }`, not `ReceiptCheckFinding[]`.** The spec requires cap-drops to be logged; a pure function cannot log, so it reports drop counts and the calling service logs them.
2. **Community prices are implemented in the util but not wired into the services in this plan.** The `community` parameter is built and unit-tested, but no service injects `CommunityPriceService` yet. Because `COMMUNITY_PRICE_READ_ENABLED` defaults to OFF, this is zero user-visible difference today. Wiring is Plan 3.
3. **The "cheaper nearby" hint is deferred to Plan 3.** It needs the community store map, which is the same wiring as point 2.

Plan 2 covers the `size` field end-to-end plus the mobile UI and i18n. Until then the size gate is inert by design — it abstains when either side lacks a size.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/entities/anomaly-alert.ts` | add `'price_overcharge'` to the alert-type union |
| `packages/shared-types/src/dto/receipt-check.ts` | **create** — `ReceiptCheckFinding` (shared with mobile in Plan 2) |
| `apps/api/src/modules/price-history/receipt-check.util.ts` | **create** — the whole engine: grouping, median baseline, gates, config. Pure. |
| `apps/api/src/modules/price-history/receipt-check.util.spec.ts` | **create** — engine tests |
| `apps/api/src/modules/price-history/price-history.service.ts` | add `getProductTrendsFor` (narrowed query) |
| `apps/api/src/modules/ai/services/ocr.service.ts` | add `finalizeReceipt`, `priceFindings` on `ReceiptExpense`, convert 4 call sites |
| `apps/api/src/modules/ai/ai.module.ts` | import `PriceHistoryModule` |
| `apps/api/src/modules/anomaly/anomaly.service.ts` | `skipPush` on `createAlert`, new `detectPriceOvercharge` |
| `apps/api/src/modules/anomaly/anomaly.module.ts` | import `PriceHistoryModule` |
| `apps/api/src/modules/{telegram,whatsapp,slack}/handlers/photo.handler.ts` | one summary line in the bot reply |

---

### Task 1: Types

**Files:**
- Modify: `packages/shared-types/src/entities/anomaly-alert.ts`
- Create: `packages/shared-types/src/dto/receipt-check.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AnomalyAlertType` now includes `'price_overcharge'`; `ReceiptCheckFinding` with fields `canonicalName: string`, `size: string | null`, `merchant: string`, `currencyCode: string`, `paidUnitPrice: number`, `baselineUnitPrice: number`, `quantity: number`, `changePct: number`, `overpaidAmount: number`, `source: 'personal' | 'community'`, `confidence: 'high' | 'low'`.

- [ ] **Step 1: Add the alert type**

In `packages/shared-types/src/entities/anomaly-alert.ts`, extend the union:

```ts
export type AnomalyAlertType =
  | 'category_spike'
  | 'price_increase'
  | 'duplicate_charge'
  | 'recurring_suggestion'
  | 'possible_merge'
  | 'price_overcharge';
```

- [ ] **Step 2: Create the finding DTO**

Create `packages/shared-types/src/dto/receipt-check.ts`:

```ts
/**
 * One receipt line that costs measurably more than the user's usual price for
 * that product in that store. Presented as "more expensive than usual — check
 * the receipt"; it is NOT a claim that anyone was overcharged.
 */
export interface ReceiptCheckFinding {
  canonicalName: string;
  /** Pack size as printed, when known. Compared for equality only — never converted. */
  size: string | null;
  merchant: string;
  currencyCode: string;
  paidUnitPrice: number;
  /** Median of the user's prior prices for this product in this store. */
  baselineUnitPrice: number;
  quantity: number;
  /** Percent above the baseline, 1 decimal. */
  changePct: number;
  /** (paid − baseline) × quantity, 2 decimals, in currencyCode. */
  overpaidAmount: number;
  source: 'personal' | 'community';
  /** 'high' when backed by 3+ prior purchases, 'low' when backed by exactly 2. */
  confidence: 'high' | 'low';
}
```

- [ ] **Step 3: Export it from the barrel**

Add to `packages/shared-types/src/dto/index.ts`:

```ts
export * from './receipt-check';
```

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/entities/anomaly-alert.ts packages/shared-types/src/dto/receipt-check.ts packages/shared-types/src/dto/index.ts
git commit -m "feat(types): add price_overcharge alert type and ReceiptCheckFinding"
```

---

### Task 2: Engine — line grouping and median baseline

**Files:**
- Create: `apps/api/src/modules/price-history/receipt-check.util.ts`
- Test: `apps/api/src/modules/price-history/receipt-check.util.spec.ts`

**Interfaces:**
- Consumes: `ReceiptCheckFinding` (Task 1, `import type`).
- Produces: `ReceiptCheckLine`, `ReceiptCheckPoint`, `ReceiptCheckHistory`, `ReceiptCheckConfig`, `RECEIPT_CHECK_DEFAULTS`, `median(values: number[]): number`, `groupReceiptLines(lines: ReceiptCheckLine[]): ReceiptCheckLine[]`, `checkReceiptPrices(input): ReceiptCheckResult`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/price-history/receipt-check.util.spec.ts`:

```ts
import { median, groupReceiptLines, checkReceiptPrices, RECEIPT_CHECK_DEFAULTS } from './receipt-check.util';

const NOW = new Date('2026-07-25T12:00:00Z');

describe('median', () => {
  it('returns the middle value for an odd count', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('groupReceiptLines', () => {
  it('merges duplicate lines with a quantity-weighted unit price', () => {
    const out = groupReceiptLines([
      { canonicalName: 'Piwo Zubr', unitPrice: 3, quantity: 2 },
      { canonicalName: 'Piwo Zubr', unitPrice: 6, quantity: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    // (3*2 + 6*1) / 3 = 4
    expect(out[0].unitPrice).toBe(4);
  });

  it('keeps different sizes apart', () => {
    const out = groupReceiptLines([
      { canonicalName: 'Mleko', size: '1L', unitPrice: 4, quantity: 1 },
      { canonicalName: 'Mleko', size: '500ML', unitPrice: 2.5, quantity: 1 },
    ]);
    expect(out).toHaveLength(2);
  });

  it('drops lines with a blank product name and defaults a non-positive quantity to 1', () => {
    const out = groupReceiptLines([
      { canonicalName: '   ', unitPrice: 5, quantity: 1 },
      { canonicalName: 'Chleb', unitPrice: 5, quantity: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(1);
  });
});

describe('checkReceiptPrices — baseline', () => {
  it('uses the median of prior prices, so one promo price cannot manufacture a finding', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 1 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          // median = 20; a single 12 zł promo does not drag the baseline down
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-08', price: 12 },
            { date: '2026-07-15', price: 20 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].baselineUnitPrice).toBe(20);
    expect(res.findings[0].changePct).toBe(20);
    expect(res.findings[0].overpaidAmount).toBe(4);
    expect(res.findings[0].source).toBe('personal');
    expect(res.findings[0].confidence).toBe('high');
  });

  it('multiplies the gap by quantity', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 3 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-15', price: 20 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings[0].overpaidAmount).toBe(12);
    // exactly 2 prior points → low confidence
    expect(res.findings[0].confidence).toBe('low');
  });

  it('returns nothing when the product has no history', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Nowy Produkt', unitPrice: 99, quantity: 1 }],
      history: [],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toEqual([]);
  });

  it('ignores points older than the lookback window', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 1 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2025-01-01', price: 10 },
            { date: '2025-01-02', price: 10 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      config: RECEIPT_CHECK_DEFAULTS,
    });
    expect(res.findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest receipt-check.util`
Expected: FAIL — `Cannot find module './receipt-check.util'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/price-history/receipt-check.util.ts`:

```ts
import type { ReceiptCheckFinding } from '@budget/shared-types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReceiptCheckLine {
  canonicalName: string;
  /** Pack size as printed on the receipt, when the OCR extracted one. */
  size?: string | null;
  unitPrice: number;
  quantity: number;
}

export interface ReceiptCheckPoint {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  /** Per-unit price. */
  price: number;
  /** Populated from Plan 2 onward; undefined until then, which makes the size gate abstain. */
  size?: string | null;
}

export interface ReceiptCheckHistory {
  canonicalName: string;
  currency: string;
  points: ReceiptCheckPoint[];
}

export interface CommunityBaseline {
  canonicalName: string;
  medianPrice: number;
  currency: string;
}

export interface ReceiptCheckConfig {
  lookbackWeeks: number;
  minPoints: number;
  minRisePct: number;
  maxRisePct: number;
  minAmount: number;
  maxFindings: number;
}

export const RECEIPT_CHECK_DEFAULTS: ReceiptCheckConfig = {
  lookbackWeeks: 12,
  minPoints: 2,
  minRisePct: 15,
  maxRisePct: 100,
  minAmount: 1.0,
  maxFindings: 5,
};

export interface ReceiptCheckResult {
  findings: ReceiptCheckFinding[];
  stats: {
    /** Grouped receipt lines that had usable history. */
    evaluated: number;
    /** Dropped because the rise exceeded maxRisePct — probably a different pack size. */
    droppedByCap: number;
    /** Dropped because a known size did not match the history. */
    droppedBySize: number;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeSize(size?: string | null): string | null {
  const s = size?.trim().toLowerCase();
  return s ? s : null;
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * A receipt often lists the same product on several lines. Group by
 * (name, size) and take the quantity-weighted average unit price, so one
 * product can produce at most one finding.
 */
export function groupReceiptLines(lines: ReceiptCheckLine[]): ReceiptCheckLine[] {
  const groups = new Map<
    string,
    { canonicalName: string; size: string | null; quantity: number; total: number }
  >();

  for (const line of lines) {
    const name = line.canonicalName?.trim();
    if (!name) continue;
    const quantity = line.quantity > 0 ? line.quantity : 1;
    const size = normalizeSize(line.size);
    const key = `${normalizeName(name)}|${size ?? ''}`;
    const group = groups.get(key) ?? { canonicalName: name, size: line.size ?? null, quantity: 0, total: 0 };
    group.quantity += quantity;
    group.total += line.unitPrice * quantity;
    groups.set(key, group);
  }

  return [...groups.values()].map((g) => ({
    canonicalName: g.canonicalName,
    size: g.size,
    quantity: g.quantity,
    unitPrice: g.total / g.quantity,
  }));
}

export function checkReceiptPrices(input: {
  lines: ReceiptCheckLine[];
  history: ReceiptCheckHistory[];
  merchant: string;
  currencyCode: string;
  now: Date;
  community?: CommunityBaseline[];
  config?: ReceiptCheckConfig;
}): ReceiptCheckResult {
  const cfg = input.config ?? RECEIPT_CHECK_DEFAULTS;
  const cutoff = new Date(input.now.getTime() - cfg.lookbackWeeks * 7 * DAY_MS);

  const historyByName = new Map<string, ReceiptCheckHistory>();
  for (const h of input.history) historyByName.set(normalizeName(h.canonicalName), h);

  const findings: ReceiptCheckFinding[] = [];
  let evaluated = 0;
  let droppedByCap = 0;
  let droppedBySize = 0;

  for (const line of groupReceiptLines(input.lines)) {
    const history = historyByName.get(normalizeName(line.canonicalName));
    if (!history) continue;
    // Never compare across currencies.
    if (history.currency !== input.currencyCode) continue;

    let points = history.points.filter((p) => new Date(p.date).getTime() >= cutoff.getTime());

    // Size gate: only applies when the size is known on BOTH sides. Unknown on
    // either side means abstain, not block.
    const lineSize = normalizeSize(line.size);
    if (lineSize) {
      const sized = points.filter((p) => normalizeSize(p.size) !== null);
      if (sized.length > 0) {
        const matching = sized.filter((p) => normalizeSize(p.size) === lineSize);
        if (matching.length < cfg.minPoints) {
          droppedBySize++;
          continue;
        }
        points = matching;
      }
    }

    if (points.length < cfg.minPoints) continue;

    const baseline = median(points.map((p) => p.price));
    if (baseline <= 0) continue;
    evaluated++;

    const changePct = ((line.unitPrice - baseline) / baseline) * 100;
    if (changePct < cfg.minRisePct) continue;
    if (changePct > cfg.maxRisePct) {
      droppedByCap++;
      continue;
    }

    const overpaidAmount = (line.unitPrice - baseline) * line.quantity;
    if (overpaidAmount < cfg.minAmount) continue;

    findings.push({
      canonicalName: line.canonicalName,
      size: line.size ?? null,
      merchant: input.merchant,
      currencyCode: input.currencyCode,
      paidUnitPrice: round2(line.unitPrice),
      baselineUnitPrice: round2(baseline),
      quantity: line.quantity,
      changePct: round1(changePct),
      overpaidAmount: round2(overpaidAmount),
      source: 'personal',
      confidence: points.length >= 3 ? 'high' : 'low',
    });
  }

  findings.sort((a, b) => b.overpaidAmount - a.overpaidAmount);

  return {
    findings: findings.slice(0, cfg.maxFindings),
    stats: { evaluated, droppedByCap, droppedBySize },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest receipt-check.util`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-history/receipt-check.util.ts apps/api/src/modules/price-history/receipt-check.util.spec.ts
git commit -m "feat(price-history): add receipt price-check engine with median baseline"
```

---

### Task 3: Engine — the remaining gates

**Files:**
- Modify: `apps/api/src/modules/price-history/receipt-check.util.spec.ts`
- Modify: `apps/api/src/modules/price-history/receipt-check.util.ts` (only if a test fails)

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: no new exports. This task proves the gates written in Task 2 behave, and fixes them if not.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/price-history/receipt-check.util.spec.ts`:

```ts
const priorPoints = (price: number, count: number): { date: string; price: number }[] =>
  Array.from({ length: count }, (_, i) => ({ date: `2026-07-0${i + 1}`, price }));

const check = (
  line: { canonicalName: string; unitPrice: number; quantity: number; size?: string | null },
  points: { date: string; price: number; size?: string | null }[],
  overrides: Partial<typeof RECEIPT_CHECK_DEFAULTS> = {},
  currency = 'PLN',
) =>
  checkReceiptPrices({
    lines: [line],
    history: [{ canonicalName: line.canonicalName, currency, points }],
    merchant: 'Biedronka',
    currencyCode: 'PLN',
    now: NOW,
    config: { ...RECEIPT_CHECK_DEFAULTS, ...overrides },
  });

describe('checkReceiptPrices — gates', () => {
  it('needs at least minPoints prior purchases', () => {
    const res = check({ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }, priorPoints(20, 1));
    expect(res.findings).toEqual([]);
  });

  it('ignores a rise below minRisePct', () => {
    // 20 → 22 is +10%, under the 15% floor
    const res = check({ canonicalName: 'Kawa', unitPrice: 22, quantity: 1 }, priorPoints(20, 2));
    expect(res.findings).toEqual([]);
  });

  it('drops a rise above maxRisePct as a probable pack-size change, and counts it', () => {
    // 20 → 60 is +200%
    const res = check({ canonicalName: 'Mleko', unitPrice: 60, quantity: 1 }, priorPoints(20, 2));
    expect(res.findings).toEqual([]);
    expect(res.stats.droppedByCap).toBe(1);
  });

  it('ignores a gap smaller than minAmount', () => {
    // 2.00 → 2.40 is +20% but only 0.40 zł
    const res = check({ canonicalName: 'Bulka', unitPrice: 2.4, quantity: 1 }, priorPoints(2, 2));
    expect(res.findings).toEqual([]);
  });

  it('never compares across currencies', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'EUR', points: priorPoints(20, 3) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toEqual([]);
  });

  it('drops the line when a known size does not match the history', () => {
    const res = check(
      { canonicalName: 'Mleko', unitPrice: 8, quantity: 1, size: '1L' },
      [
        { date: '2026-07-01', price: 4, size: '500ML' },
        { date: '2026-07-08', price: 4, size: '500ML' },
      ],
    );
    expect(res.findings).toEqual([]);
    expect(res.stats.droppedBySize).toBe(1);
  });

  it('abstains from the size gate when the history has no sizes', () => {
    const res = check({ canonicalName: 'Mleko', unitPrice: 6, quantity: 1, size: '1L' }, priorPoints(4, 3));
    expect(res.findings).toHaveLength(1);
  });

  it('returns only the top maxFindings, ranked by amount', () => {
    const res = checkReceiptPrices({
      // Amounts must differ, or "ranked by amount" is a tie and the expected
      // order is arbitrary. Against a common baseline of 20 these give +6, +10
      // and +16 (rises of 30%, 50%, 80% — all inside the 15%-100% gates).
      lines: [
        { canonicalName: 'A', unitPrice: 26, quantity: 1 },
        { canonicalName: 'B', unitPrice: 30, quantity: 1 },
        { canonicalName: 'C', unitPrice: 36, quantity: 1 },
      ],
      history: [
        { canonicalName: 'A', currency: 'PLN', points: priorPoints(20, 2) },
        { canonicalName: 'B', currency: 'PLN', points: priorPoints(20, 2) },
        { canonicalName: 'C', currency: 'PLN', points: priorPoints(20, 2) },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      config: { ...RECEIPT_CHECK_DEFAULTS, maxFindings: 2 },
    });
    expect(res.findings.map((f) => f.canonicalName)).toEqual(['C', 'B']);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && npx jest receipt-check.util`
Expected: PASS. The gates were implemented in Task 2; these tests pin them down. If any fails, fix `receipt-check.util.ts` — do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/price-history/receipt-check.util.spec.ts apps/api/src/modules/price-history/receipt-check.util.ts
git commit -m "test(price-history): pin down every receipt price-check gate"
```

---

### Task 4: Engine — community fallback baseline and env config

**Files:**
- Modify: `apps/api/src/modules/price-history/receipt-check.util.ts`
- Modify: `apps/api/src/modules/price-history/receipt-check.util.spec.ts`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `resolveReceiptCheckConfig(env: Record<string, string | undefined>): ReceiptCheckConfig`. Community baselines now act as a fallback when personal history is too thin, producing findings with `source: 'community'`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/price-history/receipt-check.util.spec.ts`:

```ts
import { resolveReceiptCheckConfig } from './receipt-check.util';

describe('community fallback', () => {
  it('uses a community baseline when personal history is too thin', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'PLN', points: priorPoints(20, 1) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 20, currency: 'PLN' }],
    });
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].source).toBe('community');
    expect(res.findings[0].confidence).toBe('low');
  });

  it('prefers personal history over community when both are available', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'PLN', points: priorPoints(20, 3) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 10, currency: 'PLN' }],
    });
    expect(res.findings[0].source).toBe('personal');
    expect(res.findings[0].baselineUnitPrice).toBe(20);
  });

  it('ignores a community baseline in another currency', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 20, currency: 'EUR' }],
    });
    expect(res.findings).toEqual([]);
  });
});

describe('resolveReceiptCheckConfig', () => {
  it('falls back to the defaults when nothing is set', () => {
    expect(resolveReceiptCheckConfig({})).toEqual(RECEIPT_CHECK_DEFAULTS);
  });

  it('reads overrides from the environment', () => {
    const cfg = resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: '25', RECEIPT_CHECK_MAX_FINDINGS: '3' });
    expect(cfg.minRisePct).toBe(25);
    expect(cfg.maxFindings).toBe(3);
    expect(cfg.minPoints).toBe(RECEIPT_CHECK_DEFAULTS.minPoints);
  });

  it('ignores a non-numeric override instead of producing NaN', () => {
    expect(resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: 'abc' }).minRisePct).toBe(
      RECEIPT_CHECK_DEFAULTS.minRisePct,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest receipt-check.util`
Expected: FAIL — `resolveReceiptCheckConfig` is not exported, and the community tests find no findings.

- [ ] **Step 3: Add the env resolver**

Append to `apps/api/src/modules/price-history/receipt-check.util.ts`:

```ts
function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveReceiptCheckConfig(env: Record<string, string | undefined>): ReceiptCheckConfig {
  return {
    lookbackWeeks: num(env.RECEIPT_CHECK_LOOKBACK_WEEKS, RECEIPT_CHECK_DEFAULTS.lookbackWeeks),
    minPoints: num(env.RECEIPT_CHECK_MIN_POINTS, RECEIPT_CHECK_DEFAULTS.minPoints),
    minRisePct: num(env.RECEIPT_CHECK_MIN_RISE_PCT, RECEIPT_CHECK_DEFAULTS.minRisePct),
    maxRisePct: num(env.RECEIPT_CHECK_MAX_RISE_PCT, RECEIPT_CHECK_DEFAULTS.maxRisePct),
    minAmount: num(env.RECEIPT_CHECK_MIN_AMOUNT, RECEIPT_CHECK_DEFAULTS.minAmount),
    maxFindings: num(env.RECEIPT_CHECK_MAX_FINDINGS, RECEIPT_CHECK_DEFAULTS.maxFindings),
  };
}
```

- [ ] **Step 4: Add the community fallback**

In `checkReceiptPrices`, build a lookup before the loop:

```ts
  const communityByName = new Map<string, CommunityBaseline>();
  for (const c of input.community ?? []) communityByName.set(normalizeName(c.canonicalName), c);
```

**First, make the fallback reachable.** Task 2 skips a line outright when the product has no personal history, which would make the community branch dead code for exactly the products that need it most. Replace:

```ts
    const history = historyByName.get(normalizeName(line.canonicalName));
    if (!history) continue;
    // Never compare across currencies.
    if (history.currency !== input.currencyCode) continue;

    let points = history.points.filter((p) => new Date(p.date).getTime() >= cutoff.getTime());
```

with:

```ts
    const history = historyByName.get(normalizeName(line.canonicalName));
    // A product absent from the personal history can still be checked against a
    // community baseline below, so a missing entry is not a skip. A PRESENT
    // entry in another currency is — never compare across currencies.
    if (history && history.currency !== input.currencyCode) continue;

    let points = (history?.points ?? []).filter((p) => new Date(p.date).getTime() >= cutoff.getTime());
```

Then replace the block that currently reads

```ts
    if (points.length < cfg.minPoints) continue;

    const baseline = median(points.map((p) => p.price));
    if (baseline <= 0) continue;
    evaluated++;
```

with

```ts
    let baseline: number;
    let source: 'personal' | 'community';
    let pointCount: number;

    if (points.length >= cfg.minPoints) {
      baseline = median(points.map((p) => p.price));
      source = 'personal';
      pointCount = points.length;
    } else {
      // Personal history is too thin — fall back to the crowdsourced baseline
      // when one exists for this product in the same currency.
      const community = communityByName.get(normalizeName(line.canonicalName));
      if (!community || community.currency !== input.currencyCode) continue;
      baseline = community.medianPrice;
      source = 'community';
      // A crowd baseline never earns high confidence on its own.
      pointCount = 0;
    }

    if (baseline <= 0) continue;
    evaluated++;
```

Then use `source` and `pointCount` in the pushed finding, replacing the two hard-coded fields:

```ts
      source,
      confidence: pointCount >= 3 ? 'high' : 'low',
```

Note that the currency gate earlier in the loop (`history.currency !== input.currencyCode`) skips the line before the fallback can run, so a product whose only signal is community-side must reach this code with **no** personal history entry at all — which is exactly what the third community test asserts.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest receipt-check.util`
Expected: PASS, 27 tests (9 from Task 2 + 8 from Task 3 + 10 added here).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/price-history/receipt-check.util.ts apps/api/src/modules/price-history/receipt-check.util.spec.ts
git commit -m "feat(price-history): community fallback baseline and env-tunable price-check config"
```

---

### Task 5: Narrowed price query

**Files:**
- Modify: `apps/api/src/modules/price-history/price-history.service.ts`
- Test: `apps/api/src/modules/price-history/price-history.service.spec.ts`

**Interfaces:**
- Consumes: `ReceiptCheckHistory` (Task 2).
- Produces: `PriceHistoryService.getProductTrendsFor(accountId: string, canonicalNames: string[], merchantNormalized: string, since: Date): Promise<ReceiptCheckHistory[]>`.

**Why:** `getProductTrends` reads the account's entire item history and builds a series for every product ever bought. Calling it on every receipt scan is unacceptable. This sibling narrows to the products on one receipt, one merchant, one window.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/price-history/price-history.service.spec.ts` (follow the existing file's `describe`/mock style; the fragment below assumes its `service` and `prisma` fixtures):

```ts
describe('getProductTrendsFor', () => {
  it('queries only the requested products, merchant and window, and returns per-unit series', async () => {
    (prisma as any).productAlias = { findMany: jest.fn().mockResolvedValue([]) };
    (prisma as any).expenseItem = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'i1',
          canonicalName: 'Kawa',
          unitPrice: 20,
          quantity: 1,
          totalPrice: 20,
          size: null,
          expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' },
        },
        {
          id: 'i2',
          canonicalName: 'Kawa',
          // quantity > 1 → per-unit price comes from totalPrice / quantity
          unitPrice: 44,
          quantity: 2,
          totalPrice: 44,
          size: null,
          expense: { date: new Date('2026-07-08'), merchant: 'Biedronka', currencyCode: 'PLN' },
        },
      ]),
    };

    const since = new Date('2026-05-01');
    const out = await service.getProductTrendsFor('acc-1', ['Kawa'], 'biedronka', since);

    const where = (prisma as any).expenseItem.findMany.mock.calls[0][0].where;
    expect(where.canonicalName.in).toEqual(['Kawa']);
    expect(where.expense.date.gte).toBe(since);
    expect(where.expense.accountId).toBe('acc-1');

    expect(out).toHaveLength(1);
    expect(out[0].currency).toBe('PLN');
    expect(out[0].points.map((p) => p.price)).toEqual([20, 22]);
  });

  it('returns an empty array when no product names are requested', async () => {
    (prisma as any).expenseItem = { findMany: jest.fn() };
    await expect(service.getProductTrendsFor('acc-1', [], 'biedronka', new Date())).resolves.toEqual([]);
    expect((prisma as any).expenseItem.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest price-history.service`
Expected: FAIL — `service.getProductTrendsFor is not a function`.

- [ ] **Step 3: Write the implementation**

Add the import at the top of `price-history.service.ts`:

```ts
import type { ReceiptCheckHistory } from './receipt-check.util';
```

Add the method next to `getProductTrends`:

```ts
  /**
   * Narrowed sibling of getProductTrends for the receipt price check: only the
   * products on one receipt, only that merchant, only inside the lookback
   * window. getProductTrends reads the account's whole item history and must
   * never be called on the scan hot path.
   */
  async getProductTrendsFor(
    accountId: string,
    canonicalNames: string[],
    merchantNormalized: string,
    since: Date,
    // Required: without it the grouping map keyed by product name alone would
    // append rows from a second currency to the same points array, producing a
    // mixed-currency baseline with a label taken from whichever row came first.
    currencyCode: string,
  ): Promise<ReceiptCheckHistory[]> {
    if (canonicalNames.length === 0) return [];
    const aliases = await this.getAliasMap(accountId);

    const items: Array<{
      canonicalName: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      expense: { date: Date; merchant: string | null; currencyCode: string };
    }> = await (this.prisma as any).expenseItem.findMany({
      where: {
        expense: { accountId, isDeleted: false, date: { gte: since } },
        canonicalName: { in: canonicalNames },
        isDeleted: false,
      },
      select: {
        canonicalName: true,
        unitPrice: true,
        quantity: true,
        totalPrice: true,
        expense: { select: { date: true, merchant: true, currencyCode: true } },
      },
      orderBy: [{ expense: { date: 'asc' } }, { id: 'asc' }],
    });

    const byName = new Map<string, ReceiptCheckHistory>();
    for (const item of items) {
      // Merchant is filtered in JS: the stored value is the display name, and the
      // caller compares against its normalized form (same approach as the
      // duplicate-charge detector, which matches payee labels in JS). Currency is
      // filtered here too, beside it, so the two match-in-JS rules live together.
      if ((item.expense.merchant ?? '').trim().toLowerCase() !== merchantNormalized) continue;
      if ((item.expense.currencyCode ?? '') !== currencyCode) continue;
      const resolved = aliases.get(item.canonicalName) ?? item.canonicalName;
      // Honour the user's "stop tracking this product" action, exactly as
      // fetchRows does — otherwise an ignored product still gets surfaced.
      if (resolved === IGNORED_SENTINEL) continue;
      const price =
        Number(item.quantity) > 1
          ? Number(item.totalPrice) / Number(item.quantity)
          : Number(item.unitPrice);

      const entry =
        byName.get(resolved) ??
        ({ canonicalName: resolved, currency: item.expense.currencyCode ?? 'PLN', points: [] } as ReceiptCheckHistory);
      entry.points.push({ date: item.expense.date.toISOString().slice(0, 10), price });
      byName.set(resolved, entry);
    }

    return [...byName.values()];
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest price-history.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-history/price-history.service.ts apps/api/src/modules/price-history/price-history.service.spec.ts
git commit -m "feat(price-history): add getProductTrendsFor narrowed query for the scan hot path"
```

---

### Task 6: Wire the check into receipt scanning

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts` (interface at `:79`, new method near `:321`, call sites at `:619`, `:669`, `:754`, `:776`)
- Modify: `apps/api/src/modules/ai/ai.module.ts:29`
- Test: `apps/api/src/modules/ai/services/ocr.service.spec.ts`

**Interfaces:**
- Consumes: `checkReceiptPrices`, `resolveReceiptCheckConfig` (Tasks 2–4), `PriceHistoryService.getProductTrendsFor` (Task 5).
- Produces: `ReceiptExpense.priceFindings: ReceiptCheckFinding[]` — always present, empty when there is nothing to report. Consumed by the bots (Task 8) and by the mobile app in Plan 2.

- [ ] **Step 1: Write the failing tests**

Append to the existing `apps/api/src/modules/ai/services/ocr.service.spec.ts`:

```ts
import { OcrService } from './ocr.service';

describe('OcrService price check', () => {
  const makeService = (getProductTrendsFor: jest.Mock) => {
    const service = Object.create(OcrService.prototype) as any;
    service.priceHistory = { getProductTrendsFor };
    service.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    return service;
  };

  const receipt = {
    merchant: 'Biedronka',
    currencyCode: 'PLN',
    date: '2026-07-25',
    receiptItems: [{ description: 'KAWA', canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 }],
  };

  it('returns findings when a line is above the usual price', async () => {
    const service = makeService(
      jest.fn().mockResolvedValue([
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-08', price: 20 },
          ],
        },
      ]),
    );
    const findings = await service.runPriceCheck('acc-1', receipt);
    expect(findings).toHaveLength(1);
    expect(findings[0].canonicalName).toBe('Kawa');
  });

  it('returns an empty array — not undefined — when there is no merchant', async () => {
    const service = makeService(jest.fn());
    const findings = await service.runPriceCheck('acc-1', { ...receipt, merchant: null });
    expect(findings).toEqual([]);
    expect(service.priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
  });

  it('is fail-silent: a thrown query still yields an empty array', async () => {
    const service = makeService(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(service.runPriceCheck('acc-1', receipt)).resolves.toEqual([]);
    expect(service.logger.warn).toHaveBeenCalled();
  });

  it('skips items without a canonical name', async () => {
    const service = makeService(jest.fn());
    const findings = await service.runPriceCheck('acc-1', {
      ...receipt,
      receiptItems: [{ description: 'COS', quantity: 1, unitPrice: 30, totalPrice: 30 }],
    });
    expect(findings).toEqual([]);
    expect(service.priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest ocr.service`
Expected: FAIL — `service.runPriceCheck is not a function`.

- [ ] **Step 3: Extend the response interface**

In `ocr.service.ts`, add the import and extend `ReceiptExpense` (`:79`):

```ts
import type { ReceiptCheckFinding } from '@budget/shared-types';
import {
  checkReceiptPrices,
  resolveReceiptCheckConfig,
  type ReceiptCheckLine,
} from '../../price-history/receipt-check.util';
import { PriceHistoryService } from '../../price-history/price-history.service';
```

```ts
export interface ReceiptExpense {
  amount: number;
  discountAmount: number | null;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  categorySuggestion: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number;
  receiptItems: ReceiptItem[];
  location: { lat: number; lng: number; name: string } | null;
  /** Lines that cost more than usual for this user in this store. Always present; empty when nothing to report. */
  priceFindings: ReceiptCheckFinding[];
}
```

Inject the service in the constructor:

```ts
    private readonly priceHistory: PriceHistoryService,
```

- [ ] **Step 4: Add `runPriceCheck` and `finalizeReceipt`**

Add both next to `buildReceiptExpense`:

```ts
  /**
   * Compares each receipt line against the user's own price history for the
   * same product in the same store. Fail-silent by contract: a receipt scan
   * must never break because a price comparison failed.
   */
  private async runPriceCheck(accountId: string, receipt: ReceiptExpense): Promise<ReceiptCheckFinding[]> {
    try {
      const merchant = receipt.merchant?.trim();
      if (!merchant) return [];

      const lines: ReceiptCheckLine[] = (receipt.receiptItems ?? [])
        .filter((item) => !!item.canonicalName?.trim())
        .map((item) => ({
          canonicalName: item.canonicalName as string,
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
          unitPrice:
            Number(item.quantity) > 1
              ? Number(item.totalPrice) / Number(item.quantity)
              : Number(item.unitPrice ?? item.totalPrice),
        }));
      if (lines.length === 0) return [];

      const config = resolveReceiptCheckConfig(process.env);
      const now = receipt.date ? new Date(receipt.date) : new Date();
      const since = new Date(now.getTime() - config.lookbackWeeks * 7 * 24 * 60 * 60 * 1000);

      const history = await this.priceHistory.getProductTrendsFor(
        accountId,
        lines.map((l) => l.canonicalName),
        merchant.toLowerCase(),
        since,
        receipt.currencyCode,
      );

      const result = checkReceiptPrices({
        lines,
        history,
        merchant,
        currencyCode: receipt.currencyCode,
        now,
        config,
      });

      if (result.stats.droppedByCap > 0 || result.stats.droppedBySize > 0) {
        this.logger.log(
          `[PriceCheck] dropped ${result.stats.droppedByCap} by rise cap, ${result.stats.droppedBySize} by size mismatch`,
        );
      }
      return result.findings;
    } catch (error) {
      this.logger.warn(`[PriceCheck] skipped: ${error}`);
      return [];
    }
  }

  /**
   * The single funnel for turning a parsed receipt into a ReceiptExpense.
   * Every scan path must go through here so the price check cannot be
   * forgotten when a new path is added.
   */
  private async finalizeReceipt(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    categories: CategoryWithName[],
    accountId: string,
  ): Promise<ReceiptExpense> {
    const receipt = await this.buildReceiptExpense(parsed, categories);
    receipt.priceFindings = await this.runPriceCheck(accountId, receipt);
    return receipt;
  }
```

In `buildReceiptExpense`, initialise the new field where the returned object is built so it is never `undefined`:

```ts
      priceFindings: [],
```

- [ ] **Step 5: Convert all four call sites**

Replace each of the four occurrences (`:619`, `:669`, `:754`, `:776`) of

```ts
    return await this.buildReceiptExpense(this.validateAndNormalizeReceipt(parsed, context), categories);
```

with

```ts
    return await this.finalizeReceipt(this.validateAndNormalizeReceipt(parsed, context), categories, accountId);
```

Verify none remain:

Run: `cd apps/api && grep -n "buildReceiptExpense" src/modules/ai/services/ocr.service.ts`
Expected: exactly two hits — the method definition and its single call inside `finalizeReceipt`.

- [ ] **Step 6: Import PriceHistoryModule**

In `apps/api/src/modules/ai/ai.module.ts:29`, append `PriceHistoryModule` to the `imports` array and add its import statement. `PriceHistoryModule` imports only `SubscriptionsModule`, so this introduces no cycle.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `cd apps/api && npx jest ocr.service && cd ../.. && npm run typecheck`
Expected: PASS on both.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/ai/services/ocr.service.ts apps/api/src/modules/ai/services/ocr.service.spec.ts apps/api/src/modules/ai/ai.module.ts
git commit -m "feat(ai): return receipt price-check findings from every scan path"
```

---

### Task 7: Persist one alert per receipt, without a push

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts` (`CreateAlertInput` at `:50`, `createAlert` at `:86`, `checkExpense` at `:130`)
- Modify: `apps/api/src/modules/anomaly/anomaly.module.ts`
- Test: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`

**Interfaces:**
- Consumes: `checkReceiptPrices`, `resolveReceiptCheckConfig` (Tasks 2–4), `PriceHistoryService.getProductTrendsFor` (Task 5), `'price_overcharge'` (Task 1).
- Produces: `CreateAlertInput.skipPush?: boolean` with `pushTitle`/`pushBody` now optional; `AnomalyService.detectPriceOvercharge(accountId, userId, expense)` writing dedupKey `overcharge:{expenseId}`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/anomaly/anomaly.service.spec.ts` (reuse the file's existing `service`/`prisma`/`notifications` fixtures):

```ts
describe('detectPriceOvercharge', () => {
  const expense = {
    id: 'exp-1',
    merchant: 'Biedronka',
    description: null,
    amount: 100,
    currencyCode: 'PLN',
    date: new Date('2026-07-25'),
    recurringId: null,
    isRecurring: false,
    categoryId: null,
    importBatchId: null,
  };

  beforeEach(() => {
    (service as any).priceHistory = {
      getProductTrendsFor: jest.fn().mockResolvedValue([
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-08', price: 20 },
          ],
        },
      ]),
    };
    (prisma as any).expenseItem = {
      findMany: jest.fn().mockResolvedValue([
        { canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 },
      ]),
    };
    prisma.anomalyAlert.create = jest.fn().mockResolvedValue({ id: 'alert-1' });
    prisma.anomalyAlert.count = jest.fn().mockResolvedValue(0);
    notifications.sendToUser = jest.fn();
  });

  it('creates one alert per receipt and never pushes', async () => {
    await (service as any).detectPriceOvercharge('acc-1', 'user-1', expense);

    const data = (prisma.anomalyAlert.create as jest.Mock).mock.calls[0][0].data;
    expect(data.type).toBe('price_overcharge');
    expect(data.dedupKey).toBe('overcharge:exp-1');
    expect(data.expenseId).toBe('exp-1');
    expect((data.params as any).findings).toHaveLength(1);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('writes nothing when there are no findings', async () => {
    (prisma as any).expenseItem.findMany = jest
      .fn()
      .mockResolvedValue([{ canonicalName: 'Kawa', quantity: 1, unitPrice: 20, totalPrice: 20 }]);
    await (service as any).detectPriceOvercharge('acc-1', 'user-1', expense);
    expect(prisma.anomalyAlert.create).not.toHaveBeenCalled();
  });

  it('skips an expense with no line items', async () => {
    (prisma as any).expenseItem.findMany = jest.fn().mockResolvedValue([]);
    await (service as any).detectPriceOvercharge('acc-1', 'user-1', expense);
    expect((service as any).priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
    expect(prisma.anomalyAlert.create).not.toHaveBeenCalled();
  });

  it('is silent on a duplicate dedupKey', async () => {
    prisma.anomalyAlert.create = jest.fn().mockRejectedValue({ code: 'P2002' });
    await expect((service as any).detectPriceOvercharge('acc-1', 'user-1', expense)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest anomaly.service`
Expected: FAIL — `service.detectPriceOvercharge is not a function`.

- [ ] **Step 3: Make pushing optional in `createAlert`**

In `anomaly.service.ts`, change `CreateAlertInput` (`:50`):

```ts
export interface CreateAlertInput {
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  dedupKey: string;
  params: Record<string, unknown>;
  expenseId?: string;
  categoryId?: string;
  /** Feed-only alert: insert the row and send no notification. */
  skipPush?: boolean;
  pushTitle?: (lang: string) => string;
  pushBody?: (lang: string) => string;
}
```

In `createAlert`, immediately after the insert's `catch` block, before the daily-cap query:

```ts
    if (input.skipPush || !input.pushTitle || !input.pushBody) return;
```

Existing callers all pass both push functions and no `skipPush`, so their behaviour is unchanged.

- [ ] **Step 4: Add the detector**

Add the imports at the top of `anomaly.service.ts`:

```ts
import { PriceHistoryService } from '../price-history/price-history.service';
import {
  checkReceiptPrices,
  resolveReceiptCheckConfig,
  type ReceiptCheckLine,
} from '../price-history/receipt-check.util';
```

Inject the service in the constructor:

```ts
    private readonly priceHistory: PriceHistoryService,
```

Add the detector method:

```ts
  /**
   * Persists the receipt price check as one feed row per receipt. The same pure
   * engine also runs inline at scan time; this pass exists because the expense
   * (and therefore the dedup key) does not exist yet during the scan. Never
   * pushes — a notification arriving after the user has left the store has
   * nothing actionable in it.
   */
  private async detectPriceOvercharge(
    accountId: string,
    userId: string,
    expense: DetectorExpense,
  ): Promise<void> {
    const merchant = expense.merchant?.trim();
    if (!merchant) return;

    const items: Array<{
      canonicalName: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = await (this.prisma as any).expenseItem.findMany({
      where: { expenseId: expense.id, isDeleted: false, canonicalName: { not: null } },
      select: { canonicalName: true, quantity: true, unitPrice: true, totalPrice: true },
    });
    if (items.length === 0) return;

    const lines: ReceiptCheckLine[] = items.map((item) => ({
      canonicalName: item.canonicalName as string,
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      unitPrice:
        Number(item.quantity) > 1
          ? Number(item.totalPrice) / Number(item.quantity)
          : Number(item.unitPrice),
    }));

    const config = resolveReceiptCheckConfig(process.env);
    const now = expense.date;
    const since = new Date(now.getTime() - config.lookbackWeeks * 7 * DAY_MS);

    const history = await this.priceHistory.getProductTrendsFor(
      accountId,
      lines.map((l) => l.canonicalName),
      merchant.toLowerCase(),
      since,
      expense.currencyCode,
    );

    const { findings } = checkReceiptPrices({
      lines,
      history,
      merchant,
      currencyCode: expense.currencyCode,
      now,
      config,
    });
    if (findings.length === 0) return;

    await this.createAlert({
      accountId,
      userId,
      type: 'price_overcharge',
      dedupKey: `overcharge:${expense.id}`,
      expenseId: expense.id,
      params: {
        merchant,
        currencyCode: expense.currencyCode,
        totalAmount: findings.reduce((sum, f) => sum + f.overpaidAmount, 0),
        findings,
      },
      skipPush: true,
    });
  }
```

**E2EE accounts need no special case, but the reason matters.** At scan time the server holds the plaintext it just parsed, so the inline check in Task 6 runs normally — but `getProductTrendsFor` reads *stored* history, which for a tier-2 account is encrypted, so nothing matches and the result is silently empty. In this detector the `canonicalName: { not: null }` filter drops the rows outright. Both paths therefore satisfy the spec's "return zero findings silently" requirement structurally rather than through a branch, which is why the existing "no history" and "no line items" tests are the coverage. Do not add an E2EE check that decrypts anything — the whole point is that the server cannot.

**Note:** the history query excludes nothing by expense id, so the receipt being checked is itself inside the window. Its own prices land in the baseline median only for *earlier* purchases of the same product at the same store, because a product bought once on this receipt contributes a single point and `minPoints` is 2 — but a receipt listing the same product twice would seed its own baseline. That is exactly why `groupReceiptLines` collapses duplicate lines before comparison.

- [ ] **Step 5: Wire it into `checkExpense`**

In `checkExpense` (`:130`), add the call after `detectPossibleMerge`:

```ts
      // price_overcharge is last: it is a feed-only row and must never compete
      // for the daily push cap.
      await this.detectPriceOvercharge(accountId, userId, expense as DetectorExpense);
```

Do **not** add it to `checkExpenseBatch` — imports have no line items.

- [ ] **Step 6: Import PriceHistoryModule**

In `apps/api/src/modules/anomaly/anomaly.module.ts`, add `PriceHistoryModule` to `imports`. No cycle: `PriceHistoryModule` imports only `SubscriptionsModule`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && npx jest anomaly.service && npx jest receipt-check.util && cd ../.. && npm run typecheck`
Expected: PASS on all three.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.service.ts apps/api/src/modules/anomaly/anomaly.service.spec.ts apps/api/src/modules/anomaly/anomaly.module.ts
git commit -m "feat(anomaly): persist receipt price findings as a feed-only price_overcharge alert"
```

---

### Task 8: Show findings in the three bots

**Files:**
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts`
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/photo.handler.ts`
- Modify: `apps/api/src/modules/telegram/helpers/i18n.ts`
- Modify: `apps/api/src/modules/whatsapp/helpers/i18n.ts`
- Modify: `apps/api/src/modules/slack/helpers/i18n.ts`
- Test: `apps/api/src/modules/telegram/handlers/photo.handler.spec.ts`

**Interfaces:**
- Consumes: `ReceiptExpense.priceFindings` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the i18n key**

Add a `priceCheckSummary` entry to each bot's i18n helper, in every language that file already supports, taking the count and amount. English:

```ts
  priceCheckSummary: (count: number, amount: string) =>
    `⚠️ ${count} item(s) cost more than usual (about ${amount} more) — worth checking the receipt.`,
```

Per the global constraints, no translation may phrase this as an accusation. Match the existing file's language coverage exactly — do not add or drop locales.

- [ ] **Step 2: Write the failing test**

Append to `apps/api/src/modules/telegram/handlers/photo.handler.spec.ts`:

```ts
it('appends a price-check line when the scan returned findings', async () => {
  const summary = (handler as any).buildPriceCheckLine(
    {
      priceFindings: [
        { canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' },
        { canonicalName: 'Mleko', overpaidAmount: 2, currencyCode: 'PLN' },
      ],
    } as any,
    'en',
  );
  expect(summary).toContain('2');
  expect(summary).toContain('6');
});

it('returns an empty string when there are no findings', () => {
  expect((handler as any).buildPriceCheckLine({ priceFindings: [] } as any, 'en')).toBe('');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && npx jest telegram/handlers/photo.handler`
Expected: FAIL — `handler.buildPriceCheckLine is not a function`.

- [ ] **Step 4: Implement the helper in each of the three handlers**

```ts
  private buildPriceCheckLine(receipt: ReceiptExpense, lang: string): string {
    const findings = receipt.priceFindings ?? [];
    if (findings.length === 0) return '';
    const total = findings.reduce((sum, f) => sum + f.overpaidAmount, 0);
    return t(lang, 'priceCheckSummary', findings.length, `${total.toFixed(2)} ${findings[0].currencyCode}`);
  }
```

Use each module's own translation call — `t(lang, key, ...)` in Telegram/WhatsApp, the Slack helper's equivalent. Append the result to the existing receipt-confirmation message only when it is non-empty, so a receipt with nothing to report reads exactly as it does today.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest photo.handler`
Expected: PASS across all three bot suites.

- [ ] **Step 6: Full API suite and typecheck**

Run: `cd apps/api && npx jest && cd ../.. && npm run typecheck && npm run lint`

Expected: everything green **except two pre-existing failures that predate this feature and are out of scope** — `price-history.service.spec.ts`'s `computeInflationIndex` tests (`computes weighted index correctly`, `excludes products without data in both periods`, which return `inflationIndex: null` / `productCount: 0`), and an `apps/admin` typecheck error in a skeleton component. Both fail on the branch's base commit. Do not fix them here; report them instead. Nothing else may regress.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/telegram apps/api/src/modules/whatsapp apps/api/src/modules/slack
git commit -m "feat(bots): report receipt price-check findings in scan replies"
```

---

## Done when

- `npx jest` passes in `apps/api` for the new engine, service, detector and bot suites, with no regression outside the two documented pre-existing failures.
- `npm run typecheck` and `npm run lint` pass at the repo root, apart from the pre-existing `apps/admin` skeleton typecheck error.
- Scanning a receipt for a product bought 2+ times before at the same store, at a 15%+ higher price and 1.00+ more in total, returns a populated `priceFindings` array and writes exactly one `price_overcharge` row with `pushSent = false`.
- No notification is delivered for that row.
- `grep -rn "buildReceiptExpense" apps/api/src` shows only the definition and the single call inside `finalizeReceipt`.

## Plan 2 (to be written next)

`size` end-to-end (`ReceiptItem.size` → OCR prompt → `expense_items.size` migration → `ExpensesService.create` → `SyncService.processExpenseItemChange` → mobile schema/repository → `getProductTrendsFor` select and the size gate becoming live), the `expense/receipt.tsx` findings card, the `price_overcharge` alert card, the "found overpayments" total on the inflation screen, and `receiptCheck.*` across all 9 locales.
