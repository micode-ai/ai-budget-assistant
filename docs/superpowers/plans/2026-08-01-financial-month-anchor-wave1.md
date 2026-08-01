# Financial Month Anchor — Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account owner declare that their month starts on a day other than the 1st, and make budgets honour it end-to-end.

**Architecture:** One nullable `Account.monthAnchorDay` column. Two pure functions (`financialMonth`, `shiftFinancialMonth`) that exist as deliberate mirrored copies — one in `apps/api`, one in `packages/shared-utils` — because the API cannot import shared-utils at runtime. The existing `computeBudgetPeriod` stops computing months itself and delegates to them, so the number of period concepts goes down, not up. `null` anchor reproduces today's calendar behaviour exactly.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo 54 + React Native + Zustand + SQLite/Drizzle (mobile), Jest on both sides.

**Spec:** `docs/superpowers/specs/2026-08-01-financial-month-anchor-design.md`

## Global Constraints

- **The API must never `import`/`require` `@budget/shared-utils` at runtime.** Type-only imports are fine. `scripts/check-no-shared-utils-runtime-import.sh` fails the deploy otherwise. This is why the util is duplicated.
- **`monthAnchorDay = null` must reproduce current behaviour byte for byte.** Every existing budget test must pass unmodified.
- **Anchor range is 1–31**, clamped to the last day of short months. Out-of-range or malformed values degrade to `null` (calendar), never throw.
- **All date math stays in local time** (`new Date(y, m, d)`). Do not introduce UTC.
- **Never use `date.setMonth(date.getMonth() + n)` to step months.** It overflows on the 29th–31st. Build the target explicitly from `(year, monthIndex + n)`.
- **i18n keys go into all 9 locale files** (`en, de, es, fr, pl, ru, ua, be, nl`).
- Wave 1 touches budgets only. Do not modify analytics, home screen, story, fat-finder, or reports — those are waves 2 and 3.

---

### Task 1: Pure `financial-month` util (API copy)

**Files:**
- Create: `apps/api/src/common/utils/financial-month.ts`
- Test: `apps/api/src/common/utils/financial-month.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalizeAnchorDay(value: unknown): number | null`
  - `financialMonth(now: Date, anchorDay: number | null): { start: Date; end: Date }`
  - `shiftFinancialMonth(ref: Date, delta: number, anchorDay: number | null): Date` — returns a reference date **inside** the target period (at 12:00 local), not necessarily the period start

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/utils/financial-month.spec.ts`:

```ts
import { financialMonth, shiftFinancialMonth, normalizeAnchorDay } from './financial-month';

describe('normalizeAnchorDay', () => {
  it('accepts 1..31', () => {
    expect(normalizeAnchorDay(1)).toBe(1);
    expect(normalizeAnchorDay(10)).toBe(10);
    expect(normalizeAnchorDay(31)).toBe(31);
  });

  it('degrades anything invalid to null instead of throwing', () => {
    expect(normalizeAnchorDay(0)).toBeNull();
    expect(normalizeAnchorDay(32)).toBeNull();
    expect(normalizeAnchorDay(-5)).toBeNull();
    expect(normalizeAnchorDay(10.5)).toBeNull();
    expect(normalizeAnchorDay(NaN)).toBeNull();
    expect(normalizeAnchorDay(null)).toBeNull();
    expect(normalizeAnchorDay(undefined)).toBeNull();
    expect(normalizeAnchorDay('10')).toBeNull();
  });
});

