# Inflation Shield — AI Chat Tool + Freshness Fixes (Plan 3 of N) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI chat answer "what should I stock up on before it gets more expensive?" by exposing the Inflation Shield as a read tool (`get_inflation_shield`), rendered as a result card — and fix the two freshness gaps the Plan-2 review flagged (stale `shield:` cache after a purchase; `fxApproximate` not reflecting converted `savedSoFar`).

**Architecture:** `get_inflation_shield` is a READ action (no confirmation, cached + narrated via the existing `handleReadAction` path, exactly like `check_affordability`). `AiToolsService` injects the already-exported `InflationShieldService` (from `InsightsModule`, which `AiModule` already imports) and returns the shield response as the tool result. The mobile `ActionResultCard` gains a `ShieldResult` case. Two small backend fixes round out data freshness.

**Tech Stack:** NestJS 10, OpenAI function-calling, Jest, TypeScript; Expo/React Native for the one mobile card + i18n.

**Design spec:** `docs/superpowers/specs/2026-07-15-inflation-shield-design.md` (§1 "AI chat tool"). Builds on Plan 1 (engine + `GET /insights/inflation-shield`) and Plan 2 (tracking), both implemented.

## Global Constraints

- **This is Plan 3 of N.** Scope = the `get_inflation_shield` read tool + its result card + i18n, PLUS two Plan-2-review freshness fixes. OUT of scope (later plans): the home-screen widget/screen/share card, the shopping-list "buy ahead" strip, community-price boost, and the proactive push/cron.
- **`get_inflation_shield` is a READ action** — it must NOT be added to `AiToolsService.isWriteAction`, so it routes through `handleReadAction` (immediate, cached, narrated). No confirmation card.
- **No new module wiring** — `InflationShieldService` is already exported by `InsightsModule`, and `AiModule` already imports `InsightsModule` (for `SafeToSpendService`/`check_affordability`). `AiToolsService` just adds the constructor injection.
- **The AI narrates only** — the shield's numbers (`monthlyChangePct`, `projectedSaving`, `savedSoFar`) are authoritative; the prompt must tell the model to present them verbatim and never invent stock-up advice (mirror the `check_affordability` "report the verdict verbatim" rule). Copy must read as an **estimate** ("estimated saving"), never a promise.
- **i18n:** any new mobile string goes in ALL 9 locale files (`en/de/es/fr/pl/ru/ua/be/nl`).
- Commit messages ENGLISH. Tests: Jest for API (`npx jest <pattern>` from `apps/api/`); the mobile app has `npx tsc --noEmit` from `apps/mobile/`.
- **Known pre-existing test state:** `price-history.service` has 2 date-flaky `computeInflationIndex` failures unrelated to this branch — expect them, don't fix them.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/api/src/modules/insights/inflation-shield.service.ts` (modify) | `fxApproximate` reflects converted `savedSoFar` | 1 |
| `apps/api/src/modules/insights/inflation-shield.service.spec.ts` (modify) | fx-flag test | 1 |
| `apps/api/src/modules/expenses/expenses.service.ts` (modify) | Invalidate `shield:` cache on expense create | 2 |
| `apps/api/src/modules/expenses/expenses.service.spec.ts` (modify) | cache-invalidation test | 2 |
| `packages/shared-types/src/dto/ai.ts` (modify) | `ChatActionType += 'get_inflation_shield'` | 3 |
| `apps/api/src/modules/ai/services/ai-tools.service.ts` (modify) | inject service, tool schema, dispatcher, executor | 4 |
| `apps/api/src/modules/ai/services/prompt-builder.service.ts` (modify) | system-prompt instruction | 5 |
| `apps/mobile/src/components/chat/ActionResultCard.tsx` (modify) | `ShieldResult` case | 6 |
| `apps/mobile/src/i18n/locales/*.ts` (modify ×9) | `chat.actionInflationShield` | 6 |

---

