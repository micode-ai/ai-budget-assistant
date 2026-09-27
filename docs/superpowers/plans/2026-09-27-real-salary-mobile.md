# Real Salary — Mobile Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Real salary" screen in the Expo app (phone + web) on top of the merged API: hero number, breakdown, setup (confirm salary, last year's figure), settings (country, category → division), a percentages-only share card, and the Pro raise-brief PDF download.

**Architecture:** Thin API client methods; one data hook; pure display helpers (unit-tested); three routed screens under `app/real-salary/` with headers; a thin `RealSalaryShareCard` over the existing `ShareImageCard`; entry points on the Analytics tab (phone banner + desktop discovery card). No SQLite, no store: the screen is online-only and reads the API each visit.

**Tech Stack:** Expo 54 / React Native 0.81, expo-router, i18next (9 locales), Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-09-26-real-salary-design.md` (Mobile + Corrections sections). API facts: `docs/wiki/features/real-salary.md`.

## Global Constraints

- API (merged, ABA-608): `GET /insights/real-salary` → `RealSalaryResponse`; `GET /insights/real-salary/profile` → `RealSalaryProfileResponse`; `PUT /insights/real-salary/profile` body `SalaryProfileDto` (viewer → 403); `GET /insights/real-salary/categories` → `RealSalaryCategoryRow[]`; `PATCH /categories/:id` `{ coicopDivision }` (system category → 403); `PATCH /users/me` `{ inflationCountry: string | null }`; `POST /insights/real-salary/brief?lang=xx` → `application/pdf`, Pro (403 `TIER_REQUIRED`), 409 when not ready.
- Types come from `@budget/shared-types` (`RealSalaryResponse`, `RealSalaryStatus`, `CoicopDivision`, `SalaryCandidate`, `SalaryProfileDto`, `RealSalaryProfileResponse`, `RealSalaryCategoryRow`).
- `manualPreviousMonthly` is in the **salary's own currency** (`SalaryCandidate.currencyCode`), never the base currency.
- **The share card shows percentages only — never an amount.** No "show amounts" toggle.
- Every new screen has a header with a title and back (`Stack.Screen` in `app/_layout.tsx`, `headerShown: true`).
- Every new i18n key exists in all 9 locales: `en de es fr pl ru ua be nl`, in each language's real orthography.
- A bottom-anchored `Modal` sheet adds `insets.bottom` to its bottom padding (ABA-483).
- Viewers (`useAccountStore(s => s.canEdit())` false) see no write affordances (setup save, division edit); the API blocks them anyway.
- Nothing under `src/` imports from `app/`.
- Expected failures log `console.warn`, never `console.error`.
- Help: a NEW section `43-real-salary` registered in all three places (`scripts/generate-help-content.js`, `apps/mobile/src/help/sections.ts`, `docs/marketing/help/build_help.py`), then `npm run generate:help` and `python docs/marketing/help/build_help.py`. Never edit `apps/mobile/src/help/content.ts` by hand. On this Windows checkout regenerated outputs pick up CR-only churn in untouched sections — commit only the real changes (`git diff --ignore-cr-at-eol` must equal `git diff` in line count for the committed files).

## Review Focus

1. `status` other than `ready` → a specific, actionable empty state per status (setup CTA for `no_salary_confirmed`/`salary_history_short`, "keep tracking" for `spend_under_3_months`, country CTA for `no_inflation_source`, nothing for `encrypted` but an explanation) — never a blank or a `—%` hero. (Task 2 test `statusCopy covers every status`.)
2. `realChangePct === 0` / `requiredRaisePct <= 0` (the user is ahead) → neutral/positive tone and "you're ahead" copy, not "you need +0.0 %". (Task 2 tests for tone and required-raise copy.)
3. A foreign-currency salary candidate → the manual "last year" input shows and saves in that candidate's currency, not the base currency. (Task 2 test `manualCurrency uses the candidate currency`.)
4. Share payload never contains a digit sequence that looks like money — only `%` values. (Task 2 test `share lines carry percentages only`.)
5. Brief download on a free plan → the paywall, not an error alert; on 409 → "not ready yet" message. (Task 2 test `briefErrorKind` maps 403-TIER_REQUIRED / 409 / other.)

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/services/realSalary.api.ts` | API calls incl. the PDF blob download |
| Modify `apps/mobile/src/services/api.ts` | Spread `realSalaryApi` into `api` |
| Modify `apps/mobile/src/services/users.api.ts`, `categories.api.ts` | Add `inflationCountry` / `coicopDivision` to the update payload types |
| `apps/mobile/src/features/insights/realSalary.ts` | Pure display helpers |
| `apps/mobile/src/features/insights/__tests__/realSalary.test.ts` | Tests for the helpers |
| `apps/mobile/src/features/insights/useRealSalary.ts` | Data hook for the main screen |
| `apps/mobile/src/components/real-salary/RealSalaryShareCard.tsx` | Thin wrapper over `ShareImageCard` |
| `apps/mobile/src/components/real-salary/CountryPickerSheet.tsx` | Bottom-sheet country list |
| `apps/mobile/src/components/real-salary/DivisionPickerSheet.tsx` | Bottom-sheet division list |
| `apps/mobile/app/real-salary/index.tsx` | Main screen |
| `apps/mobile/app/real-salary/setup.tsx` | Confirm salary + last year's figure |
| `apps/mobile/app/real-salary/settings.tsx` | Country + category → division |
| Modify `apps/mobile/app/_layout.tsx` | Three `Stack.Screen` headers |
| Modify `apps/mobile/src/components/analytics/AnalyticsMobile.tsx`, `desktop/DiscoveryRow.tsx` | Entry points |
| Modify 9 locale files | `realSalary.*` keys |
| `user_docs/<lang>/43-real-salary.md` × 9 + the three registrations | Help |
| Modify `docs/wiki/features/real-salary.md`, `docs/wiki/log.md` | Mobile half |

---

### Task 1: API client

