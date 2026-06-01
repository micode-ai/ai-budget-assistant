# Global Currency Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users change the app's base/display currency from any main tab via the existing `AccountSwitcher`, without adding header space.

**Architecture:** Currency change stays a persisted `user.currencyCode` update (same mechanism as Settings → Profile). The change is funneled through a new pure helper (`applyCurrencyChange`) wrapped by a new `authStore.setCurrency` action: optimistic local `updateUser` (which the `exchangeRateStore` subscription already watches to reload rates and recompute totals) + fire-and-forget `api.updateProfile`. `AccountSwitcher` gains a currency-symbol in its trigger pill and a "Display currency" chip section in its modal; `settings/profile.tsx` routes through the same action for DRY.

**Tech Stack:** Expo / React Native, Zustand, react-i18next, Jest (jest-expo), `@budget/shared-utils` (`getCurrencySymbol`, `SUPPORTED_CURRENCIES`).

**Reference spec:** `docs/superpowers/specs/2026-06-01-global-currency-switcher-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/utils/currency.ts` (create) | Pure `applyCurrencyChange(next, deps)` — the optimistic-then-persist decision, dependency-injected so it is testable without the store graph. |
| `apps/mobile/src/utils/__tests__/currency.test.ts` (create) | Unit tests for `applyCurrencyChange`. |
| `apps/mobile/src/stores/authStore.ts` (modify) | New `setCurrency(code)` action wrapping `applyCurrencyChange`. |
| `apps/mobile/src/i18n/locales/*.ts` (modify, 8 files) | New `accounts.displayCurrency` key. |
| `apps/mobile/src/i18n/locales/__tests__/accounts-displayCurrency.test.ts` (create) | i18n completeness test for the new key. |
| `apps/mobile/src/components/AccountSwitcher.tsx` (modify) | Trigger pill currency symbol; always-open modal; "Display currency" chip section calling `setCurrency`. |
| `apps/mobile/app/settings/profile.tsx` (modify) | Route currency change through `setCurrency` (DRY). |

---

## Task 1: Pure currency-change helper

**Files:**
- Create: `apps/mobile/src/utils/currency.ts`
- Test: `apps/mobile/src/utils/__tests__/currency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/currency.test.ts`:

```ts
import { applyCurrencyChange } from '../currency';

describe('applyCurrencyChange', () => {
  it('does nothing when the currency is unchanged', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyCurrencyChange('EUR', { currentCurrency: 'EUR', applyLocal, persist });
    expect(applyLocal).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('applies locally then persists when the currency changes', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyCurrencyChange('USD', { currentCurrency: 'EUR', applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith('USD');
    expect(persist).toHaveBeenCalledWith('USD');
  });

  it('does not throw and reports when persist rejects', async () => {
    const applyLocal = jest.fn();
    const error = new Error('offline');
    const persist = jest.fn().mockRejectedValue(error);
    const onPersistError = jest.fn();
    applyCurrencyChange('USD', {
      currentCurrency: 'EUR',
      applyLocal,
      persist,
      onPersistError,
    });
    expect(applyLocal).toHaveBeenCalledWith('USD');
    // let the rejected-promise microtask settle
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(error);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/utils/__tests__/currency.test.ts`
Expected: FAIL — `Cannot find module '../currency'`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/utils/currency.ts`:

```ts
import type { Currency } from '@budget/shared-types';