### Task 1: `fxApproximate` reflects a converted `savedSoFar`

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield.service.ts` (the `savedSoFar` loop + the `result` assembly)
- Modify: `apps/api/src/modules/insights/inflation-shield.service.spec.ts`

**Interfaces:**
- No signature change; `InflationShieldResponse.fxApproximate` now also becomes `true` when any acted rec's realized saving required currency conversion.

- [ ] **Step 1: Write the failing test**

In `inflation-shield.service.spec.ts`, add a test. Reuse the `make()` helper but override the tracking mock so `getActedRecommendations` returns a rec in a DIFFERENT currency than the requested base, and provide a rate for it:

```ts
  it('sets fxApproximate when an acted recommendation is converted into the display currency', async () => {
    const priceHistory = { getProductTrends: jest.fn().mockResolvedValue([]) }; // no items → assembled.fxApproximate false
    const exchange = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 4 } }) }; // 1 USD = 4 PLN
    const safeToSpend = { compute: jest.fn().mockResolvedValue({ projectedAvailable: 1000 }) };
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    const tracking = {
      recordRecommendations: jest.fn().mockResolvedValue(undefined),
      getActedRecommendations: jest.fn().mockResolvedValue([{ realizedSaving: 8, currencyCode: 'PLN' }]),
    };
    const svc = new InflationShieldService(priceHistory as any, exchange as any, safeToSpend as any, cache as any, tracking as any);
    const res = await svc.getShield('a1', 'u1', 'USD', new Date('2026-07-16T00:00:00Z'));
    expect(res.fxApproximate).toBe(true);
    expect(res.savedSoFar).toBeCloseTo(2, 5); // 8 PLN / 4 = 2 USD
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.service -t "fxApproximate when an acted"`
Expected: FAIL — `fxApproximate` is `false` (only `assembled.fxApproximate` is currently used).

- [ ] **Step 3: Implement**

In `getShield`, in the `savedSoFar` accumulation loop, track whether any conversion happened, and OR it into the response's `fxApproximate`. Change the loop to set a local flag when a rec is converted:

```ts
    let savedSoFar = 0;
    let savedSoFarApprox = false;
    try {
      const acted = await this.tracking.getActedRecommendations(accountId);
      for (const a of acted) {
        if (a.currencyCode === baseCurrency) {
          savedSoFar += a.realizedSaving;
        } else if (rates && rates[a.currencyCode] > 0) {
          savedSoFar += a.realizedSaving / rates[a.currencyCode];
          savedSoFarApprox = true;
        }
        // unknown rate → skip (already excluded); mark approximate since a value was dropped
        else {
          savedSoFarApprox = true;
        }
      }
      savedSoFar = Math.round(savedSoFar * 100) / 100;
    } catch {
      savedSoFar = 0;
      savedSoFarApprox = false;
    }
```
Then in the `result` object, change `fxApproximate: assembled.fxApproximate,` to:
```ts
      fxApproximate: assembled.fxApproximate || savedSoFarApprox,
```
(If the current code differs slightly in structure, adapt — the invariant is: `fxApproximate` is true if EITHER the items or the savedSoFar sum required/dropped a conversion.)

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest inflation-shield.service`
Expected: PASS (the new test + existing service tests; the existing "sums acted recommendations" test uses PLN/PLN so its `fxApproximate` stays false).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.service.ts apps/api/src/modules/insights/inflation-shield.service.spec.ts
git commit -m "fix(insights): fxApproximate reflects a converted savedSoFar"
```

---

### Task 2: Invalidate the `shield:` cache on expense create

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts` (the post-create fire-and-forget block)
- Modify: `apps/api/src/modules/expenses/expenses.service.spec.ts`

**Interfaces:**
- No signature change; a new expense now busts the account's `shield:` cache so the next `getShield` recomputes (fresh trends + any just-reconciled saving).

- [ ] **Step 1: Write the failing test**

In `expenses.service.spec.ts`, extend the existing "fires inflation-shield reconcilePurchase" test setup (or add a sibling test using the same factory) to assert the shield cache is invalidated. The service already injects `cacheService` with a `delByPrefix` mock in the create factory. Add:

```ts
  it('invalidates the shield cache when a new expense is created', async () => {
    // ...reuse the same successful-create factory as the reconcile test...
    await service.create('a1', 'u1', validCreateDto);
    await new Promise((r) => setImmediate(r));
    expect(cacheService.delByPrefix).toHaveBeenCalledWith('shield:a1:');
  });
```
> NOTE: match the existing test's factory and its `cacheService` mock (it already mocks `delByPrefix`/`del` for `invalidateChatCache`). If `delByPrefix` isn't mocked in that factory, add `delByPrefix: jest.fn().mockResolvedValue(undefined)` to the `cacheService` mock.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest expenses.service -t "invalidates the shield cache"`
Expected: FAIL — `delByPrefix` not called with the shield prefix.

- [ ] **Step 3: Implement**

In `expenses.service.ts`, in the post-create block (the `if (result.isNew && result.expense) { … }` block, next to the `void this.shieldTracking?.reconcilePurchase(...)` call added in Plan 2), add:

```ts
    // A new expense changes the shield's inputs (new price point) and may have
    // just reconciled a recommendation — bust the cached shield so the next read
    // recomputes. Fire-and-forget; never blocks create.
    void this.cacheService.delByPrefix(`shield:${accountId}:`).catch(() => {});