describe('financialMonth', () => {
  it('null anchor returns the calendar month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15, 9, 30), null);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('anchor 1 equals the calendar month', () => {
    const cal = financialMonth(new Date(2026, 7, 15), null);
    const anchored = financialMonth(new Date(2026, 7, 15), 1);
    expect(anchored.start).toEqual(cal.start);
    expect(anchored.end).toEqual(cal.end);
  });

  it('after the anchor, the period starts this month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('before the anchor, the period started last month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 3), 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('exactly on the anchor day, the period starts today', () => {
    const { start } = financialMonth(new Date(2026, 7, 10, 0, 0, 0, 0), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to the last day of February', () => {
    // Feb 2026 has 28 days, so the anchor clamps to the 28th. Standing ON it,
    // the period runs to the day before the next anchor (31 Mar).
    const { start, end } = financialMonth(new Date(2026, 1, 28), 31);
    expect(start).toEqual(new Date(2026, 1, 28, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 2, 30, 23, 59, 59, 999));
  });

  it('before the clamped anchor, is still inside the January period', () => {
    // 15 Feb is before the clamped 28 Feb anchor, so the live period is the
    // one that opened on 31 Jan.
    const { start, end } = financialMonth(new Date(2026, 1, 15), 31);
    expect(start).toEqual(new Date(2026, 0, 31, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 27, 23, 59, 59, 999));
  });

  it('clamps anchor 31 to 29 February in a leap year', () => {
    const { start } = financialMonth(new Date(2028, 1, 29), 31);
    expect(start).toEqual(new Date(2028, 1, 29, 0, 0, 0, 0));
  });

  it('crosses the year boundary backwards', () => {
    const { start, end } = financialMonth(new Date(2026, 0, 5), 10);
    expect(start).toEqual(new Date(2025, 11, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 0, 9, 23, 59, 59, 999));
  });

  it('out-of-range anchor falls back to the calendar month', () => {
    const { start } = financialMonth(new Date(2026, 7, 15), 99);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});

describe('shiftFinancialMonth', () => {
  it('steps back one calendar month from the 31st without overflowing', () => {
    // Regression: new Date(2026,2,31).setMonth(1) yields 3 March, skipping February.
    const ref = shiftFinancialMonth(new Date(2026, 2, 31), -1, null);
    const { start } = financialMonth(ref, null);
    expect(start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
  });

  it('steps back one anchored period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), -1, 10);
    const { start, end } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('steps forward across the year boundary', () => {
    const ref = shiftFinancialMonth(new Date(2026, 11, 20), 1, 10);
    const { start } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2027, 0, 10, 0, 0, 0, 0));
  });

  it('delta 0 stays in the same period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), 0, 10);
    const { start } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/common/utils/financial-month.spec.ts`
Expected: FAIL — `Cannot find module './financial-month'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/common/utils/financial-month.ts`:

```ts
/**
 * The account's "financial month" — a calendar month optionally shifted to
 * start on `anchorDay` instead of the 1st (salary lands on the 10th, so the
 * month runs 10 Aug - 9 Sep).
 *
 * MIRROR: packages/shared-utils/src/formatting/financial-month.ts holds a
 * byte-identical copy for mobile. The API cannot import shared-utils at
 * runtime (no build step; prod Node throws ERR_UNSUPPORTED_DIR_IMPORT -- see
 * ABA-252/253 and scripts/check-no-shared-utils-runtime-import.sh), so the
 * duplication is deliberate. Both copies are covered by the same case table;
 * change one, change the other.
 *
 * All math is local-time on purpose. Moving to UTC would shift day boundaries.
 */

/** 1..31, or null for "use the calendar month". Anything else degrades to null. */
export function normalizeAnchorDay(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > 31) return null;
  return value;
}

function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Midnight on the anchor day of (year, monthIndex), clamped to the last day of
 * short months. monthIndex may be out of 0..11; it is normalized into the year.
 * Built explicitly rather than by mutating a Date, because setMonth() overflows.
 */
function anchorDateFor(year: number, monthIndex: number, anchorDay: number): Date {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return new Date(y, m, Math.min(anchorDay, daysInMonth(y, m)), 0, 0, 0, 0);
}

/** The financial-month window containing `now`. */
export function financialMonth(
  now: Date,
  anchorDay: number | null,
): { start: Date; end: Date } {
  const anchor = normalizeAnchorDay(anchorDay);

  if (anchor === null) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  const thisAnchor = anchorDateFor(now.getFullYear(), now.getMonth(), anchor);
  const start =
    now.getTime() >= thisAnchor.getTime()
      ? thisAnchor
      : anchorDateFor(now.getFullYear(), now.getMonth() - 1, anchor);

  const nextAnchor = anchorDateFor(start.getFullYear(), start.getMonth() + 1, anchor);
  return { start, end: new Date(nextAnchor.getTime() - 1) };
}

/**
 * A reference date guaranteed to fall INSIDE the period `delta` steps from the
 * one containing `ref`. Feed it back into financialMonth() to get the window.
 * Returns noon to stay clear of DST transitions.
 */
export function shiftFinancialMonth(
  ref: Date,
  delta: number,
  anchorDay: number | null,
): Date {
  const anchor = normalizeAnchorDay(anchorDay);

  if (anchor === null) {
    return new Date(ref.getFullYear(), ref.getMonth() + delta, 1, 12, 0, 0, 0);
  }

  const { start } = financialMonth(ref, anchor);
  const shifted = anchorDateFor(start.getFullYear(), start.getMonth() + delta, anchor);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), 12, 0, 0, 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/common/utils/financial-month.spec.ts`
Expected: PASS, 16 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/utils/financial-month.ts apps/api/src/common/utils/financial-month.spec.ts
git commit -m "feat(api): add the financial-month anchor util"
```

---

### Task 2: Mirror the util into shared-utils

**Files:**
- Create: `packages/shared-utils/src/formatting/financial-month.ts`
- Modify: `packages/shared-utils/src/formatting/index.ts` (re-export)
- Test: `apps/mobile/src/utils/__tests__/financialMonth.test.ts`

**Interfaces:**
- Consumes: the exact source from Task 1
- Produces: same three exports, importable as `import { financialMonth } from '@budget/shared-utils'`, plus
  `formatFinancialMonth(start: Date, end: Date, locale: string): { label: string; range: string }`

`formatFinancialMonth` lives only here, not in the API mirror — the API never renders labels.

`packages/shared-utils` has no test runner of its own. Mobile's Jest can import the package (`src/services/__tests__/crypto.test.ts` already does), so the mirror is tested from there — same convention as the rest of the repo.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/financialMonth.test.ts`:

```ts
import {
  financialMonth,
  shiftFinancialMonth,
  normalizeAnchorDay,
  formatFinancialMonth,
  computeBudgetPeriod,
} from '@budget/shared-utils';

// This file is the mirror of apps/api/src/common/utils/financial-month.spec.ts.
// The two copies of the util must agree; if you change a case here, change it there.

describe('normalizeAnchorDay (shared-utils mirror)', () => {
  it('accepts 1..31 and degrades everything else to null', () => {
    expect(normalizeAnchorDay(10)).toBe(10);
    expect(normalizeAnchorDay(0)).toBeNull();
    expect(normalizeAnchorDay(32)).toBeNull();
    expect(normalizeAnchorDay(10.5)).toBeNull();
    expect(normalizeAnchorDay(NaN)).toBeNull();
    expect(normalizeAnchorDay('10')).toBeNull();
  });
});

describe('financialMonth (shared-utils mirror)', () => {
  it('null anchor returns the calendar month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15, 9, 30), null);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('after the anchor, the period starts this month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('before the anchor, the period started last month', () => {
    const { start } = financialMonth(new Date(2026, 7, 3), 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to the last day of February', () => {
    const { start } = financialMonth(new Date(2026, 1, 28), 31);
    expect(start).toEqual(new Date(2026, 1, 28, 0, 0, 0, 0));
  });

  it('before the clamped anchor, is still inside the January period', () => {
    const { start, end } = financialMonth(new Date(2026, 1, 15), 31);
    expect(start).toEqual(new Date(2026, 0, 31, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 27, 23, 59, 59, 999));
  });

  it('crosses the year boundary backwards', () => {
    const { start } = financialMonth(new Date(2026, 0, 5), 10);
    expect(start).toEqual(new Date(2025, 11, 10, 0, 0, 0, 0));
  });
});

  it('anchor 1 equals the calendar month', () => {
    const cal = financialMonth(new Date(2026, 7, 15), null);
    const anchored = financialMonth(new Date(2026, 7, 15), 1);
    expect(anchored.start).toEqual(cal.start);
    expect(anchored.end).toEqual(cal.end);
  });

  it('exactly on the anchor day, the period starts today', () => {
    const { start } = financialMonth(new Date(2026, 7, 10, 0, 0, 0, 0), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to 29 February in a leap year', () => {
    const { start } = financialMonth(new Date(2028, 1, 29), 31);
    expect(start).toEqual(new Date(2028, 1, 29, 0, 0, 0, 0));
  });

  it('out-of-range anchor falls back to the calendar month', () => {
    const { start } = financialMonth(new Date(2026, 7, 15), 99);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});

describe('shiftFinancialMonth (shared-utils mirror)', () => {
  it('steps back from the 31st without overflowing', () => {
    const ref = shiftFinancialMonth(new Date(2026, 2, 31), -1, null);
    expect(financialMonth(ref, null).start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
  });

  it('steps back one anchored period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), -1, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
  });

  it('steps forward across the year boundary', () => {
    const ref = shiftFinancialMonth(new Date(2026, 11, 20), 1, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2027, 0, 10, 0, 0, 0, 0));
  });

  it('delta 0 stays in the same period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), 0, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });
});

describe('formatFinancialMonth', () => {
  it('labels an anchored period by the month it starts in', () => {
    const { label, range } = formatFinancialMonth(
      new Date(2026, 7, 10),
      new Date(2026, 8, 9, 23, 59, 59, 999),
      'en-US',
    );
    expect(label).toBe('August');
    expect(range).toContain('Aug');
    expect(range).toContain('Sep');
  });

  it('labels a calendar month with no cross-month range', () => {
    const { label, range } = formatFinancialMonth(
      new Date(2026, 7, 1),
      new Date(2026, 7, 31, 23, 59, 59, 999),
      'en-US',
    );
    expect(label).toBe('August');
    expect(range).toContain('Aug');
  });

  it('includes the year when the period is not in the current year', () => {
    // `now` is injected so this does not silently start failing in 2024.
    const { label } = formatFinancialMonth(
      new Date(2024, 7, 10),
      new Date(2024, 8, 9),
      'en-US',
      new Date(2026, 7, 1),
    );
    expect(label).toBe('August 2024');
  });
});

describe('golden: null anchor reproduces the existing monthly budget window', () => {
  it('matches computeBudgetPeriod for a monthly budget', () => {
    const now = new Date(2026, 7, 15, 9, 30);
    const legacy = computeBudgetPeriod(
      { period: 'monthly', startDate: new Date(2026, 0, 1) },
      now,
    );
    const next = financialMonth(now, null);
    expect(next.start).toEqual(legacy.periodStart);
    expect(next.end).toEqual(legacy.periodEnd);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/utils/__tests__/financialMonth.test.ts`
Expected: FAIL — `financialMonth is not a function`

- [ ] **Step 3: Create the mirror and export it**

Copy the full body of `apps/api/src/common/utils/financial-month.ts` (from Task 1, Step 3) into `packages/shared-utils/src/formatting/financial-month.ts`, changing only the header comment's MIRROR line to point back at the API copy.

Then append `formatFinancialMonth` to that new file — it is mobile-only presentation, so it does
**not** go into the API mirror:

```ts
/**
 * Display strings for a financial-month window. An anchored period spans two
 * calendar months, so it is labelled by the month it STARTS in ("August" for
 * 10 Aug - 9 Sep) -- that is how people talk about the salary it belongs to --
 * with the exact span carried separately as a subtitle.
 */
export function formatFinancialMonth(
  start: Date,
  end: Date,
  locale: string,
  now: Date = new Date(),
): { label: string; range: string } {
  const sameYear = start.getFullYear() === now.getFullYear();
  const label = new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(start);

  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  return { label, range: `${dayMonth.format(start)} – ${dayMonth.format(end)}` };
}
```

Then add to the end of `packages/shared-utils/src/formatting/index.ts`:

```ts
export {
  normalizeAnchorDay,
  financialMonth,
  shiftFinancialMonth,
  formatFinancialMonth,
} from './financial-month';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/utils/__tests__/financialMonth.test.ts`
Expected: PASS, 13 tests — including the golden test proving `null` reproduces today's monthly window

- [ ] **Step 5: Commit**

```bash
git add packages/shared-utils/src/formatting/financial-month.ts packages/shared-utils/src/formatting/index.ts apps/mobile/src/utils/__tests__/financialMonth.test.ts
git commit -m "feat(shared-utils): mirror the financial-month util for mobile"
```

---

### Task 3: Persist the anchor — schema, DTO, service

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Account`)
- Create: `apps/api/prisma/migrations/<timestamp>_add_account_month_anchor/migration.sql` (generated)
- Modify: `apps/api/src/modules/accounts/dto/index.ts` (`UpdateAccountDto`)
- Modify: `packages/shared-types/src/entities/` — the file declaring `Account`
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: nothing
- Produces: `Account.monthAnchorDay: number | null` readable by Tasks 4, 5, 6; `UpdateAccountDto.monthAnchorDay?: number | null`

- [ ] **Step 1: Add the column to the Prisma schema**

In `apps/api/prisma/schema.prisma`, inside `model Account`, directly below `purchaseApprovalRule`:

```prisma
  monthAnchorDay       Int?         @map("month_anchor_day")
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_account_month_anchor`

Confirm the generated SQL is exactly one nullable column and no backfill:

```sql
ALTER TABLE "accounts" ADD COLUMN "month_anchor_day" INTEGER;
```

If it contains anything else, stop and investigate — a backfill would change existing accounts' behaviour, which this design forbids.

- [ ] **Step 3: Add the field to shared-types**

Find the `Account` interface (`grep -rn "interface Account " packages/shared-types/src/entities/`) and add:

```ts
  /** 1..31, or null/undefined for the calendar month. See the financial-month util. */
  monthAnchorDay?: number | null;
```

- [ ] **Step 4: Write the failing DTO validation test**

Add to `apps/api/src/modules/accounts/accounts.service.spec.ts` (create the file with the standard NestJS `Test.createTestingModule` harness used by `budgets.service.spec.ts` if it does not exist):

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateAccountDto } from './dto';

describe('UpdateAccountDto.monthAnchorDay', () => {
  const check = async (value: unknown) => {
    const dto = plainToInstance(UpdateAccountDto, { monthAnchorDay: value });
    return validate(dto);
  };

  it('accepts 1, 10 and 31', async () => {
    expect(await check(1)).toHaveLength(0);
    expect(await check(10)).toHaveLength(0);
    expect(await check(31)).toHaveLength(0);
  });

  it('accepts null to reset to the calendar month', async () => {
    expect(await check(null)).toHaveLength(0);
  });

  it('rejects 0, 32 and non-integers', async () => {
    expect((await check(0)).length).toBeGreaterThan(0);
    expect((await check(32)).length).toBeGreaterThan(0);
    expect((await check(10.5)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: FAIL — 0, 32 and 10.5 are accepted because no validator exists yet

- [ ] **Step 6: Add the validated field to the DTO**

In `apps/api/src/modules/accounts/dto/index.ts`, add to `UpdateAccountDto` (and add `IsInt`, `Min`, `Max`, `ValidateIf` to the existing `class-validator` import):

```ts
  /** 1..31, or explicit null to go back to the calendar month. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  monthAnchorDay?: number | null;
```

`@ValidateIf` is required — `@IsOptional()` alone already permits `null`, but the numeric validators would still reject it without the guard on some class-validator versions. Keep both so an explicit reset works.

- [ ] **Step 7: Verify `AccountsService.update` persists it**

Open `apps/api/src/modules/accounts/accounts.service.ts` and find `update`. If it spreads the DTO into `prisma.account.update({ data })`, no change is needed. If it copies fields one by one, add `monthAnchorDay` to that list. Owner-only enforcement already exists on this endpoint — do not add a second check.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/accounts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/accounts packages/shared-types/src/entities
git commit -m "feat(api): store a per-account financial month anchor"
```

---

### Task 4: Expose the anchor on the request

**Files:**
- Modify: `apps/api/src/common/middleware/account-context.middleware.ts`
- Modify: `apps/api/src/common/types/index.ts`
- Test: `apps/api/src/common/middleware/account-context.middleware.spec.ts` (create)

**Interfaces:**
- Consumes: `Account.monthAnchorDay` (Task 3)
- Produces: `req.monthAnchorDay: number | null` on every account-scoped request, consumed by Task 6

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/middleware/account-context.middleware.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccountContextGuard } from './account-context.middleware';

const ctxFor = (req: any): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

describe('AccountContextGuard', () => {
  const makeGuard = (membership: any) => {
    const prisma = { accountMember: { findUnique: jest.fn().mockResolvedValue(membership) } };
    return { guard: new AccountContextGuard(prisma as any), prisma };
  };

  it('puts the account anchor on the request', async () => {
    const { guard } = makeGuard({ role: 'owner', account: { monthAnchorDay: 10 } });
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await guard.canActivate(ctxFor(req));

    expect(req.accountId).toBe('a1');
    expect(req.accountRole).toBe('owner');
    expect(req.monthAnchorDay).toBe(10);
  });

  it('exposes null when the account uses the calendar month', async () => {
    const { guard } = makeGuard({ role: 'editor', account: { monthAnchorDay: null } });
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await guard.canActivate(ctxFor(req));

    expect(req.monthAnchorDay).toBeNull();
  });

  it('still rejects non-members', async () => {
    const { guard } = makeGuard(null);
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/common/middleware/account-context.middleware.spec.ts`
Expected: FAIL — `req.monthAnchorDay` is `undefined`

- [ ] **Step 3: Add the join and the assignment**

In `apps/api/src/common/middleware/account-context.middleware.ts`, change the membership query and add one line:

```ts
    const membership = await this.prisma.accountMember.findUnique({
      where: {
        accountId_userId: { accountId, userId: req.user.id },
      },
      include: { account: { select: { monthAnchorDay: true } } },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this account');
    }

    req.accountId = accountId;
    req.accountRole = membership.role as 'owner' | 'editor' | 'viewer';
    // One indexed-FK join for one small column, so no service has to fetch the
    // anchor itself. Crons have no request and read it from the account row.
    req.monthAnchorDay = membership.account?.monthAnchorDay ?? null;
```

In `apps/api/src/common/types/index.ts`, extend the interface:

```ts
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  accountId: string;
  accountRole: AccountRole;
  /** 1..31, or null for the calendar month. Set by AccountContextGuard. */
  monthAnchorDay: number | null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/common/middleware`
Expected: PASS, 3 tests

- [ ] **Step 5: Typecheck the whole API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. Widening `AuthenticatedRequest` with a required field can break call sites that build the object literally in tests — fix any by adding `monthAnchorDay: null`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): expose the account month anchor on the request"
```

---

### Task 5: Budgets honour the anchor

**Files:**
- Modify: `apps/api/src/modules/budgets/budget-period.util.ts`
- Modify: `packages/shared-utils/src/formatting/index.ts` (`computeBudgetPeriod`)
- Modify: `apps/api/src/modules/budgets/budgets.service.ts`
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts`
- Test: `apps/api/src/modules/budgets/budget-period.util.spec.ts` (create)

**Interfaces:**
- Consumes: `financialMonth` (Task 1), `req.monthAnchorDay` (Task 4)
- Produces: `computeBudgetPeriod(budget, now?, anchorDay?)` — third parameter optional and defaulting to `null`, so every existing call site keeps compiling and behaving identically

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/budgets/budget-period.util.spec.ts`:

```ts
import { computeBudgetPeriod } from './budget-period.util';

const monthly = { period: 'monthly', startDate: new Date(2026, 0, 1), endDate: null };

describe('computeBudgetPeriod with a financial-month anchor', () => {
  it('without an anchor, behaves exactly as before', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(monthly, new Date(2026, 7, 15));
    expect(periodStart).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('shifts the monthly window to the anchor', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(monthly, new Date(2026, 7, 15), 10);
    expect(periodStart).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('leaves daily, weekly and yearly untouched', () => {
    const now = new Date(2026, 7, 15);
    const daily = computeBudgetPeriod({ ...monthly, period: 'daily' }, now, 10);
    expect(daily.periodStart).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0));

    const yearly = computeBudgetPeriod({ ...monthly, period: 'yearly' }, now, 10);
    expect(yearly.periodStart).toEqual(new Date(2026, 0, 1));
  });

  it('leaves a custom fixed window untouched', () => {
    const custom = {
      period: 'custom',
      startDate: new Date(2026, 2, 3),
      endDate: new Date(2026, 4, 9),
    };
    const { periodStart, periodEnd } = computeBudgetPeriod(custom, new Date(2026, 7, 15), 10);
    expect(periodStart).toEqual(new Date(2026, 2, 3));
    expect(periodEnd).toEqual(new Date(2026, 4, 9));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/budgets/budget-period.util.spec.ts`
Expected: FAIL — the anchored case returns the calendar window because the parameter is ignored

- [ ] **Step 3: Delegate the monthly branch to `financialMonth`**

In `apps/api/src/modules/budgets/budget-period.util.ts`, add the import and change the signature and the `monthly` branch. Leave `daily`, `weekly`, `yearly` and `custom` exactly as they are:

```ts
import { financialMonth } from '../../common/utils/financial-month';

export function computeBudgetPeriod(
  budget: { period: string; startDate: Date; endDate: Date | null },
  now: Date = new Date(),
  anchorDay: number | null = null,
): { periodStart: Date; periodEnd: Date } {
  switch (budget.period) {
    // ... daily / weekly / yearly / custom unchanged ...
    case 'monthly':
    default: {
      const { start, end } = financialMonth(now, anchorDay);
      return { periodStart: start, periodEnd: end };
    }
  }
}
```

Apply the same change to the `computeBudgetPeriod` copy in
`packages/shared-utils/src/formatting/index.ts`, importing `financialMonth` from
`./financial-month`.

- [ ] **Step 4: Thread the anchor through the API call sites**

In `apps/api/src/modules/budgets/budgets.service.ts`, `getProgress` and `getHistory` must accept an `anchorDay: number | null` argument and pass it as the third argument to every `computeBudgetPeriod` call (lines ~267 and ~305). The controller supplies it from `req.monthAnchorDay`.

In `apps/api/src/modules/budgets/budget-alert.service.ts:42`, the cron has no request. Its budget query already loads the account relation — if it does not, add `include: { account: { select: { monthAnchorDay: true } } }` — and pass `budget.account?.monthAnchorDay ?? null`:

```ts
    const { periodStart, periodEnd } = computeBudgetPeriod(
      budget,
      undefined,
      budget.account?.monthAnchorDay ?? null,
    );
```

This is the single place where the anchor does not come from the request. Missing it means nightly alerts disagree with the number on screen.

- [ ] **Step 5: Run the full budgets suite**

Run: `cd apps/api && npx jest src/modules/budgets`
Expected: PASS — including `budgets.service.spec.ts` and `budget-alert.service.spec.ts` **unmodified**. If an existing test needed editing to pass, the default-parameter contract is broken; fix the code, not the test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/budgets packages/shared-utils/src/formatting/index.ts
git commit -m "feat(budgets): honour the account financial month anchor"
```

---

### Task 6: Fix month stepping in budget history

**Files:**
- Modify: `apps/api/src/modules/budgets/budgets.service.ts:249-267`
- Test: `apps/api/src/modules/budgets/budgets.service.spec.ts`

**Interfaces:**
- Consumes: `shiftFinancialMonth` (Task 1), the anchored `computeBudgetPeriod` (Task 5)
- Produces: nothing new

`getHistory` currently steps back with `ref.setMonth(ref.getMonth() - i)`. On 31 March that yields 3 March, so February is skipped and March appears twice. The bug exists today; anchored periods widen the window in which it bites.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/budgets/budgets.service.spec.ts`:

```ts
describe('getHistory month stepping', () => {
  it('returns distinct consecutive months when run on the 31st', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 2, 31, 10, 0, 0));

    const budget = {
      id: 'b1',
      period: 'monthly',
      amount: 100,
      currencyCode: 'USD',
      startDate: new Date(2026, 0, 1),
      endDate: null,
      categoryAllocations: [],
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(budget as any);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const history = await service.getHistory('acc1', 'b1', 3);

    const starts = history.map((h) => new Date(h.periodStart).getMonth());
    expect(starts).toEqual([0, 1, 2]); // January, February, March -- no repeats
    expect(new Set(starts).size).toBe(3);

    jest.useRealTimers();
  });
});
```

Adapt `service` / `prisma` to the harness already used at the top of that spec file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/budgets/budgets.service.spec.ts -t "distinct consecutive months"`
Expected: FAIL — months come back as `[1, 2, 2]`, February missing and March duplicated

- [ ] **Step 3: Replace the stepping with `shiftFinancialMonth`**

In `getHistory`, replace the whole `switch (budget.period)` block that mutates `ref` with:

```ts
      // Step back i periods. Never use setMonth() here: on the 31st it rolls
      // forward into the next month and silently repeats a period.
      let ref: Date;
      switch (budget.period) {
        case 'daily':
          ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
          break;
        case 'weekly':
          ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7, 12);
          break;
        case 'yearly':
          ref = new Date(now.getFullYear() - i, now.getMonth(), 1, 12);
          break;
        case 'monthly':
        default:
          ref = shiftFinancialMonth(now, -i, anchorDay);
          break;
      }

      const { periodStart, periodEnd } = computeBudgetPeriod(budget, ref, anchorDay);
```

Add `shiftFinancialMonth` to the import from `../../common/utils/financial-month`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/budgets`
Expected: PASS, all existing tests plus the new one

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/budgets
git commit -m "fix(budgets): stop skipping a month in history when run on the 31st"
```

---

### Task 7: Mobile persistence of the anchor

**Files:**
- Modify: `apps/mobile/src/db/schema/index.ts` (`accounts` table)
- Modify: `apps/mobile/src/db/client.native.ts` (ALTER TABLE)
- Modify: `apps/mobile/src/db/accountRepository.ts`
- Test: `apps/mobile/src/db/__tests__/accountRepository.test.ts` (extend, or create following the pattern of the existing files in that directory)

**Interfaces:**
- Consumes: `Account.monthAnchorDay` from shared-types (Task 3)
- Produces: `accountStore.currentAccount.monthAnchorDay` for Tasks 8 and 9

- [ ] **Step 1: Add the Drizzle column**

In `apps/mobile/src/db/schema/index.ts`, inside `accounts`, after `tripEndDate`:

```ts
  monthAnchorDay: integer('month_anchor_day'),
```

- [ ] **Step 2: Add the SQLite migration**

In `apps/mobile/src/db/client.native.ts`, beside the other `accounts` ALTER statements (near line 627):

```ts
    // Financial month anchor: null = calendar month
    try { expoDb.execSync(`ALTER TABLE accounts ADD COLUMN month_anchor_day INTEGER`); } catch {}
```

- [ ] **Step 3: Map the column in the repository**

`apps/mobile/src/db/accountRepository.ts` exports `loadAllAccounts`, `insertAccount`,
`updateAccountInDb`, `insertAccounts` (there is no `upsertAccount` and no `getAccountById` — do
not invent them). Add `monthAnchorDay` to:

- the row-to-entity mapping inside `loadAllAccounts`
- the column list and values of `insertAccount` and `insertAccounts`
- the settable-field list of `updateAccountInDb`

Follow exactly how `tripStatus` is handled in the same file. A server `null` must persist as
`null`, not `0` — `0` is not a valid anchor and would be normalized away anyway, but storing it
would misrepresent the user's setting.

- [ ] **Step 4: Write the failing test**

The repository tests in `apps/mobile/src/db/__tests__/` do not round-trip a real database — they
override the `expo-sqlite` stub and assert on the SQL actually handed to the driver (see
`walletRepository.test.ts`). Follow that convention.

Create `apps/mobile/src/db/__tests__/accountRepository.test.ts`:

```ts
let capturedSql: string | undefined;
let capturedParams: unknown[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    runSync: (sql: string, ...params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return { changes: 1 };
    },
    getAllSync: (sql: string, ...params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return [];
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      await task();
    },
  }),
}));