**Files:**
- Create: `apps/mobile/src/services/realSalary.api.ts`
- Modify: `apps/mobile/src/services/api.ts` (spread next to `...analyticsApi`)
- Modify: `apps/mobile/src/services/users.api.ts:16` (add `inflationCountry?: string | null` to `updateProfile`'s param type)
- Modify: `apps/mobile/src/services/categories.api.ts:26` (add `coicopDivision?: CoicopDivision | null` to `updateCategory`'s param type; `import type { CoicopDivision } from '@budget/shared-types'`)

**Interfaces — Produces** (on `api`):
```ts
getRealSalary(): Promise<RealSalaryResponse>;
getRealSalaryProfile(): Promise<RealSalaryProfileResponse>;
saveRealSalaryProfile(dto: SalaryProfileDto): Promise<SalaryProfileDto>;
getRealSalaryCategories(): Promise<RealSalaryCategoryRow[]>;
downloadRealSalaryBrief(lang: string): Promise<{ blob: Blob; fileName: string }>;  // throws an Error with .status and .code on failure
```

- [ ] **Step 1: Write `realSalary.api.ts`**

```ts
import type {
  RealSalaryCategoryRow, RealSalaryProfileResponse, RealSalaryResponse, SalaryProfileDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const realSalaryApi = {
  getRealSalary() {
    return httpClient.request<RealSalaryResponse>('/insights/real-salary');
  },
  getRealSalaryProfile() {
    return httpClient.request<RealSalaryProfileResponse>('/insights/real-salary/profile');
  },
  saveRealSalaryProfile(dto: SalaryProfileDto) {
    return httpClient.request<SalaryProfileDto>('/insights/real-salary/profile', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },
  getRealSalaryCategories() {
    return httpClient.request<RealSalaryCategoryRow[]>('/insights/real-salary/categories');
  },
  /**
   * The Pro raise brief. Raw fetch like `downloadBackupData` — httpClient.request
   * parses JSON, and this body is a PDF. On failure throws an Error carrying the
   * HTTP `status` and the API's `code` (e.g. TIER_REQUIRED) so the screen can
   * route a 403 to the paywall instead of an error alert.
   */
  async downloadRealSalaryBrief(lang: string): Promise<{ blob: Blob; fileName: string }> {
    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;
    const response = await fetch(
      `${httpClient.baseUrl}/insights/real-salary/brief?lang=${encodeURIComponent(lang)}`,
      { method: 'POST', headers },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({} as { message?: string; code?: string }));
      const err = new Error(body.message || `HTTP ${response.status}`) as Error & { status?: number; code?: string };
      err.status = response.status;
      err.code = body.code;
      throw err;
    }
    const fileName =
      response.headers.get('X-Report-Filename') || `real-salary-${new Date().toISOString().slice(0, 10)}.pdf`;
    return { blob: await response.blob(), fileName };
  },
};
```

In `api.ts`: `import { realSalaryApi } from './realSalary.api';` and add `...realSalaryApi,` in the `api` object next to `...analyticsApi,`.

- [ ] **Step 2: Typecheck** — Run (from `apps/mobile`): `npx tsc --noEmit` — Expected: exit 0.
- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/realSalary.api.ts apps/mobile/src/services/api.ts apps/mobile/src/services/users.api.ts apps/mobile/src/services/categories.api.ts
git commit -m "Add real-salary API client methods to the mobile app"
```

---

### Task 2: Pure display helpers

**Files:**
- Create: `apps/mobile/src/features/insights/realSalary.ts`
- Test: `apps/mobile/src/features/insights/__tests__/realSalary.test.ts`

**Interfaces — Produces:**
```ts
export const REAL_SALARY_COUNTRIES: readonly string[];            // Eurostat codes, Greece = EL
export function countryName(code: string, locale: string): string;  // Intl.DisplayNames with EL→GR, falls back to the code
export function formatSignedPct(x: number | null): string;          // "+5.0 %" style → '+5.0%', '−3.3%', '0.0%', '—'
export type Tone = 'positive' | 'negative' | 'neutral';
export function toneOf(realChangePct: number | null): Tone;
export type StatusCopy = { titleKey: string; bodyKey: string; action: 'setup' | 'settings' | null };
export function statusCopy(status: RealSalaryStatus): StatusCopy | null;   // null for 'ready'
export function requiredRaiseKey(requiredRaisePct: number | null): 'realSalary.requiredRaise' | 'realSalary.ahead';
export function manualCurrency(candidates: SalaryCandidate[], salaryKey: string | null): string | null;
export interface ShareLine { emoji: string; label: string; value: string }
export function buildShareLines(data: RealSalaryResponse, t: (k: string) => string): ShareLine[];
export function briefErrorKind(e: unknown): 'paywall' | 'not_ready' | 'failed';
```

- [ ] **Step 1: Write the failing test**

```ts
import type { RealSalaryResponse, SalaryCandidate } from '@budget/shared-types';
import {
  REAL_SALARY_COUNTRIES, countryName, formatSignedPct, toneOf, statusCopy, requiredRaiseKey,
  manualCurrency, buildShareLines, briefErrorKind,
} from '../realSalary';

const READY: RealSalaryResponse = {
  status: 'ready', baseCurrency: 'PLN', country: 'PL', countryGuessed: true, dataMonth: '2026-08',
  nominalChangePct: 5, personalInflationPct: 8.3, realChangePct: -3, requiredRaisePct: 3.1,
  breakdown: [{ division: 'CP01', weight: 0.4, ratePct: 8.3, source: 'receipts' }],
  topDrivers: ['CP01'], fxApproximate: false, computedAt: '2026-09-27T10:00:00.000Z',
};
const t = (k: string) => k;

describe('formatSignedPct', () => {
  it('signs and rounds to one decimal', () => {
    expect(formatSignedPct(5)).toBe('+5.0%');
    expect(formatSignedPct(-3.26)).toBe('−3.3%');
    expect(formatSignedPct(0)).toBe('0.0%');
    expect(formatSignedPct(-0)).toBe('0.0%');
    expect(formatSignedPct(null)).toBe('—');
  });
});

describe('toneOf', () => {
  it('maps the real change to a tone', () => {
    expect(toneOf(-3)).toBe('negative');
    expect(toneOf(2)).toBe('positive');
    expect(toneOf(0)).toBe('neutral');
    expect(toneOf(null)).toBe('neutral');
  });
});

describe('statusCopy covers every status', () => {
  it('returns null for ready and an actionable copy for the rest', () => {
    expect(statusCopy('ready')).toBeNull();
    expect(statusCopy('no_salary_confirmed')).toEqual({
      titleKey: 'realSalary.status.noSalaryTitle', bodyKey: 'realSalary.status.noSalaryBody', action: 'setup',
    });
    expect(statusCopy('salary_history_short')).toEqual({
      titleKey: 'realSalary.status.historyShortTitle', bodyKey: 'realSalary.status.historyShortBody', action: 'setup',
    });
    expect(statusCopy('spend_under_3_months')).toEqual({
      titleKey: 'realSalary.status.spendShortTitle', bodyKey: 'realSalary.status.spendShortBody', action: null,
    });
    expect(statusCopy('no_inflation_source')).toEqual({
      titleKey: 'realSalary.status.noSourceTitle', bodyKey: 'realSalary.status.noSourceBody', action: 'settings',
    });
    expect(statusCopy('encrypted')).toEqual({
      titleKey: 'realSalary.status.encryptedTitle', bodyKey: 'realSalary.status.encryptedBody', action: null,
    });
  });
});

describe('requiredRaiseKey', () => {
  it('says "ahead" when no raise is needed', () => {
    expect(requiredRaiseKey(3.1)).toBe('realSalary.requiredRaise');
    expect(requiredRaiseKey(0)).toBe('realSalary.ahead');
    expect(requiredRaiseKey(-2)).toBe('realSalary.ahead');
    expect(requiredRaiseKey(null)).toBe('realSalary.ahead');
  });
});

describe('manualCurrency uses the candidate currency', () => {
  const c = (key: string, currencyCode: string): SalaryCandidate => ({
    key, categoryId: null, categoryName: null, descriptionKey: 'x', currencyCode, typicalAmount: 1, occurrences: 2,
  });
  it('returns the chosen candidate currency, else the key suffix, else null', () => {
    expect(manualCurrency([c('a|x|EUR', 'EUR')], 'a|x|EUR')).toBe('EUR');
    expect(manualCurrency([], 'a|x|CHF')).toBe('CHF');
    expect(manualCurrency([], null)).toBeNull();
  });
});

describe('share lines carry percentages only', () => {
  it('has three lines and no money-looking value', () => {
    const lines = buildShareLines(READY, t);
    expect(lines.map((l) => l.value)).toEqual(['−3.0%', '+5.0%', '+8.3%']);
    for (const l of lines) expect(l.value).toMatch(/^[+−]?\d+\.\d%$/);
  });
});

describe('briefErrorKind', () => {
  it('maps API failures', () => {
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 403, code: 'TIER_REQUIRED' }))).toBe('paywall');
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 409 }))).toBe('not_ready');
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 500 }))).toBe('failed');
    expect(briefErrorKind('nope')).toBe('failed');
  });
});

