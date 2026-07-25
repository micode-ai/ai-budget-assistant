# Receipt Price Check — Mobile Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the receipt price check its user-facing surfaces — findings on the scan-confirmation screen, a real alert card, and a "found overpayments" total — then turn the alert write on.

**Architecture:** Plan 1 already returns `priceFindings` in every scan response and (behind a default-off flag) writes one `price_overcharge` alert per receipt. This plan adds only consumers plus one small aggregation endpoint. No new engine logic, no migration.

**Tech Stack:** Expo 54 / React Native, Zustand, i18next (9 locales), NestJS 10.

Plan 1: `docs/superpowers/plans/2026-07-25-receipt-price-check-api.md` (ABA-373, merged)
Spec: `docs/superpowers/specs/2026-07-25-receipt-price-check-design.md`

## Global Constraints

- **Copy may never accuse.** The data cannot prove a promotion failed to apply, so no string in any of the 9 locales may say "overcharged", "cheated", "scammed", or "promo not applied". The permitted framing is "more expensive than usual — check the receipt". `overpaidAmount` is an internal field name and must not surface in wording. **Check every language you write, not just English.**
- **The counter says "found", never "saved".** There is no evidence the user acted on a finding. Inflation Shield already had to retreat from a "saved" claim; do not repeat it.
- **Never sum across currencies.** No FX anywhere in this feature — the new endpoint returns per-currency totals, never one blended number.
- **All 9 mobile locales** must be updated together: `en, de, es, fr, pl, ru, ua, be, nl`.
- **`apps/api` must not import runtime values from `@budget/shared-types`/`shared-utils`** — `import type` only.
- No database migration in this plan.

## Scope change from the spec — read this first

The spec and Plan 1 assumed `expense_items.canonical_name` **strips** pack size, which is why a `size` field, a migration, and a size-equality gate were planned. **That premise is false.** The live OCR prompt (`ocr.service.ts:284-294`) already keeps per-unit size inside the canonical name and strips only pack-quantity multipliers:

```
MLEKO 3,2% ŁACIATE 1L 6SZT      → Mleko Łaciate 3,2% 1L
CHLEB RAZOWY WIEJSKI 500G       → Chleb Razowy Wiejski 500g
SERK DANIO TRUSKAWKOWY 4×130G   → Danio Truskawkowy 130g
```

So a 1 L and a 500 ml purchase already have **different** canonical names and never match each other — the false-positive class the `size` field was meant to close is already closed by the naming rules. Consequences, all folded into this plan:

- **The `size` field is dropped entirely** — no migration, no propagation through the OCR prompt / `ExpensesService` / `SyncService` / mobile schema / repository / query.
- **The engine's size gate is now unreachable** (nothing ever populates `ReceiptCheckPoint.size`) and is removed in Task 7, along with `ReceiptCheckFinding.size`.
- **Two documents are wrong and get corrected in Task 7**: `CLAUDE.md`'s Personal Inflation Index entry ("short clean name without weight/volume/codes … → `Mleko Łaciate`") and the price-check spec's size sections.