export interface CurrencyChangeDeps {
  /** The currently-active base currency (or undefined if none yet). */
  currentCurrency: string | undefined;
  /** Apply the change to local state immediately (optimistic). */
  applyLocal: (code: Currency) => void;
  /** Persist the change server-side. May reject (e.g. offline). */
  persist: (code: Currency) => Promise<unknown>;
  /** Optional handler for a failed persist; failure is non-fatal. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Changes the base/display currency: optimistic local update first (so the UI
 * and the exchangeRateStore subscription react instantly), then a
 * fire-and-forget server persist whose failure is non-fatal (works offline).
 * No-ops when the currency is unchanged.
 */
export function applyCurrencyChange(next: Currency, deps: CurrencyChangeDeps): void {
  if (!next || deps.currentCurrency === next) return;
  deps.applyLocal(next);
  deps.persist(next).catch((error) => deps.onPersistError?.(error));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/utils/__tests__/currency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/currency.ts apps/mobile/src/utils/__tests__/currency.test.ts
git commit -m "Add applyCurrencyChange helper for optimistic currency switching"
```

---

## Task 2: `setCurrency` action on authStore

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts` (interface near line 36; action near line 534)

- [ ] **Step 1: Add the import**

At the top of `apps/mobile/src/stores/authStore.ts`, after the existing `investmentRepo` import (line 16), add:

```ts
import { applyCurrencyChange } from '../utils/currency';
```

- [ ] **Step 2: Add the action to the `AuthState` interface**

In the `AuthState` interface, directly after `updateUser: (updates: Partial<User>) => void;` (line 36), add:

```ts
  setCurrency: (currencyCode: Currency) => void;
```

(`Currency` is already imported on line 4.)

- [ ] **Step 3: Implement the action**

In the store body, directly after the `updateUser` action (the block ending at line 541 with its closing `},`), add:

```ts
      setCurrency: (currencyCode: Currency) => {
        const { user, updateUser } = get();
        applyCurrencyChange(currencyCode, {
          currentCurrency: user?.currencyCode,
          applyLocal: (code) => updateUser({ currencyCode: code }),
          persist: (code) => api.updateProfile({ currencyCode: code }),
          onPersistError: (error) =>
            console.warn('Failed to persist currency change:', error),
        });
      },
```

- [ ] **Step 4: Verify it typechecks**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors referencing `authStore.ts` or `setCurrency`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "Add authStore.setCurrency action"
```

---

## Task 3: i18n key `accounts.displayCurrency` (8 locales) + completeness test

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`
- Test: `apps/mobile/src/i18n/locales/__tests__/accounts-displayCurrency.test.ts` (create)

- [ ] **Step 1: Write the failing completeness test**

Create `apps/mobile/src/i18n/locales/__tests__/accounts-displayCurrency.test.ts`:

```ts
import en from '../en';
import de from '../de';
import es from '../es';
import fr from '../fr';
import pl from '../pl';
import ru from '../ru';
import ua from '../ua';
import be from '../be';

const locales = { en, de, es, fr, pl, ru, ua, be } as const;

describe('accounts.displayCurrency i18n key', () => {
  for (const [name, loc] of Object.entries(locales)) {
    it(`${name}.accounts.displayCurrency is a non-empty string`, () => {
      const accounts = (loc as any).accounts;
      expect(accounts).toBeDefined();
      expect(typeof accounts.displayCurrency).toBe('string');
      expect(accounts.displayCurrency.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/i18n/locales/__tests__/accounts-displayCurrency.test.ts`
Expected: FAIL — `displayCurrency` is undefined in all 8 locales.

- [ ] **Step 3: Add the key to all 8 locale files**

In each file, inside the `accounts: {` object, add a `displayCurrency` line immediately after the `switchAccount:` line.

`en.ts`:
```ts
    displayCurrency: 'Display currency',
```
`de.ts`:
```ts
    displayCurrency: 'Anzeigewährung',
```
`es.ts`:
```ts
    displayCurrency: 'Moneda de visualización',
```
`fr.ts`:
```ts
    displayCurrency: "Devise d'affichage",
```
`pl.ts`:
```ts
    displayCurrency: 'Waluta wyświetlania',
```
`ru.ts`:
```ts
    displayCurrency: 'Валюта отображения',
```
`ua.ts`:
```ts
    displayCurrency: 'Валюта відображення',
```
`be.ts`:
```ts
    displayCurrency: 'Валюта адлюстравання',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/i18n/locales/__tests__/accounts-displayCurrency.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "Add accounts.displayCurrency i18n key in all 8 locales"
```

---

## Task 4: AccountSwitcher — currency symbol pill + currency chip section

**Files:**
- Modify: `apps/mobile/src/components/AccountSwitcher.tsx`

- [ ] **Step 1: Add imports**

After the existing `import type { AccountType } from '@budget/shared-types';` (line 19), add:

```ts
import type { Currency } from '@budget/shared-types';
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
```

- [ ] **Step 2: Read user currency + setCurrency in the component**

Inside `AccountSwitcher`, after the existing `const currentAccount = accounts.find((a) => a.id === currentAccountId);` (line 38), add:

```ts
  const user = useAuthStore((s) => s.user);
  const setCurrency = useAuthStore((s) => s.setCurrency);
  const currencyCode = (user?.currencyCode || 'USD') as Currency;
```

- [ ] **Step 3: Always open the modal on trigger press**

Replace the entire `handleTriggerPress` function (lines 49-56):

```ts
  const handleTriggerPress = () => {
    if (accounts.length <= 1) {
      // Single account — go directly to account management
      router.push('/account/list');
    } else {
      setVisible(true);
    }
  };
```

with:

```ts
  const handleTriggerPress = () => {
    // Always open the menu so the currency control is reachable even with a
    // single account. Account management is the "Manage accounts" button inside.
    setVisible(true);
  };
```

- [ ] **Step 4: Add the currency symbol to the trigger and always show the chevron**

Replace the trigger's inner content — the account-name `<Text>` and the conditional chevron (lines 66-71):

```tsx
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact]} numberOfLines={1}>
          {currentAccount?.name || t('accounts.personal')}
        </Text>
        {accounts.length > 1 && (
          <Ionicons name="chevron-down" size={compact ? 12 : 16} color={theme.colors.textInverse} />
        )}
```

with:

```tsx
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact]} numberOfLines={1}>
          {currentAccount?.name || t('accounts.personal')}
        </Text>
        <Text style={[styles.triggerCurrency, compact && styles.triggerTextCompact]}>
          {` · ${getCurrencySymbol(currencyCode)}`}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 12 : 16} color={theme.colors.textInverse} />
```

- [ ] **Step 5: Add the "Display currency" chip section to the modal**

In the modal, between the closing `</FlatList>` (line 120) and the `<TouchableOpacity style={styles.manageButton}` (line 122), insert:

```tsx
            <View style={styles.currencySection}>
              <Text style={styles.currencyTitle}>{t('accounts.displayCurrency')}</Text>
              <View style={styles.currencyChips}>
                {SUPPORTED_CURRENCIES.map((c) => {
                  const active = c.code === currencyCode;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.currencyChip, active && styles.currencyChipActive]}
                      onPress={() => {
                        setVisible(false);
                        setCurrency(c.code);
                      }}
                    >
                      <Text
                        style={[
                          styles.currencyChipText,
                          active && styles.currencyChipTextActive,
                        ]}
                      >
                        {c.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
```

- [ ] **Step 6: Add the new styles**

In `createStyles`, after the `triggerTextCompact` style (lines 162-164), add:

```ts
  triggerCurrency: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
    fontWeight: '700' as const,
  },
```

Then, after the `manageButtonText` style (the last entry, lines 229-232), add:

```ts
  currencySection: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    marginTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  currencyTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[2],
  },
  currencyChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '700' as const,
  },
```

- [ ] **Step 7: Verify it typechecks and lints**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/components/AccountSwitcher.tsx`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run: `cd apps/mobile && npx expo start --web` (or run on a device). Confirm:
- The header pill shows e.g. `Personal · $ ▾`; switching currency via the menu updates the symbol and all converted totals on the dashboard.
- The menu opens even with a single account; "Manage accounts" still navigates to `/account/list`.
- A long account name truncates with `…` while the currency symbol stays visible.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/components/AccountSwitcher.tsx
git commit -m "Add currency switcher to AccountSwitcher trigger and menu"
```

---

## Task 5: Route Profile screen through `setCurrency` (DRY)

**Files:**
- Modify: `apps/mobile/app/settings/profile.tsx:57` and `:90-98`

- [ ] **Step 1: Pull `setCurrency` from the store**

Replace line 57:

```ts
  const { user, updateUser } = useAuthStore();
```

with:

```ts
  const { user, updateUser, setCurrency } = useAuthStore();
```

- [ ] **Step 2: Simplify `handleCurrencyChange` to use the action**

Replace the whole `handleCurrencyChange` function (lines 90-98):

```ts
  const handleCurrencyChange = async (currency: Currency) => {
    if (currency === user?.currencyCode) return;
    try {
      await api.updateProfile({ currencyCode: currency });
      updateUser({ currencyCode: currency });
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };
```

with:

```ts
  const handleCurrencyChange = (currency: Currency) => {
    // setCurrency no-ops on an unchanged value, updates locally first, and
    // persists in the background (offline-tolerant; failures logged, not alerted).
    setCurrency(currency);
  };
```

(`updateUser` is still used by `handleSaveName`/`handleTimezoneChange`, and `api` by those handlers, so leave both imports.)

- [ ] **Step 3: Verify it typechecks and lints**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint app/settings/profile.tsx`
Expected: no errors. (If ESLint flags `updateUser` or `api` as unused, that means another handler stopped using them — re-check; both should remain used.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/profile.tsx
git commit -m "Route Profile currency change through authStore.setCurrency"
```

---

## Task 6: Final verification + documentation

**Files:**
- Modify: `CLAUDE.md`, `user_docs/<lang>/*` as needed (handled by the finish-aba-task skill)

- [ ] **Step 1: Run the full mobile test + typecheck suite**

Run: `cd apps/mobile && npx jest src/utils/__tests__/currency.test.ts src/i18n/locales/__tests__/accounts-displayCurrency.test.ts && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 2: Finish the task**

Invoke the `finish-aba-task` skill to create the `ABA-{N}` GitHub issue and update `CLAUDE.md` + `user_docs/` describing the global currency switcher embedded in `AccountSwitcher`.

---

## Self-Review Notes

- **Spec coverage:** trigger label (Task 4 Step 4) · combined menu with currency section (Task 4 Step 5) · accounts-first ordering (FlatList stays above the new section) · persist-base-currency semantics + offline warn (Tasks 1–2) · always-open menu (Task 4 Step 3) · viewer allowed (no `canEdit` gate added anywhere) · shared `setCurrency` used by Profile (Task 5) · i18n key (Task 3). All covered.
- **No placeholders:** every code/step is concrete.
- **Type consistency:** `applyCurrencyChange(next, deps)` and `CurrencyChangeDeps` are defined in Task 1 and consumed verbatim in Task 2; `setCurrency(currencyCode: Currency)` is declared in Task 2 and called in Tasks 4–5; `getCurrencySymbol` / `SUPPORTED_CURRENCIES` are existing exports.