import { insertAccount } from '../accountRepository';

describe('accountRepository writes the financial month anchor', () => {
  beforeEach(() => {
    capturedSql = undefined;
    capturedParams = [];
  });

  it('includes month_anchor_day in the insert', async () => {
    await insertAccount({
      id: 'a1',
      name: 'Personal',
      type: 'personal',
      currencyCode: 'USD',
      ownerId: 'u1',
      isActive: true,
      monthAnchorDay: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(capturedSql).toContain('month_anchor_day');
    expect(capturedParams).toContain(10);
  });

  it('writes null rather than 0 when the account uses the calendar month', async () => {
    await insertAccount({
      id: 'a2',
      name: 'Personal',
      type: 'personal',
      currencyCode: 'USD',
      ownerId: 'u1',
      isActive: true,
      monthAnchorDay: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(capturedSql).toContain('month_anchor_day');
    expect(capturedParams).not.toContain(0);
  });
});
```

Adjust the mocked driver methods to whichever ones `insertAccount` actually calls — read the top
of `accountRepository.ts` first and mirror `walletRepository.test.ts`'s stub shape.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx jest src/db`
Expected: PASS, including the two new assertions

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/db
git commit -m "feat(mobile): persist the account financial month anchor"
```

---

### Task 8: `useFinancialMonth` hook and anchored budget progress

**Files:**
- Create: `apps/mobile/src/hooks/useFinancialMonth.ts`
- Modify: `apps/mobile/src/stores/budgetStore.ts:453`
- Test: `apps/mobile/src/hooks/__tests__/useFinancialMonth.test.ts`

**Interfaces:**
- Consumes: `financialMonth` from `@budget/shared-utils` (Task 2), `accountStore.currentAccount.monthAnchorDay` (Task 7)
- Produces: `useFinancialMonth(): { anchorDay: number | null; current: { start: Date; end: Date } }` — the single read point for waves 2 and 3

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/hooks/__tests__/useFinancialMonth.test.ts`:

```ts
import { resolveFinancialMonth } from '../useFinancialMonth';

describe('resolveFinancialMonth', () => {
  it('falls back to the calendar month when no account is loaded', () => {
    const { anchorDay, current } = resolveFinancialMonth(null, new Date(2026, 7, 15));
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it('uses the account anchor', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 10 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBe(10);
    expect(current.start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('treats a corrupt stored anchor as the calendar month', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 99 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/useFinancialMonth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook with a pure core**

Create `apps/mobile/src/hooks/useFinancialMonth.ts`:

```ts
import { useMemo } from 'react';
import type { Account } from '@budget/shared-types';
import { financialMonth, normalizeAnchorDay } from '@budget/shared-utils';
import { useAccountStore } from '../stores/accountStore';

/**
 * Pure core, exported for tests. `account` may be null while the store hydrates.
 */
export function resolveFinancialMonth(
  account: Pick<Account, 'monthAnchorDay'> | null,
  now: Date,
): { anchorDay: number | null; current: { start: Date; end: Date } } {
  const anchorDay = normalizeAnchorDay(account?.monthAnchorDay ?? null);
  return { anchorDay, current: financialMonth(now, anchorDay) };
}

/**
 * The single place the app reads the account's financial month. Screens must go
 * through this rather than reaching into accountStore, so waves 2 and 3 stay a
 * one-file change if the anchor ever moves.
 */
export function useFinancialMonth() {
  const currentAccount = useAccountStore((s) => s.currentAccount);
  const anchorRaw = currentAccount?.monthAnchorDay ?? null;

  return useMemo(
    () => resolveFinancialMonth({ monthAnchorDay: anchorRaw }, new Date()),
    [anchorRaw],
  );
}
```

- [ ] **Step 4: Use the anchor in `budgetStore`**

At `apps/mobile/src/stores/budgetStore.ts:453`, pass the anchor as the third argument. The store is not a component, so it reads the account directly:

```ts
      const anchorDay = useAccountStore.getState().currentAccount?.monthAnchorDay ?? null;
      const { periodStart, periodEnd } = computeBudgetPeriod(budget, now, anchorDay);
```

Import `useAccountStore` if it is not already imported there.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/useFinancialMonth.test.ts src/stores`
Expected: PASS, 3 new tests, no existing store test broken

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks apps/mobile/src/stores/budgetStore.ts
git commit -m "feat(mobile): read budget periods through the financial month anchor"
```

---

### Task 9: Fix period navigation on the budget detail screen

**Files:**
- Create: `apps/mobile/src/features/budgets/periodNav.ts`
- Modify: `apps/mobile/app/budget/[id].tsx` (`periodsMatch` ~line 88, `stepPeriod` ~line 106, `canGoBack` ~line 127, and the period label)
- Test: `apps/mobile/src/features/budgets/__tests__/periodNav.test.ts` (create)

The pure helper goes under `src/features/budgets/` — alongside the existing `src/features/analytics/`
and `src/features/insights/` — not under `app/`. Every test in this repo lives in
`src/**/__tests__/`; there are none under `app/`, which is Expo Router's route tree.

**Interfaces:**
- Consumes: `financialMonth`, `shiftFinancialMonth`, `formatFinancialMonth` (Task 2), `useFinancialMonth` (Task 8)
- Produces: nothing new

This screen's month navigation is written against the calendar and breaks under an anchor in
three separate ways, so it cannot be left for a later wave:

- `periodsMatch` decides "is this the current period" for `monthly` by comparing `getFullYear()`
  and `getMonth()`. An anchored period spans two calendar months, so on 5 September the period
  10 Aug – 9 Sep would be judged *not* current.
- `stepPeriod` uses `d.setMonth(d.getMonth() + delta)` — the same overflow fixed server-side in
  Task 6. Stepping back from the 31st skips a month.
- `canGoBack` repeats the same `setMonth` arithmetic.

- [ ] **Step 1: Extract the pure logic and write the failing test**

Create `apps/mobile/src/features/budgets/__tests__/periodNav.test.ts`:

```ts
import { isCurrentBudgetPeriod, stepBudgetPeriod } from '../periodNav';

describe('isCurrentBudgetPeriod', () => {
  it('recognises an anchored period that spans two calendar months', () => {
    // 5 Sep, anchor 10 -> the live period is 10 Aug - 9 Sep.
    const ref = new Date(2026, 8, 5);
    expect(isCurrentBudgetPeriod('monthly', ref, 10, new Date(2026, 8, 5))).toBe(true);
  });

  it('rejects a period that is genuinely in the past', () => {
    expect(isCurrentBudgetPeriod('monthly', new Date(2026, 6, 15), 10, new Date(2026, 8, 5)))
      .toBe(false);
  });

  it('still works for calendar months', () => {
    expect(isCurrentBudgetPeriod('monthly', new Date(2026, 7, 3), null, new Date(2026, 7, 20)))
      .toBe(true);
  });
});

describe('stepBudgetPeriod', () => {
  it('steps monthly back from the 31st without skipping February', () => {
    const ref = stepBudgetPeriod('monthly', new Date(2026, 2, 31), -1, null);
    expect(ref.getMonth()).toBe(1);
  });

  it('steps an anchored period back a whole period', () => {
    const ref = stepBudgetPeriod('monthly', new Date(2026, 7, 15), -1, 10);
    expect(ref.getMonth()).toBe(6);
    expect(ref.getDate()).toBe(10);
  });

  it('leaves weekly stepping alone', () => {
    const ref = stepBudgetPeriod('weekly', new Date(2026, 7, 15), -1, 10);
    expect(ref.getDate()).toBe(8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/features/budgets`
Expected: FAIL — `Cannot find module '../periodNav'`

- [ ] **Step 3: Create the pure helper**

Create `apps/mobile/src/features/budgets/periodNav.ts`:

```ts
import { financialMonth, shiftFinancialMonth, getStartOfWeek } from '@budget/shared-utils';

/**
 * Period navigation for the budget detail screen. Pure so it can be tested
 * without rendering; an anchored monthly period spans two calendar months, so
 * "same month" comparisons are wrong and must go through financialMonth().
 */
export function isCurrentBudgetPeriod(
  period: string,
  ref: Date,
  anchorDay: number | null,
  now: Date = new Date(),
): boolean {
  switch (period) {
    case 'daily':
      return ref.toDateString() === now.toDateString();
    case 'weekly':
      return getStartOfWeek(ref).getTime() === getStartOfWeek(now).getTime();
    case 'yearly':
      return ref.getFullYear() === now.getFullYear();
    case 'monthly':
      return (
        financialMonth(ref, anchorDay).start.getTime() ===
        financialMonth(now, anchorDay).start.getTime()
      );
    default:
      return true;
  }
}

export function stepBudgetPeriod(
  period: string,
  ref: Date,
  delta: 1 | -1,
  anchorDay: number | null,
): Date {
  switch (period) {
    case 'daily':
      return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + delta, 12);
    case 'weekly':
      return getStartOfWeek(
        new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 7 * delta, 12),
      );
    case 'yearly':
      return new Date(ref.getFullYear() + delta, ref.getMonth(), 1, 12);
    case 'monthly':
      return shiftFinancialMonth(ref, delta, anchorDay);
    default:
      return ref;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/features/budgets`
Expected: PASS, 6 tests

- [ ] **Step 5: Wire the screen to the helper**

In `apps/mobile/app/budget/[id].tsx`:

- read the anchor with `const { anchorDay } = useFinancialMonth();`
- delete the local `periodsMatch` and replace `isCurrentPeriod` with
  `isCurrentBudgetPeriod(budget.period, referenceDate, anchorDay)`
- replace the body of `stepPeriod` with
  `setReferenceDate(stepBudgetPeriod(budget.period, referenceDate, delta, anchorDay))`
- replace the `canGoBack` arithmetic with a candidate from
  `stepBudgetPeriod(budget.period, referenceDate, -1, anchorDay)`, keeping the existing
  `budget.period === 'custom'` early return
- for a monthly budget, render the period heading from
  `formatFinancialMonth(periodStart, periodEnd, i18n.language)` — `label` as the title and
  `range` as the subtitle

- [ ] **Step 6: Run the mobile suite and typecheck**

Run: `cd apps/mobile && npx jest && npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/budget
git commit -m "fix(mobile): make budget period navigation anchor-aware"
```

---

### Task 10: Account setting UI and i18n

**Files:**
- Modify: `apps/mobile/app/account/[id].tsx`
- Modify: all 9 of `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: `accountStore` update action, `Account.monthAnchorDay`
- Produces: the only way a user sets the anchor

- [ ] **Step 1: Add the English i18n keys**

In `apps/mobile/src/i18n/locales/en.ts`, inside the existing `accounts` object:

```ts
    financialMonth: 'Financial month',
    financialMonthStartsOn: 'Month starts on day {{day}}',
    financialMonthCalendar: 'Calendar month (1st)',
    financialMonthPickerTitle: 'Financial month starts on',
    financialMonthHint:
      'If your salary arrives on the 10th, set 10 — budgets and reports will run from the 10th to the 9th. Past periods are regrouped too; no data is changed.',
    financialMonthClamped: 'In shorter months the period starts on the last day.',
```

- [ ] **Step 2: Mirror the six keys into the other 8 locales**

Add the same six keys, translated, to `de, es, fr, pl, ru, ua, be, nl`. Keep `{{day}}` untranslated in every file.

Russian, as the reference translation:

```ts
    financialMonth: 'Финансовый месяц',
    financialMonthStartsOn: 'Месяц начинается {{day}}-го числа',
    financialMonthCalendar: 'Календарный месяц (с 1-го)',
    financialMonthPickerTitle: 'Финансовый месяц начинается',
    financialMonthHint:
      'Если зарплата приходит 10-го, укажите 10 — бюджеты и отчёты будут считаться с 10-го по 9-е. Прошлые периоды тоже пересоберутся; данные при этом не меняются.',
    financialMonthClamped: 'В коротких месяцах период начнётся в последний день.',
```

- [ ] **Step 3: Add the settings row and picker**

In `apps/mobile/app/account/[id].tsx`, next to the purchase-approval-rule row, add an owner-only row showing either `financialMonthCalendar` or `financialMonthStartsOn` with the current day, opening a bottom sheet.

The sheet lists `financialMonthCalendar` (sets `null`) followed by days 1–31, and shows `financialMonthHint` at the top and `financialMonthClamped` when the selected day is above 28. Saving calls the existing account-update action with `{ monthAnchorDay: value }`.

Gate the row with the same owner check the approval-rule row already uses — do not invent a new one. Follow the bottom-sheet markup already in this file (backdrop, handle bar, Cancel/Save) rather than introducing a new modal style.

- [ ] **Step 4: Verify the i18n keys are complete**

Run: `cd apps/mobile && npx jest src/i18n`
Expected: PASS. If no i18n parity test exists, verify manually that all 9 files contain all 6 keys:

```bash
for f in en de es fr pl ru ua be nl; do
  printf '%s: ' "$f"
  grep -c "financialMonth" "apps/mobile/src/i18n/locales/$f.ts"
done
```

Expected: `6` for every locale.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint app/account/[id].tsx src/hooks/useFinancialMonth.ts`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/account apps/mobile/src/i18n
git commit -m "feat(mobile): let an account owner set the financial month anchor"
```

---

## Wave 1 exit criteria

- [ ] `cd apps/api && npx jest` — green, with `budgets.service.spec.ts` and `budget-alert.service.spec.ts` unmodified
- [ ] `cd apps/mobile && npx jest` — green
- [ ] `npm run typecheck` at the repo root — green
- [ ] `bash scripts/check-no-shared-utils-runtime-import.sh` — passes (no runtime shared-utils import leaked into `apps/api`)
- [ ] Manual: create a monthly budget, set the account anchor to 10, confirm the budget period reads 10th–9th, that spend recomputes, and that the ← → period arrows on the budget detail screen step whole anchored periods; set it back to calendar and confirm the original numbers return
- [ ] Follow the `finish-aba-task` skill: open the ABA issue and update `CLAUDE.md` plus `user_docs/` for the new setting

## Explicitly NOT in wave 1

Analytics, home screen totals, calendar widget, safe-to-spend, story, fat-finder, reports, and the AI user-context summary still use calendar months. That is intentional — the spec's constraint is that server and client sides of a single number migrate together, and those pair up in waves 2 and 3. Do not opportunistically convert them here.