```
(Confirm the injected cache field name — it is `cacheService` per the existing `invalidateChatCache` usage. Use the same field.)

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest expenses.service`
Expected: the new test PASSES, existing expenses tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/expenses/expenses.service.ts apps/api/src/modules/expenses/expenses.service.spec.ts
git commit -m "fix(expenses): bust shield cache on new expense (fresh savedSoFar)"
```

---

### Task 3: `ChatActionType += 'get_inflation_shield'`

**Files:**
- Modify: `packages/shared-types/src/dto/ai.ts`

**Interfaces:**
- Produces: the `'get_inflation_shield'` member (consumed by the tool schema, dispatcher, and card).

- [ ] **Step 1: Add the union member**

In `packages/shared-types/src/dto/ai.ts`, append to the `ChatActionType` union (after `'add_to_shopping_list'`):

```ts
  | 'get_inflation_shield';
```
(Move the trailing `;` to the new last line.)

- [ ] **Step 2: Typecheck**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/ai.ts
git commit -m "feat(shared-types): add get_inflation_shield chat action type"
```

---

### Task 4: `get_inflation_shield` tool — schema, dispatcher, executor

**Files:**
- Modify: `apps/api/src/modules/ai/services/ai-tools.service.ts`

**Interfaces:**
- Consumes: `InflationShieldService.getShield(accountId, userId, baseCurrency)` (already exported by `InsightsModule`).
- Produces: the `get_inflation_shield` tool definition + dispatcher case + `executeGetInflationShield`.

- [ ] **Step 1: Inject the service**

Add the import at the top: `import { InflationShieldService } from '../../insights/inflation-shield.service';`
Add to the constructor (after the existing `safeToSpendService` injection, mirroring it):
```ts
    private readonly inflationShieldService: InflationShieldService,
```

- [ ] **Step 2: Add the tool schema**

In `getToolDefinitions()`, append this tool (after the `add_to_shopping_list` tool, before the closing `];`):

```ts
      {
        type: 'function',
        function: {
          name: 'get_inflation_shield',
          description: 'Get the user\'s Inflation Shield: which of their regularly-bought products are rising in price and what to stock up on NOW to save money, plus how much the shield has saved them so far. Use when the user asks what to buy ahead / stock up on, what is getting more expensive, or how much they have saved by buying ahead. Read-only, no parameters.',
          parameters: { type: 'object', properties: {} },
        },
      },
```

- [ ] **Step 3: Add the dispatcher case**

In `executeAction`'s `switch (actionType)`, add (next to `get_debt_summary` / `check_affordability`):
```ts
        case 'get_inflation_shield':
          return await this.executeGetInflationShield(accountId, userId, baseCurrency);
```

- [ ] **Step 4: Add the executor**

Add the private method (near the other read executors, e.g. after `executeGetDebtSummary`):
```ts
  private async executeGetInflationShield(
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const shield = await this.inflationShieldService.getShield(accountId, userId, baseCurrency || 'USD');
    return { actionType: 'get_inflation_shield', success: true, data: shield as unknown as Record<string, unknown> };
  }
```
(`get_inflation_shield` is a READ action — do NOT add it to `isWriteAction`. The chat orchestrator routes non-write tools through `handleReadAction`, which caches via `executeWithCache` and narrates. The cache key already includes `baseCurrency`, so per-user display currency is respected.)

- [ ] **Step 5: Write/adjust the failing test**