Residual, deliberately not addressed: rows written under the older prompt (and the `buildCanonicalNameFallback` v1/v2 backfills) may carry size-less names, so the corpus is mixed. Existing `MAX_RISE_PCT = 100` remains the outlier guard for that. Per-litre/kg normalization stays a follow-up and needs *parsed* size (number + unit + conversion), which is its own design — not a raw token column.

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/i18n/locales/*.ts` (9) | `receiptCheck.*` + `alerts.priceCheck*` strings |
| `apps/api/src/modules/anomaly/anomaly.controller.ts` | `GET /alerts/price-check-summary` |
| `apps/api/src/modules/anomaly/anomaly.service.ts` | `getPriceCheckSummary` aggregation |
| `packages/shared-types/src/dto/receipt-check.ts` | summary DTO; drop `size` from the finding |
| `apps/mobile/src/components/receipt/PriceFindingsCard.tsx` | **create** — the findings card |
| `apps/mobile/app/expense/receipt.tsx` | mount the card |
| `apps/mobile/app/alerts/index.tsx` | `price_overcharge` case + icon |
| `apps/mobile/src/services/alerts.api.ts` | summary fetch |
| `apps/mobile/src/stores/alertStore.ts` | summary state |
| `apps/mobile/src/components/analytics/InflationIndexSection.tsx` | the "found" line |
| `apps/api/src/modules/{telegram,whatsapp,slack}/helpers/i18n.ts` | plural-safe rewording |
| `apps/api/src/modules/price-history/receipt-check.util.ts` | remove the dead size gate |

---

### Task 1: Strings in all 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the keys every later task renders — `receiptCheck.cardTitle`, `receiptCheck.cardSubtitle`, `receiptCheck.usually`, `receiptCheck.youPaid`, `receiptCheck.difference`, `receiptCheck.lowConfidence`, `receiptCheck.foundTotal`, `receiptCheck.foundTotalEmpty`, and `alerts.priceCheckTitle`, `alerts.priceCheckBody`.

- [ ] **Step 1: Add the English keys**

In `apps/mobile/src/i18n/locales/en.ts`, add a `receiptCheck` namespace and two `alerts.*` keys. Slavic plural variants use i18next's `_one`/`_few`/`_many` suffixes, as this codebase already does for `map.*`:

```ts
  receiptCheck: {
    cardTitle_one: '{{count}} item costs more than usual',
    cardTitle_other: '{{count}} items cost more than usual',
    cardSubtitle: 'About {{amount}} more than you usually pay here — worth checking the receipt.',
    usually: 'usually',
    youPaid: 'you paid',
    difference: 'difference',
    lowConfidence: 'based on only two earlier purchases',
    foundTotal: 'Found {{amount}} above your usual prices this year',
    foundTotalEmpty: 'Nothing above your usual prices yet',
  },
```

and inside the existing `alerts` object:

```ts
    priceCheckTitle: 'Worth checking this receipt',
    priceCheckBody: '{{count}} item(s) at {{merchant}} cost about {{amount}} {{currency}} more than usual.',
```

- [ ] **Step 2: Translate into the other 8 locales**

Add the same keys to `de, es, fr, pl, ru, ua, be, nl`. Requirements:

- Genuine translations, not English copied over.
- `ru`, `ua`, `be`, `pl` need `_one` / `_few` / `_many` variants for `cardTitle` (i18next selects by count for Slavic languages); `de`, `es`, `fr`, `nl` need `_one` / `_other`.
- **No locale may accuse.** Do not translate as "вас обсчитали", "oszukano cię", "man hat Sie betrogen", or any equivalent. The frame is "more expensive than usual — worth checking".
- `foundTotal` must say *found*, not *saved*.

- [ ] **Step 3: Verify all 9 files parse and no key is missing**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

Then confirm coverage — every locale must report the same count:

Run: `cd apps/mobile && for f in src/i18n/locales/*.ts; do echo -n "$f "; grep -c "cardTitle\|cardSubtitle\|usually:\|youPaid\|difference:\|lowConfidence\|foundTotal\|priceCheckTitle\|priceCheckBody" $f; done`
Expected: the same number on every line.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(i18n): add receipt price-check strings in all 9 locales"
```

---

### Task 2: The found-overpayments endpoint

**Files:**
- Modify: `packages/shared-types/src/dto/receipt-check.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.controller.ts`
- Test: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`, `apps/api/src/modules/anomaly/anomaly.controller.spec.ts`

**Interfaces:**
- Consumes: the `price_overcharge` alerts written by Plan 1.
- Produces: `PriceCheckSummary { totalsByCurrency: Record<string, number>; alertCount: number; since: string }` and `AnomalyService.getPriceCheckSummary(accountId, since: Date): Promise<PriceCheckSummary>`, served by `GET /alerts/price-check-summary`.

**Why per-currency:** a blended total would require FX, which this feature forbids everywhere. The endpoint returns a map and the client picks what to display.

- [ ] **Step 1: Add the DTO**

In `packages/shared-types/src/dto/receipt-check.ts`, append:

```ts
/**
 * How much the price check has FOUND above the user's usual prices — deliberately
 * "found", not "saved": nothing here proves the user acted on a finding.
 * Totals are per currency; this feature never converts between currencies.
 */