describe('countries', () => {
  it('lists Eurostat countries with Greece as EL and names them', () => {
    expect(REAL_SALARY_COUNTRIES).toContain('PL');
    expect(REAL_SALARY_COUNTRIES).toContain('EL');
    expect(REAL_SALARY_COUNTRIES).not.toContain('GR');
    expect(countryName('XX', 'en')).toBe('XX');
    expect(typeof countryName('EL', 'en')).toBe('string');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd apps/mobile && npx jest src/features/insights/__tests__/realSalary.test.ts` — Expected: FAIL, `Cannot find module '../realSalary'`.

- [ ] **Step 3: Implement**

```ts
import type { RealSalaryResponse, RealSalaryStatus, SalaryCandidate } from '@budget/shared-types';

/** Same list as the API's EUROSTAT_COUNTRIES (Greece is EL in Eurostat). */
export const REAL_SALARY_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'NO', 'CH',
];

/** Intl names where the runtime has them (web, recent Hermes); the code otherwise. */
export function countryName(code: string, locale: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of(c: string): string | undefined } }).DisplayNames;
    if (!DN) return code;
    const name = new DN([locale], { type: 'region' }).of(code === 'EL' ? 'GR' : code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

export function formatSignedPct(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return '—';
  const r = Math.round(x * 10) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`;
}

export type Tone = 'positive' | 'negative' | 'neutral';

export function toneOf(realChangePct: number | null): Tone {
  if (realChangePct === null || Math.round(realChangePct * 10) === 0) return 'neutral';
  return realChangePct > 0 ? 'positive' : 'negative';
}

export type StatusCopy = { titleKey: string; bodyKey: string; action: 'setup' | 'settings' | null };

const STATUS_COPY: Record<Exclude<RealSalaryStatus, 'ready'>, StatusCopy> = {
  no_salary_confirmed: { titleKey: 'realSalary.status.noSalaryTitle', bodyKey: 'realSalary.status.noSalaryBody', action: 'setup' },
  salary_history_short: { titleKey: 'realSalary.status.historyShortTitle', bodyKey: 'realSalary.status.historyShortBody', action: 'setup' },
  spend_under_3_months: { titleKey: 'realSalary.status.spendShortTitle', bodyKey: 'realSalary.status.spendShortBody', action: null },
  no_inflation_source: { titleKey: 'realSalary.status.noSourceTitle', bodyKey: 'realSalary.status.noSourceBody', action: 'settings' },
  encrypted: { titleKey: 'realSalary.status.encryptedTitle', bodyKey: 'realSalary.status.encryptedBody', action: null },
};

export function statusCopy(status: RealSalaryStatus): StatusCopy | null {
  return status === 'ready' ? null : STATUS_COPY[status];
}

export function requiredRaiseKey(requiredRaisePct: number | null): 'realSalary.requiredRaise' | 'realSalary.ahead' {
  return requiredRaisePct !== null && Math.round(requiredRaisePct * 10) > 0 ? 'realSalary.requiredRaise' : 'realSalary.ahead';
}

/** "Last year's salary" is in the salary's own currency — the key's third segment. */
export function manualCurrency(candidates: SalaryCandidate[], salaryKey: string | null): string | null {
  if (!salaryKey) return null;
  const hit = candidates.find((c) => c.key === salaryKey);
  if (hit) return hit.currencyCode;
  const suffix = salaryKey.split('|')[2];
  return suffix && /^[A-Z]{3}$/.test(suffix) ? suffix : null;
}

export interface ShareLine {
  emoji: string;
  label: string;
  value: string;
}

/** Percentages only — salary is the most sensitive number in the app. */
export function buildShareLines(data: RealSalaryResponse, t: (k: string) => string): ShareLine[] {
  return [
    { emoji: '💶', label: t('realSalary.share.real'), value: formatSignedPct(data.realChangePct) },
    { emoji: '📈', label: t('realSalary.share.pay'), value: formatSignedPct(data.nominalChangePct) },
    { emoji: '🛒', label: t('realSalary.share.inflation'), value: formatSignedPct(data.personalInflationPct) },
  ];
}

export function briefErrorKind(e: unknown): 'paywall' | 'not_ready' | 'failed' {
  const err = e as { status?: number; code?: string } | null;
  if (!err || typeof err !== 'object') return 'failed';
  if (err.status === 403 && err.code === 'TIER_REQUIRED') return 'paywall';
  if (err.status === 409) return 'not_ready';
  return 'failed';
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS (all cases).
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/insights/realSalary.ts apps/mobile/src/features/insights/__tests__/realSalary.test.ts
git commit -m "Add pure display helpers for the real-salary screen"
```

---

### Task 3: i18n — `realSalary` namespace in all 9 locales

**Files:** Modify `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts` — add a top-level `realSalary` object (place it right after the `wrapped` object).

Use the `i18n-add-strings` skill. Values (`{{x}}` = interpolation):

`en`:
```ts
  realSalary: {
    title: 'Real salary',
    entryTitle: 'Real salary',
    entrySub: 'Your pay vs your own inflation',
    heroLabel: 'Real pay change, 12 months',
    pay: 'Pay change',
    inflation: 'Your inflation',
    requiredRaise: 'Raise needed to keep up: {{value}}',
    ahead: "You're ahead of your inflation",
    breakdownTitle: 'Where prices rose for you',
    sourceReceipts: 'your receipts',
    sourceOfficial: 'official data',
    dataMonth: 'Official data: {{month}}',
    receiptsOnly: 'Based on your receipts only — no official data for your country.',
    fxApproximate: 'Some amounts in other currencies were left out.',
    share: { title: 'My real salary', real: 'Real pay', pay: 'Pay', inflation: 'My inflation', footer: 'AI Budget' },
    shareAction: 'Share',
    brief: 'Raise brief (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'The brief is available once your real salary is calculated.',
    briefFailed: 'Could not create the PDF. Try again later.',
    settings: 'Settings',
    setupAction: 'Set up salary',
    settingsAction: 'Choose country',
    disclaimer: 'An estimate from your own spending and public price statistics — not financial advice.',
    status: {
      noSalaryTitle: 'Confirm your salary',
      noSalaryBody: 'Pick the income that is your salary so we can compare it with your inflation.',
      historyShortTitle: 'Tell us last year’s salary',
      historyShortBody: 'The app does not have a full year of your salary yet. Enter what you earned a year ago.',
      spendShortTitle: 'Keep tracking a little longer',
      spendShortBody: 'We need at least 3 months of expenses to know what you spend on.',
      noSourceTitle: 'No price data for your country',
      noSourceBody: 'Choose your country, or scan more receipts — your own prices can stand in for food.',
      encryptedTitle: 'Not available with full encryption',
      encryptedBody: 'Amounts in this account are encrypted on your device, so the server cannot calculate this.',
    },
    setup: {
      title: 'Your salary',
      pick: 'Which of these is your salary?',
      none: 'No regular monthly income found in the last 3 months. Add your salary as income first.',
      times: '{{count}}× in 3 months',
      previousLabel: 'Monthly salary a year ago ({{currency}})',
      previousHint: 'Only needed while the app has less than a year of your salary.',
      save: 'Save',
      saved: 'Saved',
      invalid: 'Enter a positive amount.',
    },
    config: {
      title: 'Real salary settings',
      country: 'Country for official prices',
      countryGuessed: '{{country}} (from your time zone)',
      countryNone: 'Not set',
      categories: 'What each category counts as',
      categoriesHint: 'Used to match your spending with official price groups.',
      auto: 'Automatic',
      pickCountry: 'Choose a country',
      pickDivision: 'Choose a price group',
      clearCountry: 'Use my time zone',
    },
    division: {
      TOTAL: 'Everything else', CP01: 'Food and drinks', CP02: 'Alcohol and tobacco', CP03: 'Clothing and footwear',
      CP04: 'Housing and utilities', CP05: 'Home and furnishings', CP06: 'Health', CP07: 'Transport',
      CP08: 'Phone and internet', CP09: 'Recreation and culture', CP10: 'Education', CP11: 'Restaurants and hotels',
      CP12: 'Insurance and finance', CP13: 'Personal care and other',
    },
  },
```

`pl`:
```ts
  realSalary: {
    title: 'Realna pensja',
    entryTitle: 'Realna pensja',
    entrySub: 'Twoja pensja a Twoja własna inflacja',
    heroLabel: 'Realna zmiana pensji, 12 mies.',
    pay: 'Zmiana pensji',
    inflation: 'Twoja inflacja',
    requiredRaise: 'Podwyżka potrzebna, by nie tracić: {{value}}',
    ahead: 'Wyprzedzasz swoją inflację',
    breakdownTitle: 'Gdzie ceny wzrosły u Ciebie',
    sourceReceipts: 'Twoje paragony',
    sourceOfficial: 'dane oficjalne',
    dataMonth: 'Dane oficjalne: {{month}}',
    receiptsOnly: 'Tylko na podstawie Twoich paragonów — brak danych oficjalnych dla Twojego kraju.',
    fxApproximate: 'Część kwot w innych walutach pominięto.',
    share: { title: 'Moja realna pensja', real: 'Realna pensja', pay: 'Pensja', inflation: 'Moja inflacja', footer: 'AI Budget' },
    shareAction: 'Udostępnij',
    brief: 'Argumenty do podwyżki (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Dokument będzie dostępny, gdy realna pensja zostanie obliczona.',
    briefFailed: 'Nie udało się utworzyć PDF. Spróbuj później.',
    settings: 'Ustawienia',
    setupAction: 'Ustaw pensję',
    settingsAction: 'Wybierz kraj',
    disclaimer: 'Szacunek na podstawie Twoich wydatków i publicznych statystyk cen — nie jest to porada finansowa.',
    status: {
      noSalaryTitle: 'Potwierdź swoją pensję',
      noSalaryBody: 'Wybierz przychód, który jest Twoją pensją, abyśmy mogli porównać go z Twoją inflacją.',
      historyShortTitle: 'Podaj pensję sprzed roku',
      historyShortBody: 'Aplikacja nie ma jeszcze pełnego roku Twojej pensji. Wpisz, ile zarabiałeś rok temu.',
      spendShortTitle: 'Śledź wydatki jeszcze trochę',
      spendShortBody: 'Potrzebujemy co najmniej 3 miesięcy wydatków, by wiedzieć, na co wydajesz.',
      noSourceTitle: 'Brak danych o cenach dla Twojego kraju',
      noSourceBody: 'Wybierz kraj albo skanuj więcej paragonów — Twoje ceny mogą zastąpić dane o żywności.',
      encryptedTitle: 'Niedostępne przy pełnym szyfrowaniu',
      encryptedBody: 'Kwoty w tym koncie są szyfrowane na Twoim urządzeniu, więc serwer nie może tego obliczyć.',
    },
    setup: {
      title: 'Twoja pensja',
      pick: 'Który z tych przychodów to Twoja pensja?',
      none: 'Nie znaleziono regularnego miesięcznego przychodu w ostatnich 3 miesiącach. Najpierw dodaj pensję jako przychód.',
      times: '{{count}}× w 3 miesiące',
      previousLabel: 'Miesięczna pensja rok temu ({{currency}})',
      previousHint: 'Potrzebne tylko, dopóki aplikacja ma mniej niż rok Twojej pensji.',
      save: 'Zapisz',
      saved: 'Zapisano',
      invalid: 'Wpisz kwotę większą od zera.',
    },
    config: {
      title: 'Ustawienia realnej pensji',
      country: 'Kraj dla oficjalnych cen',
      countryGuessed: '{{country}} (z Twojej strefy czasowej)',
      countryNone: 'Nie ustawiono',
      categories: 'Czym jest każda kategoria',
      categoriesHint: 'Służy do dopasowania wydatków do oficjalnych grup cen.',
      auto: 'Automatycznie',
      pickCountry: 'Wybierz kraj',
      pickDivision: 'Wybierz grupę cen',
      clearCountry: 'Użyj mojej strefy czasowej',
    },
    division: {
      TOTAL: 'Pozostałe', CP01: 'Żywność i napoje', CP02: 'Alkohol i tytoń', CP03: 'Odzież i obuwie',
      CP04: 'Mieszkanie i media', CP05: 'Wyposażenie domu', CP06: 'Zdrowie', CP07: 'Transport',
      CP08: 'Telefon i internet', CP09: 'Rekreacja i kultura', CP10: 'Edukacja', CP11: 'Restauracje i hotele',
      CP12: 'Ubezpieczenia i finanse', CP13: 'Higiena osobista i inne',
    },
  },
```

`de`:
```ts
  realSalary: {
    title: 'Reallohn',
    entryTitle: 'Reallohn',
    entrySub: 'Dein Gehalt im Vergleich zu deiner eigenen Inflation',
    heroLabel: 'Reale Gehaltsänderung, 12 Monate',
    pay: 'Gehaltsänderung',
    inflation: 'Deine Inflation',
    requiredRaise: 'Nötige Erhöhung, um mitzuhalten: {{value}}',
    ahead: 'Du liegst vor deiner Inflation',
    breakdownTitle: 'Wo die Preise für dich gestiegen sind',
    sourceReceipts: 'deine Belege',
    sourceOfficial: 'amtliche Daten',
    dataMonth: 'Amtliche Daten: {{month}}',
    receiptsOnly: 'Nur auf Basis deiner Belege – keine amtlichen Daten für dein Land.',
    fxApproximate: 'Einige Beträge in anderen Währungen wurden ausgelassen.',
    share: { title: 'Mein Reallohn', real: 'Reallohn', pay: 'Gehalt', inflation: 'Meine Inflation', footer: 'AI Budget' },
    shareAction: 'Teilen',
    brief: 'Argumente für die Gehaltserhöhung (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Das Dokument ist verfügbar, sobald dein Reallohn berechnet ist.',
    briefFailed: 'Das PDF konnte nicht erstellt werden. Versuche es später erneut.',
    settings: 'Einstellungen',
    setupAction: 'Gehalt festlegen',
    settingsAction: 'Land wählen',
    disclaimer: 'Eine Schätzung aus deinen Ausgaben und öffentlichen Preisstatistiken – keine Finanzberatung.',
    status: {
      noSalaryTitle: 'Bestätige dein Gehalt',
      noSalaryBody: 'Wähle die Einnahme, die dein Gehalt ist, damit wir sie mit deiner Inflation vergleichen können.',
      historyShortTitle: 'Nenne dein Gehalt vor einem Jahr',
      historyShortBody: 'Die App hat noch kein volles Jahr deines Gehalts. Gib an, was du vor einem Jahr verdient hast.',
      spendShortTitle: 'Erfasse noch etwas länger',
      spendShortBody: 'Wir brauchen mindestens 3 Monate Ausgaben, um zu wissen, wofür du Geld ausgibst.',
      noSourceTitle: 'Keine Preisdaten für dein Land',
      noSourceBody: 'Wähle dein Land oder scanne mehr Belege – deine eigenen Preise können Lebensmittel abdecken.',
      encryptedTitle: 'Bei vollständiger Verschlüsselung nicht verfügbar',
      encryptedBody: 'Beträge in diesem Konto sind auf deinem Gerät verschlüsselt, daher kann der Server das nicht berechnen.',
    },
    setup: {
      title: 'Dein Gehalt',
      pick: 'Welche davon ist dein Gehalt?',
      none: 'In den letzten 3 Monaten wurde keine regelmäßige monatliche Einnahme gefunden. Erfasse dein Gehalt zuerst als Einnahme.',
      times: '{{count}}× in 3 Monaten',
      previousLabel: 'Monatsgehalt vor einem Jahr ({{currency}})',
      previousHint: 'Nur nötig, solange die App weniger als ein Jahr deines Gehalts kennt.',
      save: 'Speichern',
      saved: 'Gespeichert',
      invalid: 'Gib einen Betrag größer als null ein.',
    },
    config: {
      title: 'Reallohn-Einstellungen',
      country: 'Land für amtliche Preise',
      countryGuessed: '{{country}} (aus deiner Zeitzone)',
      countryNone: 'Nicht festgelegt',
      categories: 'Wozu jede Kategorie zählt',
      categoriesHint: 'Damit deine Ausgaben den amtlichen Preisgruppen zugeordnet werden.',
      auto: 'Automatisch',
      pickCountry: 'Land wählen',
      pickDivision: 'Preisgruppe wählen',
      clearCountry: 'Meine Zeitzone verwenden',
    },
    division: {
      TOTAL: 'Sonstiges', CP01: 'Lebensmittel und Getränke', CP02: 'Alkohol und Tabak', CP03: 'Bekleidung und Schuhe',
      CP04: 'Wohnen und Energie', CP05: 'Haushalt und Einrichtung', CP06: 'Gesundheit', CP07: 'Verkehr',
      CP08: 'Telefon und Internet', CP09: 'Freizeit und Kultur', CP10: 'Bildung', CP11: 'Restaurants und Hotels',
      CP12: 'Versicherungen und Finanzen', CP13: 'Körperpflege und Sonstiges',
    },
  },
```

`es`:
```ts
  realSalary: {
    title: 'Salario real',
    entryTitle: 'Salario real',
    entrySub: 'Tu sueldo frente a tu propia inflación',
    heroLabel: 'Cambio real del sueldo, 12 meses',
    pay: 'Cambio de sueldo',
    inflation: 'Tu inflación',
    requiredRaise: 'Subida necesaria para no perder: {{value}}',
    ahead: 'Vas por delante de tu inflación',
    breakdownTitle: 'Dónde subieron tus precios',
    sourceReceipts: 'tus recibos',
    sourceOfficial: 'datos oficiales',
    dataMonth: 'Datos oficiales: {{month}}',
    receiptsOnly: 'Solo con tus recibos: no hay datos oficiales para tu país.',
    fxApproximate: 'Se omitieron algunos importes en otras monedas.',
    share: { title: 'Mi salario real', real: 'Salario real', pay: 'Sueldo', inflation: 'Mi inflación', footer: 'AI Budget' },
    shareAction: 'Compartir',
    brief: 'Argumentos para una subida (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'El documento estará disponible cuando se calcule tu salario real.',
    briefFailed: 'No se pudo crear el PDF. Inténtalo más tarde.',
    settings: 'Ajustes',
    setupAction: 'Indicar sueldo',
    settingsAction: 'Elegir país',
    disclaimer: 'Una estimación a partir de tus gastos y estadísticas públicas de precios; no es asesoramiento financiero.',
    status: {
      noSalaryTitle: 'Confirma tu sueldo',
      noSalaryBody: 'Elige el ingreso que es tu sueldo para compararlo con tu inflación.',
      historyShortTitle: 'Indica tu sueldo de hace un año',
      historyShortBody: 'La app aún no tiene un año completo de tu sueldo. Introduce lo que ganabas hace un año.',
      spendShortTitle: 'Sigue registrando un poco más',
      spendShortBody: 'Necesitamos al menos 3 meses de gastos para saber en qué gastas.',
      noSourceTitle: 'No hay datos de precios para tu país',
      noSourceBody: 'Elige tu país o escanea más recibos: tus propios precios pueden sustituir a los de alimentación.',
      encryptedTitle: 'No disponible con cifrado completo',
      encryptedBody: 'Los importes de esta cuenta se cifran en tu dispositivo, así que el servidor no puede calcularlo.',
    },
    setup: {
      title: 'Tu sueldo',
      pick: '¿Cuál de estos es tu sueldo?',
      none: 'No se encontró ningún ingreso mensual regular en los últimos 3 meses. Añade primero tu sueldo como ingreso.',
      times: '{{count}}× en 3 meses',
      previousLabel: 'Sueldo mensual hace un año ({{currency}})',
      previousHint: 'Solo hace falta mientras la app tenga menos de un año de tu sueldo.',
      save: 'Guardar',
      saved: 'Guardado',
      invalid: 'Introduce un importe mayor que cero.',
    },
    config: {
      title: 'Ajustes del salario real',
      country: 'País para los precios oficiales',
      countryGuessed: '{{country}} (según tu zona horaria)',
      countryNone: 'Sin definir',
      categories: 'A qué corresponde cada categoría',
      categoriesHint: 'Sirve para relacionar tus gastos con los grupos oficiales de precios.',
      auto: 'Automático',
      pickCountry: 'Elige un país',
      pickDivision: 'Elige un grupo de precios',
      clearCountry: 'Usar mi zona horaria',
    },
    division: {
      TOTAL: 'Otros', CP01: 'Alimentos y bebidas', CP02: 'Alcohol y tabaco', CP03: 'Ropa y calzado',
      CP04: 'Vivienda y suministros', CP05: 'Hogar y muebles', CP06: 'Salud', CP07: 'Transporte',
      CP08: 'Teléfono e internet', CP09: 'Ocio y cultura', CP10: 'Educación', CP11: 'Restaurantes y hoteles',
      CP12: 'Seguros y finanzas', CP13: 'Cuidado personal y otros',
    },
  },
```

`fr`:
```ts
  realSalary: {
    title: 'Salaire réel',
    entryTitle: 'Salaire réel',
    entrySub: 'Votre salaire face à votre propre inflation',
    heroLabel: 'Évolution réelle du salaire, 12 mois',
    pay: 'Évolution du salaire',
    inflation: 'Votre inflation',
    requiredRaise: 'Augmentation nécessaire pour suivre : {{value}}',
    ahead: 'Vous devancez votre inflation',
    breakdownTitle: 'Où vos prix ont augmenté',
    sourceReceipts: 'vos tickets',
    sourceOfficial: 'données officielles',
    dataMonth: 'Données officielles : {{month}}',
    receiptsOnly: 'Uniquement à partir de vos tickets — aucune donnée officielle pour votre pays.',
    fxApproximate: 'Certains montants dans d’autres devises ont été exclus.',
    share: { title: 'Mon salaire réel', real: 'Salaire réel', pay: 'Salaire', inflation: 'Mon inflation', footer: 'AI Budget' },
    shareAction: 'Partager',
    brief: 'Arguments pour une augmentation (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Le document sera disponible une fois votre salaire réel calculé.',
    briefFailed: 'Impossible de créer le PDF. Réessayez plus tard.',
    settings: 'Réglages',
    setupAction: 'Indiquer le salaire',
    settingsAction: 'Choisir le pays',
    disclaimer: 'Une estimation à partir de vos dépenses et de statistiques publiques de prix — pas un conseil financier.',
    status: {
      noSalaryTitle: 'Confirmez votre salaire',
      noSalaryBody: 'Choisissez le revenu qui correspond à votre salaire pour le comparer à votre inflation.',
      historyShortTitle: 'Indiquez votre salaire d’il y a un an',
      historyShortBody: 'L’app n’a pas encore une année complète de votre salaire. Saisissez ce que vous gagniez il y a un an.',
      spendShortTitle: 'Continuez encore un peu',
      spendShortBody: 'Il faut au moins 3 mois de dépenses pour savoir à quoi vous dépensez.',
      noSourceTitle: 'Aucune donnée de prix pour votre pays',
      noSourceBody: 'Choisissez votre pays ou scannez plus de tickets — vos propres prix peuvent remplacer ceux de l’alimentation.',
      encryptedTitle: 'Indisponible avec le chiffrement complet',
      encryptedBody: 'Les montants de ce compte sont chiffrés sur votre appareil, le serveur ne peut donc pas faire ce calcul.',
    },
    setup: {
      title: 'Votre salaire',
      pick: 'Lequel de ces revenus est votre salaire ?',
      none: 'Aucun revenu mensuel régulier trouvé ces 3 derniers mois. Ajoutez d’abord votre salaire comme revenu.',
      times: '{{count}}× en 3 mois',
      previousLabel: 'Salaire mensuel il y a un an ({{currency}})',
      previousHint: 'Utile seulement tant que l’app a moins d’un an de votre salaire.',
      save: 'Enregistrer',
      saved: 'Enregistré',
      invalid: 'Saisissez un montant supérieur à zéro.',
    },
    config: {
      title: 'Réglages du salaire réel',
      country: 'Pays pour les prix officiels',
      countryGuessed: '{{country}} (d’après votre fuseau horaire)',
      countryNone: 'Non défini',
      categories: 'À quoi correspond chaque catégorie',
      categoriesHint: 'Sert à rapprocher vos dépenses des groupes de prix officiels.',
      auto: 'Automatique',
      pickCountry: 'Choisir un pays',
      pickDivision: 'Choisir un groupe de prix',
      clearCountry: 'Utiliser mon fuseau horaire',
    },
    division: {
      TOTAL: 'Autres', CP01: 'Alimentation et boissons', CP02: 'Alcool et tabac', CP03: 'Habillement et chaussures',
      CP04: 'Logement et énergie', CP05: 'Maison et ameublement', CP06: 'Santé', CP07: 'Transports',
      CP08: 'Téléphone et internet', CP09: 'Loisirs et culture', CP10: 'Enseignement', CP11: 'Restaurants et hôtels',
      CP12: 'Assurances et finances', CP13: 'Soins personnels et divers',
    },
  },
```

`ru`:
```ts
  realSalary: {
    title: 'Реальная зарплата',
    entryTitle: 'Реальная зарплата',
    entrySub: 'Ваша зарплата против вашей личной инфляции',
    heroLabel: 'Реальное изменение зарплаты за 12 месяцев',
    pay: 'Изменение зарплаты',
    inflation: 'Ваша инфляция',
    requiredRaise: 'Нужная прибавка, чтобы не отставать: {{value}}',
    ahead: 'Вы опережаете свою инфляцию',
    breakdownTitle: 'Где цены выросли для вас',
    sourceReceipts: 'ваши чеки',
    sourceOfficial: 'официальные данные',
    dataMonth: 'Официальные данные: {{month}}',
    receiptsOnly: 'Только по вашим чекам — официальных данных по вашей стране нет.',
    fxApproximate: 'Часть сумм в других валютах не учтена.',
    share: { title: 'Моя реальная зарплата', real: 'Реальная зарплата', pay: 'Зарплата', inflation: 'Моя инфляция', footer: 'AI Budget' },
    shareAction: 'Поделиться',
    brief: 'Аргументы к повышению (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Документ станет доступен, когда реальная зарплата будет рассчитана.',
    briefFailed: 'Не удалось создать PDF. Попробуйте позже.',
    settings: 'Настройки',
    setupAction: 'Указать зарплату',
    settingsAction: 'Выбрать страну',
    disclaimer: 'Оценка по вашим расходам и открытой статистике цен — не финансовая консультация.',
    status: {
      noSalaryTitle: 'Подтвердите зарплату',
      noSalaryBody: 'Выберите доход, который является вашей зарплатой, чтобы сравнить его с вашей инфляцией.',
      historyShortTitle: 'Укажите зарплату год назад',
      historyShortBody: 'В приложении пока нет полного года вашей зарплаты. Введите, сколько вы получали год назад.',
      spendShortTitle: 'Поведите учёт ещё немного',
      spendShortBody: 'Нужны расходы хотя бы за 3 месяца, чтобы понять, на что вы тратите.',
      noSourceTitle: 'Нет данных о ценах для вашей страны',
      noSourceBody: 'Выберите страну или сканируйте больше чеков — ваши собственные цены заменят данные по продуктам.',
      encryptedTitle: 'Недоступно при полном шифровании',
      encryptedBody: 'Суммы в этом аккаунте шифруются на вашем устройстве, поэтому сервер не может это посчитать.',
    },
    setup: {
      title: 'Ваша зарплата',
      pick: 'Какой из этих доходов — ваша зарплата?',
      none: 'За последние 3 месяца не найдено регулярного ежемесячного дохода. Сначала добавьте зарплату как доход.',
      times: '{{count}}× за 3 месяца',
      previousLabel: 'Месячная зарплата год назад ({{currency}})',
      previousHint: 'Нужно, только пока в приложении меньше года вашей зарплаты.',
      save: 'Сохранить',
      saved: 'Сохранено',
      invalid: 'Введите сумму больше нуля.',
    },
    config: {
      title: 'Настройки реальной зарплаты',
      country: 'Страна для официальных цен',
      countryGuessed: '{{country}} (по часовому поясу)',
      countryNone: 'Не выбрана',
      categories: 'К чему относится каждая категория',
      categoriesHint: 'Помогает сопоставить ваши расходы с официальными группами цен.',
      auto: 'Автоматически',
      pickCountry: 'Выберите страну',
      pickDivision: 'Выберите группу цен',
      clearCountry: 'По моему часовому поясу',
    },
    division: {
      TOTAL: 'Остальное', CP01: 'Продукты и напитки', CP02: 'Алкоголь и табак', CP03: 'Одежда и обувь',
      CP04: 'Жильё и коммунальные услуги', CP05: 'Дом и обстановка', CP06: 'Здоровье', CP07: 'Транспорт',
      CP08: 'Связь и интернет', CP09: 'Отдых и культура', CP10: 'Образование', CP11: 'Рестораны и гостиницы',
      CP12: 'Страхование и финансы', CP13: 'Личный уход и прочее',
    },
  },
```

`ua`:
```ts
  realSalary: {
    title: 'Реальна зарплата',
    entryTitle: 'Реальна зарплата',
    entrySub: 'Ваша зарплата проти вашої особистої інфляції',
    heroLabel: 'Реальна зміна зарплати за 12 місяців',
    pay: 'Зміна зарплати',
    inflation: 'Ваша інфляція',
    requiredRaise: 'Потрібне підвищення, щоб не відставати: {{value}}',
    ahead: 'Ви випереджаєте свою інфляцію',
    breakdownTitle: 'Де ціни зросли для вас',
    sourceReceipts: 'ваші чеки',
    sourceOfficial: 'офіційні дані',
    dataMonth: 'Офіційні дані: {{month}}',
    receiptsOnly: 'Лише за вашими чеками — офіційних даних для вашої країни немає.',
    fxApproximate: 'Частину сум в інших валютах не враховано.',
    share: { title: 'Моя реальна зарплата', real: 'Реальна зарплата', pay: 'Зарплата', inflation: 'Моя інфляція', footer: 'AI Budget' },
    shareAction: 'Поділитися',
    brief: 'Аргументи для підвищення (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Документ буде доступний, коли реальну зарплату буде розраховано.',
    briefFailed: 'Не вдалося створити PDF. Спробуйте пізніше.',
    settings: 'Налаштування',
    setupAction: 'Вказати зарплату',
    settingsAction: 'Обрати країну',
    disclaimer: 'Оцінка за вашими витратами та відкритою статистикою цін — не фінансова консультація.',
    status: {
      noSalaryTitle: 'Підтвердьте зарплату',
      noSalaryBody: 'Оберіть дохід, який є вашою зарплатою, щоб порівняти його з вашою інфляцією.',
      historyShortTitle: 'Вкажіть зарплату рік тому',
      historyShortBody: 'У застосунку ще немає повного року вашої зарплати. Введіть, скільки ви отримували рік тому.',
      spendShortTitle: 'Ведіть облік ще трохи',
      spendShortBody: 'Потрібні витрати щонайменше за 3 місяці, щоб зрозуміти, на що ви витрачаєте.',
      noSourceTitle: 'Немає даних про ціни для вашої країни',
      noSourceBody: 'Оберіть країну або скануйте більше чеків — ваші власні ціни замінять дані про продукти.',
      encryptedTitle: 'Недоступно з повним шифруванням',
      encryptedBody: 'Суми в цьому акаунті шифруються на вашому пристрої, тому сервер не може це розрахувати.',
    },
    setup: {
      title: 'Ваша зарплата',
      pick: 'Який із цих доходів — ваша зарплата?',
      none: 'За останні 3 місяці не знайдено регулярного щомісячного доходу. Спочатку додайте зарплату як дохід.',
      times: '{{count}}× за 3 місяці',
      previousLabel: 'Місячна зарплата рік тому ({{currency}})',
      previousHint: 'Потрібно, лише доки в застосунку менше року вашої зарплати.',
      save: 'Зберегти',
      saved: 'Збережено',
      invalid: 'Введіть суму більшу за нуль.',
    },
    config: {
      title: 'Налаштування реальної зарплати',
      country: 'Країна для офіційних цін',
      countryGuessed: '{{country}} (за часовим поясом)',
      countryNone: 'Не обрано',
      categories: 'До чого належить кожна категорія',
      categoriesHint: 'Допомагає зіставити ваші витрати з офіційними групами цін.',
      auto: 'Автоматично',
      pickCountry: 'Оберіть країну',
      pickDivision: 'Оберіть групу цін',
      clearCountry: 'За моїм часовим поясом',
    },
    division: {
      TOTAL: 'Інше', CP01: 'Продукти та напої', CP02: 'Алкоголь і тютюн', CP03: 'Одяг і взуття',
      CP04: 'Житло та комунальні послуги', CP05: 'Дім і облаштування', CP06: 'Здоровʼя', CP07: 'Транспорт',
      CP08: 'Звʼязок та інтернет', CP09: 'Відпочинок і культура', CP10: 'Освіта', CP11: 'Ресторани та готелі',
      CP12: 'Страхування та фінанси', CP13: 'Особистий догляд та інше',
    },
  },
```

`be`:
```ts
  realSalary: {
    title: 'Рэальны заробак',
    entryTitle: 'Рэальны заробак',
    entrySub: 'Ваш заробак супраць вашай асабістай інфляцыі',
    heroLabel: 'Рэальная змена заробку за 12 месяцаў',
    pay: 'Змена заробку',
    inflation: 'Ваша інфляцыя',
    requiredRaise: 'Патрэбнае павышэнне, каб не адставаць: {{value}}',
    ahead: 'Вы апярэджваеце сваю інфляцыю',
    breakdownTitle: 'Дзе цэны выраслі для вас',
    sourceReceipts: 'вашы чэкі',
    sourceOfficial: 'афіцыйныя даныя',
    dataMonth: 'Афіцыйныя даныя: {{month}}',
    receiptsOnly: 'Толькі па вашых чэках — афіцыйных даных па вашай краіне няма.',
    fxApproximate: 'Частка сум у іншых валютах не ўлічана.',
    share: { title: 'Мой рэальны заробак', real: 'Рэальны заробак', pay: 'Заробак', inflation: 'Мая інфляцыя', footer: 'AI Budget' },
    shareAction: 'Падзяліцца',
    brief: 'Аргументы для павышэння (PDF)',
    briefPro: 'Pro',
    briefNotReady: 'Дакумент будзе даступны, калі рэальны заробак будзе разлічаны.',
    briefFailed: 'Не ўдалося стварыць PDF. Паспрабуйце пазней.',
    settings: 'Налады',
    setupAction: 'Пазначыць заробак',
    settingsAction: 'Выбраць краіну',
    disclaimer: 'Ацэнка па вашых выдатках і адкрытай статыстыцы цэн — не фінансавая кансультацыя.',
    status: {
      noSalaryTitle: 'Пацвердзіце заробак',
      noSalaryBody: 'Выберыце даход, які з’яўляецца вашым заробкам, каб параўнаць яго з вашай інфляцыяй.',
      historyShortTitle: 'Пазначце заробак год таму',
      historyShortBody: 'У праграме пакуль няма поўнага года вашага заробку. Увядзіце, колькі вы атрымлівалі год таму.',
      spendShortTitle: 'Павядзіце ўлік яшчэ крыху',
      spendShortBody: 'Патрэбныя выдаткі хаця б за 3 месяцы, каб зразумець, на што вы трацяце.',
      noSourceTitle: 'Няма даных пра цэны для вашай краіны',
      noSourceBody: 'Выберыце краіну або скануйце больш чэкаў — вашы ўласныя цэны заменяць даныя па прадуктах.',
      encryptedTitle: 'Недаступна пры поўным шыфраванні',
      encryptedBody: 'Сумы ў гэтым акаўнце шыфруюцца на вашай прыладзе, таму сервер не можа гэта разлічыць.',
    },
    setup: {
      title: 'Ваш заробак',
      pick: 'Які з гэтых даходаў — ваш заробак?',
      none: 'За апошнія 3 месяцы не знойдзена рэгулярнага штомесячнага даходу. Спачатку дадайце заробак як даход.',
      times: '{{count}}× за 3 месяцы',
      previousLabel: 'Месячны заробак год таму ({{currency}})',
      previousHint: 'Патрэбна, толькі пакуль у праграме менш за год вашага заробку.',
      save: 'Захаваць',
      saved: 'Захавана',
      invalid: 'Увядзіце суму большую за нуль.',
    },
    config: {
      title: 'Налады рэальнага заробку',
      country: 'Краіна для афіцыйных цэн',
      countryGuessed: '{{country}} (па гадзінным поясе)',
      countryNone: 'Не выбрана',
      categories: 'Да чаго адносіцца кожная катэгорыя',
      categoriesHint: 'Дапамагае супаставіць вашы выдаткі з афіцыйнымі групамі цэн.',
      auto: 'Аўтаматычна',
      pickCountry: 'Выберыце краіну',
      pickDivision: 'Выберыце групу цэн',
      clearCountry: 'Па маім гадзінным поясе',
    },
    division: {
      TOTAL: 'Астатняе', CP01: 'Прадукты і напоі', CP02: 'Алкаголь і тытунь', CP03: 'Адзенне і абутак',
      CP04: 'Жыллё і камунальныя паслугі', CP05: 'Дом і абсталяванне', CP06: 'Здароўе', CP07: 'Транспарт',
      CP08: 'Сувязь і інтэрнэт', CP09: 'Адпачынак і культура', CP10: 'Адукацыя', CP11: 'Рэстараны і гасцініцы',
      CP12: 'Страхаванне і фінансы', CP13: 'Асабісты догляд і іншае',
    },
  },
```

`nl`:
```ts
  realSalary: {
    title: 'Reëel salaris',
    entryTitle: 'Reëel salaris',
    entrySub: 'Je loon tegenover je eigen inflatie',
    heroLabel: 'Reële loonsverandering, 12 maanden',
    pay: 'Loonsverandering',
    inflation: 'Jouw inflatie',
    requiredRaise: 'Nodige verhoging om bij te blijven: {{value}}',
    ahead: 'Je loopt voor op je inflatie',
    breakdownTitle: 'Waar jouw prijzen stegen',
    sourceReceipts: 'jouw bonnen',
    sourceOfficial: 'officiële cijfers',
    dataMonth: 'Officiële cijfers: {{month}}',
    receiptsOnly: 'Alleen op basis van jouw bonnen — geen officiële cijfers voor jouw land.',
    fxApproximate: 'Sommige bedragen in andere valuta zijn weggelaten.',
    share: { title: 'Mijn reële salaris', real: 'Reëel loon', pay: 'Loon', inflation: 'Mijn inflatie', footer: 'AI Budget' },
    shareAction: 'Delen',
    brief: 'Argumenten voor loonsverhoging (pdf)',
    briefPro: 'Pro',
    briefNotReady: 'Het document is beschikbaar zodra je reële salaris is berekend.',
    briefFailed: 'De pdf kon niet worden gemaakt. Probeer het later opnieuw.',
    settings: 'Instellingen',
    setupAction: 'Salaris instellen',
    settingsAction: 'Land kiezen',
    disclaimer: 'Een schatting op basis van je uitgaven en openbare prijsstatistieken — geen financieel advies.',
    status: {
      noSalaryTitle: 'Bevestig je salaris',
      noSalaryBody: 'Kies de inkomsten die je salaris zijn, zodat we ze met je inflatie kunnen vergelijken.',
      historyShortTitle: 'Vul je salaris van een jaar geleden in',
      historyShortBody: 'De app heeft nog geen vol jaar van je salaris. Vul in wat je een jaar geleden verdiende.',
      spendShortTitle: 'Houd nog even bij',
      spendShortBody: 'We hebben minstens 3 maanden uitgaven nodig om te weten waaraan je geld uitgeeft.',
      noSourceTitle: 'Geen prijsgegevens voor jouw land',
      noSourceBody: 'Kies je land of scan meer bonnen — je eigen prijzen kunnen voor boodschappen invallen.',
      encryptedTitle: 'Niet beschikbaar met volledige versleuteling',
      encryptedBody: 'Bedragen in dit account worden op je apparaat versleuteld, dus de server kan dit niet berekenen.',
    },
    setup: {
      title: 'Je salaris',
      pick: 'Welke hiervan is je salaris?',
      none: 'Geen vaste maandelijkse inkomsten gevonden in de laatste 3 maanden. Voeg je salaris eerst toe als inkomsten.',
      times: '{{count}}× in 3 maanden',
      previousLabel: 'Maandsalaris een jaar geleden ({{currency}})',
      previousHint: 'Alleen nodig zolang de app minder dan een jaar van je salaris heeft.',
      save: 'Opslaan',
      saved: 'Opgeslagen',
      invalid: 'Vul een bedrag groter dan nul in.',
    },
    config: {
      title: 'Instellingen reëel salaris',
      country: 'Land voor officiële prijzen',
      countryGuessed: '{{country}} (op basis van je tijdzone)',
      countryNone: 'Niet ingesteld',
      categories: 'Waar elke categorie bij hoort',
      categoriesHint: 'Hiermee koppelen we je uitgaven aan de officiële prijsgroepen.',
      auto: 'Automatisch',
      pickCountry: 'Kies een land',
      pickDivision: 'Kies een prijsgroep',
      clearCountry: 'Mijn tijdzone gebruiken',
    },
    division: {
      TOTAL: 'Overig', CP01: 'Voeding en dranken', CP02: 'Alcohol en tabak', CP03: 'Kleding en schoenen',
      CP04: 'Wonen en energie', CP05: 'Huishouden en inrichting', CP06: 'Gezondheid', CP07: 'Vervoer',
      CP08: 'Telefoon en internet', CP09: 'Recreatie en cultuur', CP10: 'Onderwijs', CP11: 'Restaurants en hotels',
      CP12: 'Verzekeringen en financiën', CP13: 'Persoonlijke verzorging en overig',
    },
  },
```

- [ ] **Step 1:** Insert each block after the `wrapped` object in its file (keep the file's existing quote style where it matters; double quotes are fine where the string contains `'`).
- [ ] **Step 2: Verify** — from `apps/mobile`: `npx tsc --noEmit` (exit 0) and `npx jest src/i18n` if an i18n key-parity test exists (`ls src/i18n/__tests__`); if one exists it must pass.
- [ ] **Step 3: Commit** — `git commit -m "Add real-salary strings in all nine languages"` (the 9 locale files only).

---

### Task 4: Data hook

**Files:** Create `apps/mobile/src/features/insights/useRealSalary.ts`

**Interfaces — Produces:**
```ts
export interface UseRealSalaryResult {
  data: RealSalaryResponse | null; loading: boolean; error: boolean; reload: () => void;
}
export function useRealSalary(): UseRealSalaryResult;   // reloads on focus and on account switch
```

- [ ] **Step 1: Implement** (mirrors `useWrapped`; adds a focus reload so returning from setup/settings shows the new answer):

```ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { RealSalaryResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';

export interface UseRealSalaryResult {
  data: RealSalaryResponse | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Online-only by design: the answer is computed server-side and cached there. */
export function useRealSalary(): UseRealSalaryResult {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const [data, setData] = useState<RealSalaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await api.getRealSalary());
    } catch (e) {
      console.warn('Failed to load real salary', e);
      setError(true);
    } finally {
      setLoading(false);
    }
    // currentAccountId: a switch must refetch (X-Account-Id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, loading, error, reload: load };
}
```

Check before writing: `grep -n "currentAccountId" apps/mobile/src/stores/accountStore.ts | head -3` — Expected: the state field exists with that name.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` exit 0.
- [ ] **Step 3: Commit** — `git commit -m "Add the real-salary data hook"`

---

### Task 5: Share card + pickers (components)

**Files:**
- Create: `apps/mobile/src/components/real-salary/RealSalaryShareCard.tsx`
- Create: `apps/mobile/src/components/real-salary/CountryPickerSheet.tsx`
- Create: `apps/mobile/src/components/real-salary/DivisionPickerSheet.tsx`

- [ ] **Step 1: Share card** — a thin wrapper (ABA-353 rule: new shareable cards wrap `ShareImageCard`; `ShareImageCard.web.tsx` is already a no-op, so no own `.web.tsx` is needed here):

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShareImageCard, type ShareImageCardHandle } from '@/components/share/ShareImageCard';
import type { ShareLine } from '@/features/insights/realSalary';

export interface RealSalarySharePayload {
  title: string;
  lines: ShareLine[];
  footer: string;
}

export interface RealSalaryShareCardHandle {
  /** Resolves false on any failure (and always on web) — the caller falls back to a text share. */
  share: (payload: RealSalarySharePayload) => Promise<boolean>;
}

export const RealSalaryShareCard = forwardRef<RealSalaryShareCardHandle>(function RealSalaryShareCard(_props, ref) {
  const inner = useRef<ShareImageCardHandle>(null);
  useImperativeHandle(ref, () => ({
    share: (p) =>
      inner.current?.share({ fileTag: new Date().toISOString().slice(0, 10), ...p }) ?? Promise.resolve(false),
  }));
  return (
    <ShareImageCard
      ref={inner}
      renderFnName="__renderRealSalary"
      gradientFrom="#0EA5E9"
      gradientTo="#6366F1"
      fileNamePrefix="real-salary"
    />
  );
});
```

- [ ] **Step 2: `CountryPickerSheet`** — mirror `src/components/MerchantPickerSheet.tsx` (Modal, backdrop, handle, `paddingBottom: theme.spacing[4] + insets.bottom`, desktop centred via `useIsDesktopWeb`), with props `{ visible: boolean; selected: string | null; onSelect: (code: string | null) => void; onClose: () => void }`. Rows: first a "use my time zone" row (`t('realSalary.config.clearCountry')`) that calls `onSelect(null)`, then `REAL_SALARY_COUNTRIES` sorted by `countryName(code, getIntlLocale())`, each showing the name and a checkmark when `code === selected`. Title `t('realSalary.config.pickCountry')`. No search box (30 rows).

- [ ] **Step 3: `DivisionPickerSheet`** — same sheet shape; props `{ visible: boolean; selected: CoicopDivision | null; onSelect: (d: CoicopDivision) => void; onClose: () => void }`; rows are `CP01…CP13` then `TOTAL`, label `t(\`realSalary.division.${d}\`)`, checkmark on the selected one; title `t('realSalary.config.pickDivision')`.

- [ ] **Step 4: Typecheck + lint** — `npx tsc --noEmit`; `npx eslint src/components/real-salary` — 0 errors.
- [ ] **Step 5: Commit** — `git commit -m "Add the real-salary share card and picker sheets"`

---

### Task 6: Main screen

**Files:**
- Create: `apps/mobile/app/real-salary/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (three `Stack.Screen` entries, next to `inflation-shield/index`)

- [ ] **Step 1: Headers in `_layout.tsx`**

```tsx
        <Stack.Screen name="real-salary/index" options={{ headerShown: true, title: t('realSalary.title') }} />
        <Stack.Screen name="real-salary/setup" options={{ headerShown: true, title: t('realSalary.setup.title') }} />
        <Stack.Screen name="real-salary/settings" options={{ headerShown: true, title: t('realSalary.config.title') }} />
```

- [ ] **Step 2: Screen** — `app/real-salary/index.tsx`, structure (use `useTheme`/`useStyles(createStyles)`, `ScrollView` with `RefreshControl` bound to `reload`):
  - Header right (via `<Stack.Screen options={{ headerRight }} />` inside the screen): a settings icon (`Ionicons "options-outline"`, colour `theme.colors.textInverse` — header actions are textInverse, CLAUDE.md) → `router.push('/real-salary/settings')`.
  - `loading && !data` → `ActivityIndicator`. `error` → error text + retry button (`t('common.retry')` — check the key exists; else `t('common.tryAgain')`, grep `en.ts`).
  - `const copy = data ? statusCopy(data.status) : null;` when `copy`: a card with `t(copy.titleKey)`, `t(copy.bodyKey)`, and a primary button when `copy.action` — `setup` → `t('realSalary.setupAction')` → `router.push('/real-salary/setup')`; `settings` → `t('realSalary.settingsAction')` → `router.push('/real-salary/settings')`. Hide the setup button when `!canEdit`.
  - `ready`:
    - Hero card: label `t('realSalary.heroLabel')`; value `formatSignedPct(data.realChangePct)` in `display` text style, coloured by `toneOf` (`negative` → `theme.colors.danger`, `positive` → `theme.colors.success`, `neutral` → `theme.colors.textPrimary`).
    - Rows: `t('realSalary.pay')` → `formatSignedPct(nominalChangePct)`; `t('realSalary.inflation')` → `formatSignedPct(personalInflationPct)`; then one line `t(requiredRaiseKey(data.requiredRaisePct), { value: formatSignedPct(data.requiredRaisePct) })`.
    - Breakdown card `t('realSalary.breakdownTitle')`: one row per `data.breakdown` entry sorted by `weight` desc: `t(\`realSalary.division.${row.division}\`)`, `${Math.round(row.weight * 100)}%`, `formatSignedPct(row.ratePct)`, and a small tag `t(row.source === 'receipts' ? 'realSalary.sourceReceipts' : 'realSalary.sourceOfficial')`.
    - Footnotes: `data.dataMonth ? t('realSalary.dataMonth', { month: data.dataMonth }) : t('realSalary.receiptsOnly')`; `data.fxApproximate && t('realSalary.fxApproximate')`; `t('realSalary.disclaimer')`.
    - Actions: **Share** → `const ok = await shareRef.current?.share({ title: t('realSalary.share.title'), lines: buildShareLines(data, t), footer: t('realSalary.share.footer') })`; if not ok → `Share.share({ message: [t('realSalary.share.title'), ...buildShareLines(data, t).map((l) => \`${l.emoji} ${l.label}: ${l.value}\`)].join('\n') })`. **Raise brief** (label `t('realSalary.brief')` with a small `t('realSalary.briefPro')` badge when `!useSubscriptionStore.getState().isPro()`) → `onBrief` below.
  - `onBrief`: `try { const { blob, fileName } = await api.downloadRealSalaryBrief(i18n.language); await saveFile(blob, fileName); } catch (e) { const k = briefErrorKind(e); if (k === 'paywall') useUpgradeStore.getState().show(t('realSalary.brief'), 'pro'); else showAlert(t('common.error'), t(k === 'not_ready' ? 'realSalary.briefNotReady' : 'realSalary.briefFailed')); }` — `saveFile` from `@/services/fileExport` (native: SAF picker / share sheet; web: download); `showAlert` from `@/utils/alert`; `i18n` from `@/i18n`; `useUpgradeStore` from `@/stores/upgradeStore`. A busy flag disables the button while downloading.
  - Mount `<RealSalaryShareCard ref={shareRef} />` once at the end of the tree.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx eslint app/real-salary app/_layout.tsx` (0 errors); `npx jest src/features/insights` still green.
- [ ] **Step 4: Commit** — `git commit -m "Add the real-salary screen"`

---

### Task 7: Setup screen

**Files:** Create `apps/mobile/app/real-salary/setup.tsx`

- [ ] **Step 1: Implement:**
  - On mount `api.getRealSalaryProfile()` → `{ profile, candidates }`; `selectedKey` state initialised from `profile.salaryKey ?? candidates[0]?.key ?? null`; `previous` text state from `profile.manualPreviousMonthly ?? ''`.
  - Header text `t('realSalary.setup.pick')`. Candidates as selectable rows (radio): title `c.categoryName ?? c.descriptionKey`, subtitle `formatCurrency(c.typicalAmount, c.currencyCode)` (from `@budget/shared-utils`) + ` · ` + `t('realSalary.setup.times', { count: c.occurrences })`. Empty list → `t('realSalary.setup.none')` (no save button).
  - Below: label `t('realSalary.setup.previousLabel', { currency: manualCurrency(candidates, selectedKey) ?? '' })`, a numeric `TextInput` (`keyboardType="decimal-pad"`), hint `t('realSalary.setup.previousHint')`. Wrap the screen in `KeyboardAwareScreen` (`@/components/KeyboardAwareScreen`).
  - Save (hidden when `!canEdit`): parse `previous` (`,` → `.`); empty → `null`; non-positive / NaN → `showAlert(t('common.error'), t('realSalary.setup.invalid'))`. Else `await api.saveRealSalaryProfile({ salaryKey: selectedKey, manualPreviousMonthly })` then `router.back()`. On failure `console.warn` + `showAlert(t('common.error'), e.message)`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit`; `npx eslint app/real-salary/setup.tsx` (0 errors).
- [ ] **Step 3: Commit** — `git commit -m "Add the real-salary setup screen"`

---

### Task 8: Settings screen

**Files:** Create `apps/mobile/app/real-salary/settings.tsx`

- [ ] **Step 1: Implement:**
  - Loads `api.getRealSalary()` (for `country` + `countryGuessed`) and `api.getRealSalaryCategories()` in parallel.
  - **Country row**: label `t('realSalary.config.country')`; value: `country === null` → `t('realSalary.config.countryNone')`; `countryGuessed` → `t('realSalary.config.countryGuessed', { country: countryName(country, getIntlLocale()) })`; else `countryName(country, …)`. Tap → `CountryPickerSheet` (`selected = countryGuessed ? null : country`). `onSelect(code)` → `await api.updateProfile({ inflationCountry: code })`, then reload. Also update the local user copy: `useAuthStore.getState().updateUser({ inflationCountry: code })` only if the store's user type has that field — check `grep -n "inflationCountry" packages/shared-types/src/entities` first; if the entity lacks it, skip the store update (the screen reloads from the API anyway).
  - **Categories**: section title `t('realSalary.config.categories')`, hint `t('realSalary.config.categoriesHint')`; one row per category: `${icon ?? ''} ${name}` and the value `coicopDivision ? t(\`realSalary.division.${coicopDivision}\`) : t('realSalary.config.auto')`. Tap (only when `canEdit`) → `DivisionPickerSheet`; `onSelect(d)` → `await api.updateCategory(id, { coicopDivision: d })` then update that row locally. A 403 (system category) → `showAlert(t('common.error'), e.message)`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit`; eslint 0 errors.
- [ ] **Step 3: Commit** — `git commit -m "Add the real-salary settings screen"`

---

### Task 9: Entry points

**Files:** Modify `apps/mobile/src/components/analytics/AnalyticsMobile.tsx` (after the Wrapped banner), `apps/mobile/src/components/analytics/desktop/DiscoveryRow.tsx` (a fourth card).

- [ ] **Step 1: Phone banner** — copy the Wrapped `TouchableOpacity` block exactly, with `onPress={() => router.push('/real-salary')}`, icon `trending-up-outline`, title `t('realSalary.entryTitle')`, sub `t('realSalary.entrySub')`, no sparkles icon.
- [ ] **Step 2: Desktop card** — in `DiscoveryRow`, a fourth `Pressable` with the same shape as the Wrapped one: icon `trending-up-outline`, title `t('realSalary.entryTitle')`, subtitle `t('realSalary.entrySub')`, `onPress={() => router.push('/real-salary')}`. Update the component's doc comment ("Story / Scenario Simulator / Wrapped / Real salary").
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx jest` (whole mobile suite) green; `npx eslint` on both files 0 errors.
- [ ] **Step 4: Commit** — `git commit -m "Link the real-salary screen from the Analytics tab"`

---

### Task 10: Help section, wiki, finish

**Files:**
- Create: `user_docs/<lang>/43-real-salary.md` for `en de es fr pl ru ua be nl`
- Modify: `scripts/generate-help-content.js` (append `'43-real-salary'` to `SECTIONS` after `'42-receipt-split'`), `apps/mobile/src/help/sections.ts` (append `{ id: '43-real-salary', icon: 'trending-up-outline', color: '#0EA5E9' }`), `docs/marketing/help/build_help.py` (append `"43-real-salary"` to its list after `"42-receipt-split"`)
- Regenerate: `apps/mobile/src/help/content.ts`, `docs/marketing/help/site/**` (via the two scripts)
- Modify: `docs/wiki/features/real-salary.md` (mobile entry points, the online-only decision, share card percentages-only invariant, the three routes), `docs/wiki/log.md`

- [ ] **Step 1: Write the `en` page** — match the shape of `user_docs/en/40-inflation-shield.md` (read it first: front-matter/title line, sections, FAQ). Content: what "real salary" means (pay change vs your own inflation, with an example: pay +5 %, your inflation +8.3 % → real −3.0 %); how it is calculated (your spending by category × official price statistics for your country; food from your own receipts once you have enough of them); setup (confirm salary; last year's figure in the salary's own currency while the app has less than a year); settings (country; what each category counts as); what each empty state means; sharing (percentages only, never amounts); the Pro raise brief PDF; "an estimate, not financial advice"; FAQ (why "your inflation" differs from the news; why my country is guessed from the time zone; encryption). Then write the other 8 languages with the same structure, in each language's real orthography.
- [ ] **Step 2: Register** in the three places, then from the repo root: `npm run generate:help` and `python docs/marketing/help/build_help.py`. Commit only real changes: for every regenerated file, if `git diff --stat` and `git diff --ignore-cr-at-eol --stat` differ, rebuild it as HEAD + the CR-insensitive patch (`git diff --ignore-cr-at-eol <file> > p; git checkout -- <file>; git apply --ignore-whitespace p`). New help-site pages live under a gitignored folder: `git add -f` them.
- [ ] **Step 3: Wiki** — update `docs/wiki/features/real-salary.md` and add one line to `docs/wiki/log.md` (ABA link added by finish-aba-task). `python scripts/wiki-lint.py` — no real-salary finding.
- [ ] **Step 4: Commit** — `git commit -m "Document the real-salary screen in the help center and wiki"`
- [ ] **Step 5:** Run `finish-aba-task` (ABA issue; title without a colon). Do not push without approval.