There is an `ai-tools`-adjacent unit path via the executor. Add a focused test file `apps/api/src/modules/ai/services/ai-tools.shield.spec.ts`:
```ts
import { AiToolsService } from './ai-tools.service';

describe('AiToolsService get_inflation_shield', () => {
  it('executes the shield read and returns the response as the tool result', async () => {
    const shield = { getShield: jest.fn().mockResolvedValue({ items: [{ canonicalName: 'Masło' }], savedSoFar: 12, baseCurrency: 'PLN' }) };
    // Only inflationShieldService matters for this action; other deps unused → undefined.
    // Match the REAL constructor arity: read the current AiToolsService constructor and
    // place inflationShieldService in its position, padding the rest with `undefined as any`.
    const svc = new AiToolsService(
      /* ...pad earlier deps with `undefined as any` in the real order... */
      shield as any,
    );
    const res = await (svc as any).executeAction('get_inflation_shield', {}, 'a1', 'u1', 'PLN');
    expect(shield.getShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');
    expect(res.success).toBe(true);
    expect((res.data as any).savedSoFar).toBe(12);
  });
});
```
> NOTE: BEFORE writing Step 5, read the current `AiToolsService` constructor to get the exact parameter order/count; put `inflationShieldService` where you added it (Step 1) and pad the other constructor args with `undefined as any` so the arity matches. `executeAction` for a read action doesn't touch the other services, so `undefined` deps are safe here.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && npx jest ai-tools && npx tsc --noEmit`
Expected: the new test PASSES; tsc exit 0 (the union member from Task 3 makes the `actionType` literal valid).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/services/ai-tools.service.ts apps/api/src/modules/ai/services/ai-tools.shield.spec.ts
git commit -m "feat(ai): get_inflation_shield read tool"
```

---

### Task 5: System-prompt instruction

**Files:**
- Modify: `apps/api/src/modules/ai/services/prompt-builder.service.ts`

**Interfaces:**
- No code interface; adds a prompt line so the model knows when to call the tool and how to present it.

- [ ] **Step 1: Add the instruction**

In `buildStaticSystemPrefix` (the static system prompt), next to the `check_affordability` / `add_to_shopping_list` instructions, add:

```ts
When the user asks what to stock up on, what to buy ahead, which products are getting more expensive, or how much they have saved by buying ahead (e.g. "что купить впрок", "what should I stock up on", "co się drożeje"), call get_inflation_shield (no arguments). Present its numbers verbatim — the `monthlyChangePct`, the per-item `quantity`/`projectedSaving`, and `savedSoFar` are authoritative. Frame savings as an ESTIMATE (e.g. "you'd save about X"), never a guarantee, and never invent stock-up advice the tool did not return. If `items` is empty, say there is nothing worth stocking up on right now.
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/ai/services/prompt-builder.service.ts
git commit -m "feat(ai): prompt guidance for get_inflation_shield"
```

---

### Task 6: Mobile result card + i18n

**Files:**
- Modify: `apps/mobile/src/components/chat/ActionResultCard.tsx`
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: the `get_inflation_shield` tool result (`InflationShieldResponse` shape: `items[]`, `savedSoFar`, `baseCurrency`, `basketMonthlyForecastPct`).
- Produces: a `ShieldResult` card rendered when `actionResult.actionType === 'get_inflation_shield'`.

- [ ] **Step 1: Add the i18n key (all 9 locales)**

In each `apps/mobile/src/i18n/locales/<lang>.ts`, in the `chat` section next to `actionAddShoppingList`, add `actionInflationShield`:
- en: `actionInflationShield: 'Inflation Shield',`
- de: `actionInflationShield: 'Inflationsschutz',`
- es: `actionInflationShield: 'Escudo antiinflación',`
- fr: `actionInflationShield: 'Bouclier anti-inflation',`
- pl: `actionInflationShield: 'Tarcza antyinflacyjna',`
- ru: `actionInflationShield: 'Защита от инфляции',`
- ua: `actionInflationShield: 'Захист від інфляції',`
- be: `actionInflationShield: 'Абарона ад інфляцыі',`
- nl: `actionInflationShield: 'Inflatieschild',`

- [ ] **Step 2: Add the card case + component**

In `ActionResultCard.tsx`, add a case in the `switch (actionResult.actionType)`:
```tsx
    case 'get_inflation_shield':
      return <ShieldResult data={data} />;
```
And add the component (mirror `ShoppingAddResult`'s style — reuse the existing `styles`):
```tsx
function ShieldResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const items = (data.items as any[]) || [];
  const savedSoFar = Number(data.savedSoFar ?? 0);
  const baseCurrency = String(data.baseCurrency ?? '');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionInflationShield')}
          {savedSoFar > 0 ? ` · ${savedSoFar.toFixed(2)} ${baseCurrency}` : ''}
        </Text>
      </View>
      {items.slice(0, 5).map((it: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {it.canonicalName}{it.store ? ` · ${it.store}` : ''}
          </Text>
          <Text style={styles.listItemAmount}>
            +{Number(it.monthlyChangePct ?? 0).toFixed(0)}% · {Number(it.projectedSaving ?? 0).toFixed(2)} {baseCurrency}
          </Text>
        </View>
      ))}
      {items.length > 5 && <Text style={styles.moreText}>+{items.length - 5} more</Text>}
    </View>
  );
}
```

- [ ] **Step 3: Typecheck the mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0 (no errors introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/chat/ActionResultCard.tsx apps/mobile/src/i18n/locales
git commit -m "feat(mobile): Inflation Shield chat result card + i18n"
```

---

## Definition of Done (Plan 3)

- Asking the AI "what should I stock up on / what's getting more expensive / how much have I saved" calls `get_inflation_shield`, executes immediately (cached), and renders a `ShieldResult` card + a verbatim-numbers narration framed as an estimate.
- A new expense busts the `shield:` cache; `savedSoFar` FX conversion sets `fxApproximate`.
- No new module wiring; read-only, cross-platform (works on web chat too).

## Out of scope / Follow-ups (later plans)

- Home-screen **widget + full Shield screen + shareable card** (`app/inflation-shield/index.tsx`, `WidgetKey 'inflationShield'`).
- Shopping-list **"buy ahead" strip**.
- **Community-price boost** in `getShield` (region → cheapest store).
- **Proactive push** (`notifyInflationShield` + `NotificationType` + `notification-i18n` × 9 + `inflation-shield.cron.ts`).