export interface PriceCheckSummary {
  totalsByCurrency: Record<string, number>;
  alertCount: number;
  /** ISO date the window starts at. */
  since: string;
}
```

- [ ] **Step 2: Write the failing service test**

Append to `apps/api/src/modules/anomaly/anomaly.service.spec.ts`, following that file's fixture style:

```ts
describe('getPriceCheckSummary', () => {
  it('sums per currency and never blends them', async () => {
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 4 }, { overpaidAmount: 2.5 }] } },
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 1.5 }] } },
      { params: { currencyCode: 'EUR', findings: [{ overpaidAmount: 3 }] } },
    ]);

    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));

    expect(out.totalsByCurrency).toEqual({ PLN: 8, EUR: 3 });
    expect(out.alertCount).toBe(3);
  });

  it('returns empty totals when there are no alerts', async () => {
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([]);
    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));
    expect(out.totalsByCurrency).toEqual({});
    expect(out.alertCount).toBe(0);
  });

  it('ignores a malformed params blob instead of throwing', async () => {
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([
      { params: null },
      { params: { currencyCode: 'PLN', findings: 'not-an-array' } },
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 'x' }, { overpaidAmount: 5 }] } },
    ]);
    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));
    expect(out.totalsByCurrency).toEqual({ PLN: 5 });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd apps/api && npx jest anomaly.service -t getPriceCheckSummary`
Expected: FAIL — `service.getPriceCheckSummary is not a function`.

- [ ] **Step 4: Implement the aggregation**

Add to `AnomalyService`. It reads only its own table and tolerates any shape in `params`, because that column is untyped JSON:

```ts
  /**
   * How much the price check has FOUND above the user's usual prices since a
   * given date. Per currency on purpose — this feature never converts between
   * currencies, so a single blended figure would be a lie.
   */
  async getPriceCheckSummary(accountId: string, since: Date): Promise<PriceCheckSummary> {
    const alerts = await this.prisma.anomalyAlert.findMany({
      where: { accountId, type: 'price_overcharge', dismissedAt: null, createdAt: { gte: since } },
      select: { params: true },
    });

    const totalsByCurrency: Record<string, number> = {};
    for (const alert of alerts) {
      const params = alert.params as { currencyCode?: unknown; findings?: unknown } | null;
      const currency = typeof params?.currencyCode === 'string' ? params.currencyCode : null;
      if (!currency || !Array.isArray(params?.findings)) continue;
      for (const finding of params.findings as Array<{ overpaidAmount?: unknown }>) {
        const amount = Number(finding?.overpaidAmount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        totalsByCurrency[currency] = Math.round(((totalsByCurrency[currency] ?? 0) + amount) * 100) / 100;
      }
    }

    return { totalsByCurrency, alertCount: alerts.length, since: since.toISOString().slice(0, 10) };
  }
```

Add the type-only import at the top of the file: `import type { AnomalyAlertType, PriceCheckSummary } from '@budget/shared-types';` (extend the existing import rather than adding a second one).

- [ ] **Step 5: Add the route**

In `anomaly.controller.ts`, **declare it before the `:id` routes** — Express matches in declaration order, and a `@Patch(':id/read')`-style route placed first would swallow a static path. This is the ABA-166 lesson and it has already bitten this codebase twice.

```ts
  @Get('price-check-summary')
  async getPriceCheckSummary(@Req() req: AuthenticatedRequest): Promise<PriceCheckSummary> {
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    return this.anomalyService.getPriceCheckSummary(req.accountId, since);
  }
```

Match the file's existing decorator and request-typing style exactly (it already uses `AuthenticatedRequest` and a class-level guard set — do not add per-method guards it does not use). Read access is account-wide, so no `ViewerBlockGuard`.

- [ ] **Step 6: Add a controller routing test**

Append to `anomaly.controller.spec.ts`, following its existing style, a test asserting `GET /alerts/price-check-summary` reaches `getPriceCheckSummary` and not the `:id` handler. If that spec file has no routing-order pattern to copy, assert the controller method delegates with the account id from the request and note in your report that ordering is covered by declaration position only.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd apps/api && npx jest anomaly && cd ../.. && npm run typecheck`
Expected: PASS, apart from the documented pre-existing failures (see *Known pre-existing breakage* at the end of this plan).

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types/src/dto/receipt-check.ts apps/api/src/modules/anomaly
git commit -m "feat(anomaly): add per-currency price-check found-total endpoint"
```

---

### Task 3: Findings card on the scan-confirmation screen

**Files:**
- Create: `apps/mobile/src/components/receipt/PriceFindingsCard.tsx`
- Modify: `apps/mobile/app/expense/receipt.tsx` (insert after the `expenseCard` block that starts near `:279`)
- Test: `apps/mobile/src/components/receipt/__tests__/priceFindings.test.ts`

**Interfaces:**
- Consumes: `receipt.priceFindings` from the scan response (Plan 1); the `receiptCheck.*` keys from Task 1.
- Produces: `PriceFindingsCard` (default-exported component) and the pure helper `summarizeFindings(findings): { count: number; total: number; currencyCode: string } | null`.

**Behavior:** collapsed by default showing "N items cost more than usual · about X more"; tapping expands per-product rows (product / usually / you paid / difference). It never blocks the save and never edits any amount — the user is deciding whether to walk back to the register, not correcting bookkeeping. When `priceFindings` is empty the component renders `null` and the screen looks exactly as it does today.

- [ ] **Step 1: Write the failing test for the pure helper**

Create `apps/mobile/src/components/receipt/__tests__/priceFindings.test.ts`:

```ts
import { summarizeFindings } from '../PriceFindingsCard';

const f = (overpaidAmount: number, currencyCode = 'PLN') =>
  ({ overpaidAmount, currencyCode } as any);

describe('summarizeFindings', () => {
  it('returns null for an empty list', () => {
    expect(summarizeFindings([])).toBeNull();
  });

  it('sums the amounts and takes the currency from the findings', () => {
    expect(summarizeFindings([f(4), f(2.5)])).toEqual({ count: 2, total: 6.5, currencyCode: 'PLN' });
  });

  it('rounds the total to two decimals', () => {
    expect(summarizeFindings([f(0.1), f(0.2)])?.total).toBe(0.3);
  });

  it('never blends currencies — keeps only those matching the first finding', () => {
    expect(summarizeFindings([f(4, 'PLN'), f(3, 'EUR')])).toEqual({
      count: 1,
      total: 4,
      currencyCode: 'PLN',
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/mobile && npx jest priceFindings`
Expected: FAIL — cannot resolve `../PriceFindingsCard`.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/src/components/receipt/PriceFindingsCard.tsx`. Follow the conventions of an existing card in `src/components/` — a `createStyles(theme)` factory, `useTheme()`, `useTranslation()`, no inline colour literals. The pure helper first:

```tsx
export function summarizeFindings(
  findings: ReceiptCheckFinding[],
): { count: number; total: number; currencyCode: string } | null {
  if (!findings || findings.length === 0) return null;
  // One currency only: a receipt has a single currency, and this feature never
  // converts between them. If a mixed list ever arrives, keep the first currency
  // rather than inventing a blended number.
  const currencyCode = findings[0].currencyCode;
  const same = findings.filter((f) => f.currencyCode === currencyCode);
  const total = Math.round(same.reduce((sum, f) => sum + f.overpaidAmount, 0) * 100) / 100;
  return { count: same.length, total, currencyCode };
}
```

Then the component:

```tsx
interface Props {
  findings: ReceiptCheckFinding[];
}

export default function PriceFindingsCard({ findings }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);

  const summary = summarizeFindings(findings);
  if (!summary) return null;

  const { count, total, currencyCode } = summary;
  const shown = findings.filter((f) => f.currencyCode === currencyCode);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Ionicons name="pricetag-outline" size={20} color={theme.colors.warning} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('receiptCheck.cardTitle', { count })}</Text>
          <Text style={styles.subtitle}>
            {t('receiptCheck.cardSubtitle', {
              amount: formatCurrency(total, currencyCode as Currency),
            })}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded &&
        shown.map((f, i) => (
          <View key={`${f.canonicalName}-${i}`} style={styles.row}>
            <Text style={styles.product}>{f.canonicalName}</Text>
            <View style={styles.prices}>
              <Text style={styles.priceLabel}>
                {t('receiptCheck.usually')}{' '}
                {formatCurrency(f.baselineUnitPrice, currencyCode as Currency)}
              </Text>
              <Text style={styles.priceLabel}>
                {t('receiptCheck.youPaid')}{' '}
                {formatCurrency(f.paidUnitPrice, currencyCode as Currency)}
              </Text>
              <Text style={styles.diff}>
                {t('receiptCheck.difference')}{' '}
                {formatCurrency(f.overpaidAmount, currencyCode as Currency)}
              </Text>
            </View>
            {f.confidence === 'low' && (
              <Text style={styles.lowConfidence}>{t('receiptCheck.lowConfidence')}</Text>
            )}
          </View>
        ))}
    </View>
  );
}
```

Use `theme.colors.warning` for the header accent — **not** `danger`: this is a prompt to check, not an error. Write `createStyles(theme)` in the same file following a neighbouring card's conventions; no colour literals.

- [ ] **Step 4: Run the test**

Run: `cd apps/mobile && npx jest priceFindings`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount it on the screen**

In `apps/mobile/app/expense/receipt.tsx`, import the card and render it directly **after** the closing tag of the `styles.expenseCard` `View` (the block beginning near `:279` that shows total / discount / description / merchant / category), so it sits above the form controls without displacing them:

```tsx
            <PriceFindingsCard findings={scannedReceipt?.priceFindings ?? []} />
```

The `?? []` matters: an older API build returns no such field, and the card must degrade to rendering nothing rather than crashing.

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/receipt apps/mobile/app/expense/receipt.tsx
git commit -m "feat(mobile): show price-check findings on the scan confirmation screen"
```

---

### Task 4: The alert card

**Files:**
- Modify: `apps/mobile/app/alerts/index.tsx` (`TYPE_ICON` at `:23`, `renderBody`'s switch at `:90`)

**Interfaces:**
- Consumes: the `price_overcharge` alert `params` written by Plan 1 (`{ merchant, currencyCode, totalAmount, findings }`), and `alerts.priceCheck*` from Task 1.
- Produces: nothing consumed later.

**Why this task is load-bearing:** `renderBody`'s `default:` branch returns `{ title: String(alert.type), body: '' }`, so until this lands, the alert renders as the literal string `price_overcharge`. This task is the precondition for turning the write on in Task 8.

- [ ] **Step 1: Add the icon**

In the `TYPE_ICON` map at `:23`, add:

```ts
  price_overcharge: 'pricetag-outline',
```

- [ ] **Step 2: Add the case**

In `renderBody`'s switch, before `default:`, following the shape of the sibling cases exactly:

```tsx
        case 'price_overcharge':
          return {
            title: t('alerts.priceCheckTitle'),
            body: t('alerts.priceCheckBody', {
              count: Array.isArray(p.findings) ? p.findings.length : 0,
              merchant: p.merchant,
              amount: p.totalAmount,
              currency: p.currencyCode,
            }),
          };
```

`p` is typed `Record<string, string | number>` in that callback, so `p.findings` (an array) needs a local read rather than a widened map type — widening `p` would loosen every sibling case. Read it separately, immediately above the `return`:

```tsx
        case 'price_overcharge': {
          const findingCount = Array.isArray((alert.params as { findings?: unknown }).findings)
            ? ((alert.params as { findings: unknown[] }).findings).length
            : 0;
          return {
            title: t('alerts.priceCheckTitle'),
            body: t('alerts.priceCheckBody', {
              count: findingCount,
              merchant: p.merchant,
              amount: p.totalAmount,
              currency: p.currencyCode,
            }),
          };
        }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Verify the tap target still works**

Read `handlePress` / `openAlertTargets` in the same file and confirm a `price_overcharge` alert — which carries a top-level `expenseId` — flows down the existing expense-resolution path (the 4-way `id`/`serverId`/`clientId`/`localId` match, with its force-pull-and-retry). Do not change that logic; just confirm it and say so in your report. If it turns out this alert type needs different handling, stop and report rather than improvising.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/alerts/index.tsx
git commit -m "feat(mobile): render the price-check alert instead of its raw type string"
```

---

### Task 5: The found-overpayments total

**Files:**
- Modify: `apps/mobile/src/services/alerts.api.ts`
- Modify: `apps/mobile/src/stores/alertStore.ts`
- Modify: `apps/mobile/src/components/analytics/InflationIndexSection.tsx`

**Interfaces:**
- Consumes: `GET /alerts/price-check-summary` (Task 2), `receiptCheck.foundTotal` / `foundTotalEmpty` (Task 1).
- Produces: `api.getPriceCheckSummary()`, `alertStore.priceCheckSummary` + `loadPriceCheckSummary()`.

- [ ] **Step 1: Add the API method**

In `apps/mobile/src/services/alerts.api.ts`, following the file's existing method shape:

```ts
  async getPriceCheckSummary(): Promise<PriceCheckSummary> {
    return this.request<PriceCheckSummary>('/alerts/price-check-summary');
  }
```

- [ ] **Step 2: Add store state**

In `alertStore.ts`, add `priceCheckSummary: PriceCheckSummary | null` (initial `null`) and:

```ts
  loadPriceCheckSummary: async () => {
    try {
      const summary = await api.getPriceCheckSummary();
      set({ priceCheckSummary: summary });
    } catch (error) {
      // Non-critical decoration on the analytics screen — never surface it.
      console.warn('[alertStore] price-check summary failed', error);
    }
  },
```

`console.warn`, not `console.error`: a failed decorative fetch must not raise RN's red-box overlay. This is the established convention in this codebase.

- [ ] **Step 3: Render the line**

In `InflationIndexSection.tsx`, call `loadPriceCheckSummary()` from the same effect that already loads the section's data, and render one line under the inflation-index block (near `:157`, after `priceHistory.trackedProducts`):

Selecting which currency to show — the user's own if the price check found anything in it, otherwise the largest total. **Never add the currencies together.** Put this helper at module scope in the same file so it is testable and obvious:

```tsx
export function pickFoundTotal(
  totalsByCurrency: Record<string, number>,
  baseCurrency: string,
): { amount: number; currency: string } | null {
  const entries = Object.entries(totalsByCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  const own = entries.find(([c]) => c === baseCurrency);
  const [currency, amount] = own ?? entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { amount, currency };
}
```

and render:

```tsx
      {(() => {
        const found = pickFoundTotal(priceCheckSummary?.totalsByCurrency ?? {}, user?.currencyCode ?? 'USD');
        return (
          <Text style={styles.foundTotal}>
            {found
              ? t('receiptCheck.foundTotal', {
                  amount: formatCurrency(found.amount, found.currency as Currency),
                })
              : t('receiptCheck.foundTotalEmpty')}
          </Text>
        );
      })()}
```

Keep the wording "found" — see Global Constraints.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/alerts.api.ts apps/mobile/src/stores/alertStore.ts apps/mobile/src/components/analytics/InflationIndexSection.tsx
git commit -m "feat(mobile): show the price-check found total on the analytics screen"
```

---

### Task 6: Make the bot summary line plural-safe

**Files:**
- Modify: `apps/api/src/modules/{telegram,whatsapp,slack}/helpers/i18n.ts`
- Test: `apps/api/src/modules/telegram/handlers/photo.handler.spec.ts`

**Interfaces:**
- Consumes: `buildPriceCheckLine` from Plan 1's Task 8.
- Produces: nothing consumed later.

**Why:** the bot translator is `t(key, lang, params?: Record<string, string>)` — it has **no plural support at all**. Plan 1's string embeds `{{count}}` next to a noun, so Russian, Ukrainian, Belarusian and Polish are grammatically wrong for most counts (`3 товара` is right only for 2–4; `5 товарів` needs a different form). Rather than build plural machinery into three bot i18n helpers, reword so no grammatical agreement is required — the same approach already used for the landing page's yearly-discount badge, which was made non-numeric instead of hard-coding a percentage.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/telegram/handlers/photo.handler.spec.ts`:

```ts
const findings = (n: number) =>
  Array.from({ length: n }, () => ({ canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' }));

// The old wording put the count directly before a noun, which is ungrammatical in
// Russian for most counts. Assert the count is NOT immediately followed by a word:
// it must be the last token of its clause, so no noun has to agree with it.
it.each([1, 2, 5])('keeps the count away from any agreeing noun (ru, count=%i)', (n) => {
  const line = (handler as any).buildPriceCheckLine({ priceFindings: findings(n) } as any, 'ru');
  expect(line).toMatch(new RegExp(`${n}\\s*(,|\\.|$)`));
  expect(line).not.toMatch(new RegExp(`${n}\\s+\\p{L}`, 'u'));
});
```

This is falsifiable against the old string: Plan 1's wording rendered `${count} товара`, whose `1 т…` matches the forbidden "digit followed by a letter" pattern.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/api && npx jest telegram/handlers/photo.handler`
Expected: FAIL on all three counts — the current wording places the count immediately before a noun.

- [ ] **Step 3: Reword the key in all three files, in all 8 languages**

Replace `priceCheckSummary` with a form where the count is a standalone number rather than a quantified noun. English:

```ts
  priceCheckSummary: (count: number, amount: string) =>
    `⚠️ Above your usual price — items: ${count}, difference: about ${amount}. Worth checking the receipt.`,
```

Apply the same label-then-number structure in the other 7 languages each file supports. Requirements:

- No language may accuse — no "обсчитали", "oszukano", "betrogen".
- No language may place `${count}` directly before a noun that must agree with it.
- Keep each file's existing language set exactly; add and drop nothing.

- [ ] **Step 4: Re-read every string against both rules**

This step is the point of the task. List, in your report, each of the 8 languages with its final string, and state explicitly for each that (a) it does not accuse and (b) the count is not adjacent to an agreeing noun.

- [ ] **Step 5: Run the bot tests**

Run: `cd apps/api && npx jest photo.handler`
Expected: PASS, all three bot suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/telegram apps/api/src/modules/whatsapp apps/api/src/modules/slack
git commit -m "fix(bots): make the price-check summary line plural-safe in every language"
```

---

### Task 7: Remove the dead size gate and correct the stale docs

**Files:**
- Modify: `apps/api/src/modules/price-history/receipt-check.util.ts`
- Modify: `apps/api/src/modules/price-history/receipt-check.util.spec.ts`
- Modify: `packages/shared-types/src/dto/receipt-check.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-25-receipt-price-check-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `ReceiptCheckLine`, `ReceiptCheckPoint` and `ReceiptCheckFinding` lose their `size` field; `groupReceiptLines` groups by name only.

**Why:** nothing ever populates `size` — the OCR prompt keeps size inside `canonicalName` instead (see *Scope change from the spec*). The gate cannot fire, so it is unreachable code carrying synthetic tests that suggest coverage the feature does not have.

- [ ] **Step 1: Remove the field and the gate**

In `receipt-check.util.ts`: drop `size` from `ReceiptCheckLine` and `ReceiptCheckPoint`, drop the size branch from `checkReceiptPrices`, drop `droppedBySize` from `ReceiptCheckResult['stats']` and from the caller's log line in `OcrService.runPriceCheck`, and simplify `groupReceiptLines`'s key to the normalized name alone. Leave `normalizeSize` only if something else still uses it — otherwise remove it too.

Replace the removed gate with a short comment recording why there is none, so nobody re-adds it as a "missing" check:

```ts
  // No pack-size gate: the OCR prompt keeps per-unit size inside canonicalName
  // ("Mleko Łaciate 3,2% 1L"), so different pack sizes are already different
  // products and never match each other. A structured size field would need
  // parsed value+unit for per-litre comparison — a separate piece of work.
```

- [ ] **Step 2: Remove the size tests and the DTO field**

Delete the two size-gate tests from `receipt-check.util.spec.ts` (the "drops the line when a known size does not match" and "abstains from the size gate when the history has no sizes" cases) and any `size` value in other fixtures. Remove `size` from `ReceiptCheckFinding` in `packages/shared-types/src/dto/receipt-check.ts`, and from `PriceFindingsCard` if Task 3 referenced it.

- [ ] **Step 3: Run the suites**

Run: `cd apps/api && npx jest receipt-check && npx jest ocr.service && npx jest anomaly.service && cd ../.. && npm run typecheck`
Expected: PASS apart from the documented pre-existing failures. The cross-path agreement test from Plan 1's fix wave must still pass — if it breaks, the removal changed behavior and you should stop and report.

- [ ] **Step 4: Correct `CLAUDE.md`**

Two edits:

- In the **Personal Inflation Index (ABA-307)** entry, the phrase describing `canonicalName` as a "short clean name without weight/volume/codes" with the example `"MLEKO 3,2% ŁACIATE 1L 6SZT" → "Mleko Łaciate"` is wrong and directly misled this feature's design. Replace it with the live rule: per-unit size, fat/alcohol percentage and flavour are **kept**; pack-quantity multipliers, codes and PLU numbers are **stripped** — `"MLEKO 3,2% ŁACIATE 1L 6SZT" → "Mleko Łaciate 3,2% 1L"`. Cite `ocr.service.ts`'s `canonicalName rules` block as the source of truth.
- In the **Receipt price check (ABA-373)** entry, remove the size-gate sentence and the `size` items from its deferred list, and record that there is deliberately no size gate, with the reason.

- [ ] **Step 5: Correct the spec**

In `docs/superpowers/specs/2026-07-25-receipt-price-check-design.md`, replace the "OCR prompt change — the `size` field" section and the size row of the gates table with a short note that the premise was wrong, what the real naming rule is, and that per-litre normalization remains the open follow-up. Leave the rest of the spec intact — it is the record of what was decided, not a live document.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/price-history packages/shared-types/src/dto/receipt-check.ts CLAUDE.md docs/superpowers/specs/2026-07-25-receipt-price-check-design.md
git commit -m "refactor(price-history): drop the unreachable size gate and fix the canonicalName docs"
```

---

### Task 8: Turn the alert write on

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` (the ABA-373 entry's release-gate sentence)
- Create: `docs/ops/receipt-price-check-rollout.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the runbook and the flipped default.

**Precondition — do not skip:** Tasks 1 and 4 must be merged AND a mobile build containing them must be rolled out before the flag is turned on in production. Until then, older installs render the alert as the raw string `price_overcharge`. Nothing in code enforces this; that is exactly why it is written down.

- [ ] **Step 1: Write the rollout runbook**

Create `docs/ops/receipt-price-check-rollout.md` covering: what the flag gates (only the feed-row write — the detector runs and logs regardless); the precondition above; how to verify readiness by grepping the API logs for the detector's disabled-path line to confirm real findings are being produced; the exact command to flip it —

```bash
# on the VPS, in /opt/ai-budget
# add RECEIPT_CHECK_ALERTS_ENABLED=true to .env.production, then:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

— a note that `docker restart` does **not** reload `env_file` (an established trap in this project), and the rollback: set it back to `false` and force-recreate again. Existing rows stay; they are dismissible with the normal `DELETE /alerts/:id`.

- [ ] **Step 2: Flip the documented default**

In `.env.example`, change the `RECEIPT_CHECK_ALERTS_ENABLED` comment so it points at the runbook and states that `true` is the intended steady state once the mobile card has shipped. **Leave the code default off** — the flag remains opt-in per environment, so a fresh deploy is never surprising.

- [ ] **Step 3: Update `CLAUDE.md`**

Amend the ABA-373 entry's release-gate sentence to say the mobile card has shipped and to point at the runbook.

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md docs/ops/receipt-price-check-rollout.md
git commit -m "docs: add the price-check alert rollout runbook"
```

---

## Done when

- All 9 locales carry the new keys, with Slavic plural variants, and none accuses.
- A scanned receipt with findings shows the card; one without is byte-identical to today.
- A `price_overcharge` alert renders real localized copy, and tapping it opens the linked expense.
- The analytics screen shows a per-currency "found" total that never blends currencies.
- The bot line is grammatical in all 8 bot languages at counts 1, 2 and 5.
- `npx jest` in `apps/api` and `npx tsc --noEmit` in `apps/mobile` are clean apart from the documented pre-existing failures.
- The rollout runbook exists and the flag's steady state is documented.

## Known pre-existing breakage — not this plan's to fix

Verified on Plan 1's base commit and untouched by either plan: two `computeInflationIndex` failures in `price-history.service.spec.ts`; failures in `whatsapp-link.service.spec.ts` and `family-feed.service.spec.ts`; an `apps/admin` typecheck error in a skeleton component; three `shared-types` lint errors in `dto/ai.ts`, `entities/category.ts`, `entities/encryption.ts`. Report them, do not fix them here.

## Follow-ups after this plan

- Per-litre/kg normalization, which needs *parsed* size (value + unit + conversion) and would also fix community-price exact matching — its own design task.
- Wire community prices into the two services once `COMMUNITY_PRICE_READ_ENABLED` is on; the engine already supports and tests the fallback baseline. Then add the "cheaper nearby" hint.
- An index on `expense_items.canonical_name` — the `in (...)` filter is currently unindexed, which is dwarfed today by the OCR model call but worth folding into the next migration that touches the table.
- A real "saved" counter, which requires a dispute/refund-claim flow to prove the user acted.
- Extract the per-unit price helper's remaining duplication if a fourth consumer appears.
