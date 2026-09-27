# Real Salary — API Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /insights/real-salary` answers "real salary −3.3%: pay +5.0%, your inflation +8.3%" from the account's own spending weights × official Eurostat HICP by COICOP 2018 division, with CP01 replaced by the receipt index when it is well-backed; plus the salary-setup profile, the category→division editor data, and a Pro "raise brief" PDF.

**Architecture:** Pure calculation modules (`coicop.ts`, `salary-detect.util.ts`, `real-salary.util.ts`) carry every rule and are unit-tested; thin IO services wrap them — `EurostatClient` + `OfficialInflationService` (cron-fed table), `CoicopClassifierService` (icon dictionary, then gpt-4o-mini on names only), `RealSalaryService` (assembly + Redis cache), `RealSalaryBriefPdf` (pdfkit, deterministic 9-language template). All live in `modules/insights/real-salary/` and are wired into `InsightsModule`.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, `@nestjs/schedule`, Redis (`CacheService`), OpenAI SDK (`gpt-4o-mini`), pdfkit, Jest.

**Spec:** `docs/superpowers/specs/2026-09-26-real-salary-design.md` — read its **Corrections** section first; it overrides the body (dataset `prc_hicp_minr`, dimension `coicop18`, `TOTAL` + `CP01..CP13`).

## Global Constraints

- Eurostat dataset `prc_hicp_minr`, filters `unit=RCH_A`, `coicop18` ∈ `TOTAL, CP01..CP13`, `lastTimePeriod=1`, `format=JSON`, `lang=EN`. URL base `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/`.
- Weights: last 12 months of the account's expenses, split-aware via `attributeToCategories`, excluding `isDeleted`, `isDebt`, `isDebtRepayment`, `isPlanned`, `isSplitReceivable`. Amounts to `user.currencyCode` via `getRatesSafe`/`convertAmount` from `common/utils/fx.ts`; unknown rate → excluded + `fxApproximate`.
- CP01 uses the receipt index (`PriceHistoryService.getPriceHistory(accountId, '12m')`, a percentage) only when `productCount >= 10`.
- Unmapped categories and uncategorized spend → `TOTAL`.
- `real = (1 + nominal) / (1 + inflation) − 1`; `requiredRaisePct = (1 + inflation) / (1 + nominal) − 1`. All `*Pct` fields are percentages rounded to 1 decimal.
- Salary grouping: income category + normalised description (never amount); cadence 25–35 days, ≥ 2 occurrences within 90 days; excluded incomes: `isDebt`, `isDebtRepayment`, `clientId` starting `transfer-income-`.
- Statuses: `ready | no_salary_confirmed | salary_history_short | spend_under_3_months | no_inflation_source | encrypted`.
- Free: `GET /insights/real-salary`, profile, categories. Pro: `POST /insights/real-salary/brief` (`SubscriptionTierGuard` + `@RequireTier('pro')`). Writes (`PUT profile`) behind `new ViewerBlockGuard()`.
- Cache `rs:{accountId}:{currency}` TTL 3600 s; busted on profile PUT, category `coicopDivision` PATCH, `inflationCountry` PATCH (bust by prefix `rs:{accountId}:` / for the user's accounts — see Task 9).
- The classifier sees category names only; never amounts. Not charged to the user's AI limit. "Unknown" is stored as `TOTAL`.
- No salary amounts in any log line.
- The API imports **no runtime value** from `@budget/shared-types` / `@budget/shared-utils` (`import type` only) — deploy guard `check-no-shared-utils-runtime-import.sh`.
- Schema change and migration in the **same commit** (ABA-558).

## Review Focus

1. A salary paid in a different currency than `user.currencyCode` with no rate available → excluded from both means, `fxApproximate: true`, and if nothing is left the status is `salary_history_short`, never a 0 % raise. (Task 5 test `salary rows with no rate are excluded, not counted as zero`.)
2. An account where every expense is uncategorized → all weight on `TOTAL`, inflation = the national total, status `ready` — not a division-less crash. (Task 4 test `all uncategorized → national total`.)
3. The latest Eurostat month is missing a division for the user's country (a `null` cell) → that division falls back to `TOTAL` for that country, not to 0 %. (Task 4 test `missing division rate falls back to TOTAL`.)
4. A user in a non-EU timezone with fewer than 10 receipt products → `no_inflation_source`, not an index computed from nothing. (Task 4 test `non-EU and thin receipts → no_inflation_source`.)
5. Nominal change of exactly 0 with inflation 0 → real 0.0 and required 0.0, no `-0.0` / NaN. (Task 4 test `zero/zero gives clean zeros`.)

---

## File Structure

All new API code under `apps/api/src/modules/insights/real-salary/`:

| File | Responsibility |
|---|---|
| `coicop.ts` | Division codes + labels (9 langs), seed-icon → division map, timezone → country, supported countries |
| `salary-detect.util.ts` | Pure: normalise description, find salary candidates, compute nominal change |
| `real-salary.util.ts` | Pure: weights, personal inflation, real change, status |
| `eurostat.client.ts` | HTTP fetch + JSON-stat parsing → `OfficialRateRow[]` |
| `official-inflation.service.ts` | Upsert rows, latest rates for a country; cron entry + boot fill |
| `coicop-classifier.service.ts` | Fill `Category.coicopDivision` (icon map → LLM → `TOTAL`) |
| `real-salary.service.ts` | Assemble inputs, cache, profile, categories list, cache bust |
| `real-salary-brief.pdf.ts` | pdfkit brief, 9-language labels |
| `__tests__/*.spec.ts` | One spec per file above |
| Modified: `insights.controller.ts`, `insights.module.ts` | Routes + providers |
| Modified: `prisma/schema.prisma` + new migration | Tables/columns |
| Modified: `categories/dto/index.ts`, `users/users.controller.ts`, `users/users.service.ts` | `coicopDivision`, `inflationCountry` |
| Modified: `reports/generators/pdf-generator.ts` | Export the Inter font paths |
| `packages/shared-types/src/dto/real-salary.ts` + `dto/index.ts` | DTOs |

---

### Task 1: Shared DTOs

**Files:**
- Create: `packages/shared-types/src/dto/real-salary.ts`
- Modify: `packages/shared-types/src/dto/index.ts` (add export next to `export * from './insights';`)

**Interfaces:**
- Produces (types only, used by every later task and by the mobile plan):

- [ ] **Step 1: Write the types**

```ts
/** COICOP 2018 divisions as published by Eurostat (`coicop18`); TOTAL = all items. */
export type CoicopDivision =
  | 'TOTAL' | 'CP01' | 'CP02' | 'CP03' | 'CP04' | 'CP05' | 'CP06' | 'CP07'
  | 'CP08' | 'CP09' | 'CP10' | 'CP11' | 'CP12' | 'CP13';

export type RealSalaryStatus =
  | 'ready'
  | 'no_salary_confirmed'
  | 'salary_history_short'
  | 'spend_under_3_months'
  | 'no_inflation_source'
  | 'encrypted';

export interface RealSalaryBreakdownRow {
  division: CoicopDivision;
  /** Share of spend, 0..1. */
  weight: number;
  /** Annual rate of change, percent. */
  ratePct: number;
  source: 'official' | 'receipts';
}

export interface RealSalaryResponse {
  status: RealSalaryStatus;
  baseCurrency: string;
  /** ISO 3166-1 alpha-2 in Eurostat's spelling (Greece = EL); null outside coverage. */
  country: string | null;
  /** True when `country` came from the timezone, not from the user's choice. */
  countryGuessed: boolean;
  /** 'YYYY-MM' of the official data used; null when receipts-only. */
  dataMonth: string | null;
  nominalChangePct: number | null;
  personalInflationPct: number | null;
  realChangePct: number | null;
  requiredRaisePct: number | null;
  breakdown: RealSalaryBreakdownRow[];
  /** Up to 3 divisions contributing most to inflation (weight × rate), highest first. */
  topDrivers: CoicopDivision[];
  fxApproximate: boolean;
  computedAt: string;
}

export interface SalaryCandidate {
  /** Opaque, stable: `${categoryId ?? ''}|${descriptionKey}|${currencyCode}`. */
  key: string;
  categoryId: string | null;
  categoryName: string | null;
  descriptionKey: string;
  currencyCode: string;
  /** Mean of the detected occurrences, in `currencyCode`. */
  typicalAmount: number;
  occurrences: number;
}

export interface SalaryProfileDto {
  salaryKey: string | null;
  manualPreviousMonthly: number | null;
}

export interface RealSalaryProfileResponse {
  profile: SalaryProfileDto;
  candidates: SalaryCandidate[];
}

export interface RealSalaryCategoryRow {
  id: string;
  name: string;
  icon: string | null;
  coicopDivision: CoicopDivision | null;
}
```

Add to `packages/shared-types/src/dto/index.ts`, directly after `export * from './insights';`:

```ts
export * from './real-salary';
```

- [ ] **Step 2: Typecheck**

Run (repo root): `npx tsc --noEmit -p packages/shared-types`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/real-salary.ts packages/shared-types/src/dto/index.ts
git commit -m "Add real-salary DTOs to shared types"
```

---

### Task 2: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `User`, `Category`; two new models)
- Create: `apps/api/prisma/migrations/20260927000000_add_real_salary/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`**

In `model User`, after the `language` line:

```prisma
  inflationCountry           String?       @map("inflation_country")
```

In `model User`, next to the other relation lists:

```prisma
  salaryProfiles             SalaryProfile[]
```

In `model Category`, after `color`:

```prisma
  coicopDivision       String?  @map("coicop_division")
```

In `model Account`, next to its other relation lists:

```prisma
  salaryProfiles       SalaryProfile[]
```

Append two models:

```prisma
/// Official annual inflation (HICP, COICOP 2018) per country, division and month — fed by
/// OfficialInflationService from Eurostat `prc_hicp_minr`. Never written on a user request.
model OfficialInflationRate {
  id            String   @id @default(uuid())
  country       String
  division      String
  month         String   // 'YYYY-MM'
  annualRatePct Decimal  @map("annual_rate_pct") @db.Decimal(6, 2)
  fetchedAt     DateTime @default(now()) @map("fetched_at")

  @@unique([country, division, month])
  @@index([country, month])
  @@map("official_inflation_rates")
}

/// The income series a user confirmed as their salary on one account (real salary).
model SalaryProfile {
  id                    String   @id @default(uuid())
  userId                String   @map("user_id")
  accountId             String   @map("account_id")
  /// `${categoryId ?? ''}|${descriptionKey}|${currencyCode}` — see salary-detect.util.ts.
  salaryKey             String?  @map("salary_key")
  manualPreviousMonthly Decimal? @map("manual_previous_monthly") @db.Decimal(12, 2)
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([userId, accountId])
  @@map("salary_profiles")
}
```

- [ ] **Step 2: Write the migration by hand** (no local DB is required; mirror Prisma's SQL style)

`apps/api/prisma/migrations/20260927000000_add_real_salary/migration.sql`:

```sql
-- Real salary (plan 2026-09-26-real-salary-api)
ALTER TABLE "users" ADD COLUMN "inflation_country" TEXT;
ALTER TABLE "categories" ADD COLUMN "coicop_division" TEXT;

CREATE TABLE "official_inflation_rates" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "annual_rate_pct" DECIMAL(6,2) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "official_inflation_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "official_inflation_rates_country_division_month_key"
    ON "official_inflation_rates"("country", "division", "month");
CREATE INDEX "official_inflation_rates_country_month_idx"
    ON "official_inflation_rates"("country", "month");

CREATE TABLE "salary_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "salary_key" TEXT,
    "manual_previous_monthly" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_profiles_user_id_account_id_key"
    ON "salary_profiles"("user_id", "account_id");
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Before writing, confirm the accounts table name: `grep -n '@@map("accounts")' apps/api/prisma/schema.prisma` — Expected: one match. If the name differs, use it in both `REFERENCES`.

- [ ] **Step 3: Validate and regenerate**

Run (from `apps/api`): `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` and `Generated Prisma Client`.

If Docker Postgres is available locally, also run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_URL" --exit-code` — Expected: exit 0 (no drift). If it is not available, record that in the ledger; the deploy's `migrate deploy` applies the SQL.

- [ ] **Step 4: Commit (schema and migration together — ABA-558)**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260927000000_add_real_salary
git commit -m "Add real-salary tables and columns with their migration"
```

---

### Task 3: COICOP reference module

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/coicop.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/coicop.spec.ts`

**Interfaces:**
- Consumes: `CoicopDivision` (type) from `@budget/shared-types`.
- Produces:
  ```ts
  export const DIVISIONS: readonly CoicopDivision[];            // TOTAL first, then CP01..CP13
  export const EUROSTAT_COUNTRIES: readonly string[];
  export function isDivision(x: unknown): x is CoicopDivision;
  export function divisionForSeedIcon(icon: string | null | undefined): CoicopDivision | null;
  export function countryFromTimezone(tz: string | null | undefined): string | null;
  export function isEurostatCountry(x: unknown): x is string;
  export function divisionLabel(division: CoicopDivision, lang: string): string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import {
  DIVISIONS, EUROSTAT_COUNTRIES, isDivision, divisionForSeedIcon, countryFromTimezone,
  isEurostatCountry, divisionLabel,
} from '../coicop';

describe('coicop', () => {
  it('lists TOTAL and the 13 COICOP 2018 divisions', () => {
    expect(DIVISIONS).toEqual([
      'TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07',
      'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13',
    ]);
    expect(isDivision('CP13')).toBe(true);
    expect(isDivision('CP00')).toBe(false);
    expect(isDivision('cp01')).toBe(false);
  });

  it('maps every seed-category icon to a division', () => {
    // The seed icons are identical in all 9 languages (default-categories.ts).
    expect(divisionForSeedIcon('🛒')).toBe('CP01');
    expect(divisionForSeedIcon('🍔')).toBe('CP11');
    expect(divisionForSeedIcon('🍺')).toBe('CP02');
    expect(divisionForSeedIcon('💡')).toBe('CP04');
    expect(divisionForSeedIcon('🚗')).toBe('CP07');
    expect(divisionForSeedIcon('📱')).toBe('CP08');
    expect(divisionForSeedIcon('👕')).toBe('CP03');
    expect(divisionForSeedIcon('📦')).toBe('TOTAL');
    expect(divisionForSeedIcon('🦄')).toBeNull();
    expect(divisionForSeedIcon(null)).toBeNull();
  });

  it('guesses the country from a European timezone', () => {
    expect(countryFromTimezone('Europe/Warsaw')).toBe('PL');
    expect(countryFromTimezone('Europe/Athens')).toBe('EL');
    expect(countryFromTimezone('Europe/Kyiv')).toBeNull();
    expect(countryFromTimezone('UTC')).toBeNull();
    expect(countryFromTimezone(undefined)).toBeNull();
  });

  it('knows which countries Eurostat publishes', () => {
    expect(EUROSTAT_COUNTRIES).toContain('PL');
    expect(EUROSTAT_COUNTRIES).toContain('EL');
    expect(isEurostatCountry('PL')).toBe(true);
    expect(isEurostatCountry('GR')).toBe(false);
    expect(isEurostatCountry('UA')).toBe(false);
  });

  it('labels divisions in every app language, falling back to English', () => {
    for (const lang of ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']) {
      for (const d of DIVISIONS) expect(divisionLabel(d, lang).length).toBeGreaterThan(2);
    }
    expect(divisionLabel('CP01', 'xx')).toBe(divisionLabel('CP01', 'en'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/api`): `npx jest src/modules/insights/real-salary/__tests__/coicop.spec.ts`
Expected: FAIL — `Cannot find module '../coicop'`.

- [ ] **Step 3: Implement**

```ts
import type { CoicopDivision } from '@budget/shared-types';

/** COICOP 2018 as published by Eurostat `prc_hicp_minr` (`coicop18`). TOTAL = all items. */
export const DIVISIONS: readonly CoicopDivision[] = [
  'TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07',
  'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13',
];

export function isDivision(x: unknown): x is CoicopDivision {
  return typeof x === 'string' && (DIVISIONS as readonly string[]).includes(x);
}

/**
 * Seed categories keep the same icon in all 9 seed languages while their names
 * change (default-categories.ts), so the icon is the stable key. A user who
 * re-icons a category falls through to the classifier, which is correct.
 */
const SEED_ICON_DIVISION: Record<string, CoicopDivision> = {
  '🍔': 'CP11', // Food & Dining → restaurants
  '🛒': 'CP01', // Groceries
  '🍺': 'CP02', // Alcohol
  '🧴': 'CP05', // Household
  '🚗': 'CP07', // Transport
  '🛍️': 'TOTAL', // Shopping — too broad for one division
  '🎬': 'CP09', // Entertainment
  '💡': 'CP04', // Bills & Utilities
  '💊': 'CP06', // Health
  '📚': 'CP10', // Education
  '👕': 'CP03', // Clothing
  '🎁': 'TOTAL', // Gifts
  '✈️': 'CP09', // Travel — package holidays sit in CP09 in COICOP 2018
  '📱': 'CP08', // Subscriptions — information and communication
  '📦': 'TOTAL', // Other
};

export function divisionForSeedIcon(icon: string | null | undefined): CoicopDivision | null {
  if (!icon) return null;
  return SEED_ICON_DIVISION[icon] ?? null;
}

/** Eurostat geo codes that are single countries in prc_hicp_minr (Greece is EL). */
export const EUROSTAT_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'NO', 'CH',
];

export function isEurostatCountry(x: unknown): x is string {
  return typeof x === 'string' && EUROSTAT_COUNTRIES.includes(x);
}

const TZ_COUNTRY: Record<string, string> = {
  'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE', 'Europe/Sofia': 'BG', 'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY', 'Europe/Prague': 'CZ', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/Copenhagen': 'DK', 'Europe/Tallinn': 'EE', 'Europe/Athens': 'EL', 'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES', 'Europe/Helsinki': 'FI', 'Europe/Paris': 'FR', 'Europe/Zagreb': 'HR',
  'Europe/Budapest': 'HU', 'Europe/Dublin': 'IE', 'Europe/Rome': 'IT', 'Europe/Vilnius': 'LT',
  'Europe/Luxembourg': 'LU', 'Europe/Riga': 'LV', 'Europe/Malta': 'MT', 'Europe/Amsterdam': 'NL',
  'Europe/Warsaw': 'PL', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Bucharest': 'RO', 'Europe/Stockholm': 'SE', 'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK', 'Atlantic/Reykjavik': 'IS', 'Europe/Oslo': 'NO', 'Europe/Zurich': 'CH',
};

export function countryFromTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  return TZ_COUNTRY[tz] ?? null;
}

type Labels = Record<CoicopDivision, string>;

const LABELS: Record<string, Labels> = {
  en: {
    TOTAL: 'Everything else', CP01: 'Food and non-alcoholic drinks', CP02: 'Alcohol and tobacco',
    CP03: 'Clothing and footwear', CP04: 'Housing and utilities', CP05: 'Home and furnishings',
    CP06: 'Health', CP07: 'Transport', CP08: 'Phone and internet', CP09: 'Recreation and culture',
    CP10: 'Education', CP11: 'Restaurants and hotels', CP12: 'Insurance and finance',
    CP13: 'Personal care and other',
  },
  pl: {
    TOTAL: 'Pozostałe', CP01: 'Żywność i napoje bezalkoholowe', CP02: 'Alkohol i tytoń',
    CP03: 'Odzież i obuwie', CP04: 'Mieszkanie i media', CP05: 'Wyposażenie domu',
    CP06: 'Zdrowie', CP07: 'Transport', CP08: 'Telefon i internet', CP09: 'Rekreacja i kultura',
    CP10: 'Edukacja', CP11: 'Restauracje i hotele', CP12: 'Ubezpieczenia i finanse',
    CP13: 'Higiena osobista i inne',
  },
  de: {
    TOTAL: 'Sonstiges', CP01: 'Lebensmittel und alkoholfreie Getränke', CP02: 'Alkohol und Tabak',
    CP03: 'Bekleidung und Schuhe', CP04: 'Wohnen und Energie', CP05: 'Haushalt und Einrichtung',
    CP06: 'Gesundheit', CP07: 'Verkehr', CP08: 'Telefon und Internet', CP09: 'Freizeit und Kultur',
    CP10: 'Bildung', CP11: 'Restaurants und Hotels', CP12: 'Versicherungen und Finanzen',
    CP13: 'Körperpflege und Sonstiges',
  },
  es: {
    TOTAL: 'Otros', CP01: 'Alimentos y bebidas no alcohólicas', CP02: 'Alcohol y tabaco',
    CP03: 'Ropa y calzado', CP04: 'Vivienda y suministros', CP05: 'Hogar y muebles',
    CP06: 'Salud', CP07: 'Transporte', CP08: 'Teléfono e internet', CP09: 'Ocio y cultura',
    CP10: 'Educación', CP11: 'Restaurantes y hoteles', CP12: 'Seguros y finanzas',
    CP13: 'Cuidado personal y otros',
  },
  fr: {
    TOTAL: 'Autres', CP01: 'Alimentation et boissons non alcoolisées', CP02: 'Alcool et tabac',
    CP03: 'Habillement et chaussures', CP04: 'Logement et énergie', CP05: 'Maison et ameublement',
    CP06: 'Santé', CP07: 'Transports', CP08: 'Téléphone et internet', CP09: 'Loisirs et culture',
    CP10: 'Enseignement', CP11: 'Restaurants et hôtels', CP12: 'Assurances et finances',
    CP13: 'Soins personnels et divers',
  },
  ru: {
    TOTAL: 'Остальное', CP01: 'Продукты и безалкогольные напитки', CP02: 'Алкоголь и табак',
    CP03: 'Одежда и обувь', CP04: 'Жильё и коммунальные услуги', CP05: 'Дом и обстановка',
    CP06: 'Здоровье', CP07: 'Транспорт', CP08: 'Связь и интернет', CP09: 'Отдых и культура',
    CP10: 'Образование', CP11: 'Рестораны и гостиницы', CP12: 'Страхование и финансы',
    CP13: 'Личный уход и прочее',
  },
  ua: {
    TOTAL: 'Інше', CP01: 'Продукти та безалкогольні напої', CP02: 'Алкоголь і тютюн',
    CP03: 'Одяг і взуття', CP04: 'Житло та комунальні послуги', CP05: 'Дім і облаштування',
    CP06: 'Здоровʼя', CP07: 'Транспорт', CP08: 'Звʼязок та інтернет', CP09: 'Відпочинок і культура',
    CP10: 'Освіта', CP11: 'Ресторани та готелі', CP12: 'Страхування та фінанси',
    CP13: 'Особистий догляд та інше',
  },
  be: {
    TOTAL: 'Астатняе', CP01: 'Прадукты і безалкагольныя напоі', CP02: 'Алкаголь і тытунь',
    CP03: 'Адзенне і абутак', CP04: 'Жыллё і камунальныя паслугі', CP05: 'Дом і абсталяванне',
    CP06: 'Здароўе', CP07: 'Транспарт', CP08: 'Сувязь і інтэрнэт', CP09: 'Адпачынак і культура',
    CP10: 'Адукацыя', CP11: 'Рэстараны і гасцініцы', CP12: 'Страхаванне і фінансы',
    CP13: 'Асабісты догляд і іншае',
  },
  nl: {
    TOTAL: 'Overig', CP01: 'Voeding en frisdrank', CP02: 'Alcohol en tabak',
    CP03: 'Kleding en schoenen', CP04: 'Wonen en energie', CP05: 'Huishouden en inrichting',
    CP06: 'Gezondheid', CP07: 'Vervoer', CP08: 'Telefoon en internet', CP09: 'Recreatie en cultuur',
    CP10: 'Onderwijs', CP11: 'Restaurants en hotels', CP12: 'Verzekeringen en financiën',
    CP13: 'Persoonlijke verzorging en overig',
  },
};

export function divisionLabel(division: CoicopDivision, lang: string): string {
  return (LABELS[lang] ?? LABELS.en)[division];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/coicop.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/coicop.ts apps/api/src/modules/insights/real-salary/__tests__/coicop.spec.ts
git commit -m "Add COICOP 2018 reference data for real salary"
```

---

### Task 4: Pure real-salary calculation

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/real-salary.util.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/real-salary.util.spec.ts`

**Interfaces:**
- Consumes: Task 3 `DIVISIONS`; types `CoicopDivision`, `RealSalaryBreakdownRow`, `RealSalaryStatus`.
- Produces:
  ```ts
  export const RECEIPT_MIN_PRODUCTS = 10;
  export interface SpendByDivision { division: CoicopDivision; amount: number }  // base currency, >0
  export interface InflationInputs {
    spend: SpendByDivision[];
    /** Official annual rates for the user's country, percent; missing divisions absent. Empty = no official data. */
    officialRates: Partial<Record<CoicopDivision, number>>;
    receiptIndexPct: number | null;
    receiptProductCount: number;
  }
  export function computePersonalInflation(i: InflationInputs):
    { inflationPct: number; breakdown: RealSalaryBreakdownRow[]; topDrivers: CoicopDivision[] } | null;
  export function realChange(nominalPct: number, inflationPct: number): { realChangePct: number; requiredRaisePct: number };
  export function round1(x: number): number;   // clean 1-decimal, never -0
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { computePersonalInflation, realChange, round1, RECEIPT_MIN_PRODUCTS } from '../real-salary.util';

const PL = { TOTAL: 3.5, CP01: -0.8, CP04: 5.1, CP07: 5.4, CP11: 4.1 } as const;

describe('computePersonalInflation', () => {
  it('weights official division rates by the account spend', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP04', amount: 3000 }, { division: 'CP07', amount: 1000 }],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    // (3000*5.1 + 1000*5.4) / 4000 = 5.175
    expect(r.inflationPct).toBe(5.2);
    expect(r.breakdown).toEqual([
      { division: 'CP04', weight: 0.75, ratePct: 5.1, source: 'official' },
      { division: 'CP07', weight: 0.25, ratePct: 5.4, source: 'official' },
    ]);
    expect(r.topDrivers).toEqual(['CP04', 'CP07']);
  });

  it('merges repeated divisions before weighting', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP07', amount: 100 }, { division: 'CP07', amount: 300 }],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.breakdown).toEqual([{ division: 'CP07', weight: 1, ratePct: 5.4, source: 'official' }]);
  });

  it(`uses the receipt index for CP01 only from ${RECEIPT_MIN_PRODUCTS} products`, () => {
    const base = { spend: [{ division: 'CP01' as const, amount: 1000 }], officialRates: PL, receiptIndexPct: 8.3 };
    expect(computePersonalInflation({ ...base, receiptProductCount: RECEIPT_MIN_PRODUCTS })!.breakdown[0])
      .toEqual({ division: 'CP01', weight: 1, ratePct: 8.3, source: 'receipts' });
    expect(computePersonalInflation({ ...base, receiptProductCount: RECEIPT_MIN_PRODUCTS - 1 })!.breakdown[0])
      .toEqual({ division: 'CP01', weight: 1, ratePct: -0.8, source: 'official' });
  });

  it('missing division rate falls back to TOTAL', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP13', amount: 500 }], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.breakdown[0]).toEqual({ division: 'CP13', weight: 1, ratePct: 3.5, source: 'official' });
  });

  it('all uncategorized → national total', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'TOTAL', amount: 2000 }], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.inflationPct).toBe(3.5);
  });

  it('receipts-only when there is no official data: only CP01 spend is weighted', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP01', amount: 600 }, { division: 'CP04', amount: 400 }],
      officialRates: {}, receiptIndexPct: 6, receiptProductCount: 25,
    })!;
    expect(r.inflationPct).toBe(6);
    expect(r.breakdown).toEqual([{ division: 'CP01', weight: 1, ratePct: 6, source: 'receipts' }]);
  });

  it('non-EU and thin receipts → no_inflation_source (null)', () => {
    expect(computePersonalInflation({
      spend: [{ division: 'CP01', amount: 600 }], officialRates: {}, receiptIndexPct: 6, receiptProductCount: 3,
    })).toBeNull();
  });

  it('no spend → null', () => {
    expect(computePersonalInflation({ spend: [], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0 })).toBeNull();
  });

  it('topDrivers keeps at most three positive contributors, highest first', () => {
    const r = computePersonalInflation({
      spend: [
        { division: 'CP01', amount: 1000 }, { division: 'CP04', amount: 1000 },
        { division: 'CP07', amount: 1000 }, { division: 'CP11', amount: 1000 }, { division: 'TOTAL', amount: 1000 },
      ],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.topDrivers).toEqual(['CP07', 'CP04', 'CP11']);
  });
});

describe('realChange', () => {
  it('divides rather than subtracts', () => {
    // (1.05 / 1.083) - 1 = -3.047 %; required (1.083/1.05) - 1 = 3.14 %
    expect(realChange(5, 8.3)).toEqual({ realChangePct: -3, requiredRaisePct: 3.1 });
  });
  it('zero/zero gives clean zeros', () => {
    const r = realChange(0, 0);
    expect(Object.is(r.realChangePct, -0)).toBe(false);
    expect(r).toEqual({ realChangePct: 0, requiredRaisePct: 0 });
  });
  it('ahead of inflation gives a negative required raise', () => {
    expect(realChange(10, 4).requiredRaisePct).toBeLessThan(0);
  });
});

describe('round1', () => {
  it('rounds to one decimal and never returns -0', () => {
    expect(round1(3.14159)).toBe(3.1);
    expect(Object.is(round1(-0.04), -0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/api`): `npx jest src/modules/insights/real-salary/__tests__/real-salary.util.spec.ts`
Expected: FAIL — `Cannot find module '../real-salary.util'`.

- [ ] **Step 3: Implement**

```ts
import type { CoicopDivision, RealSalaryBreakdownRow } from '@budget/shared-types';

/** The receipt index replaces official CP01 only when it rests on this many products. */
export const RECEIPT_MIN_PRODUCTS = 10;

export interface SpendByDivision {
  division: CoicopDivision;
  /** Base currency, positive. */
  amount: number;
}

export interface InflationInputs {
  spend: SpendByDivision[];
  /** Official annual rates for the user's country (percent). Empty = no official coverage. */
  officialRates: Partial<Record<CoicopDivision, number>>;
  receiptIndexPct: number | null;
  receiptProductCount: number;
}

export function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Laspeyres-style personal index: Σ(wᵢ·rᵢ)/Σwᵢ over the account's own spend.
 * With official data every division counts (a missing cell falls back to the
 * national TOTAL). Without it (outside Eurostat coverage) only food can be
 * priced — from the receipt index — so only CP01 spend is weighted and the
 * response says "receipts only". Returns null when nothing can be priced.
 */
export function computePersonalInflation(
  i: InflationInputs,
): { inflationPct: number; breakdown: RealSalaryBreakdownRow[]; topDrivers: CoicopDivision[] } | null {
  const receiptsOk = i.receiptIndexPct !== null && i.receiptProductCount >= RECEIPT_MIN_PRODUCTS;
  const hasOfficial = i.officialRates.TOTAL !== undefined;

  const totals = new Map<CoicopDivision, number>();
  for (const row of i.spend) {
    if (!(row.amount > 0)) continue;
    totals.set(row.division, (totals.get(row.division) ?? 0) + row.amount);
  }

  const rows: { division: CoicopDivision; amount: number; ratePct: number; source: 'official' | 'receipts' }[] = [];
  for (const [division, amount] of totals) {
    if (division === 'CP01' && receiptsOk) {
      rows.push({ division, amount, ratePct: i.receiptIndexPct as number, source: 'receipts' });
    } else if (hasOfficial) {
      const rate = i.officialRates[division] ?? (i.officialRates.TOTAL as number);
      rows.push({ division, amount, ratePct: rate, source: 'official' });
    }
  }
  if (rows.length === 0) return null;

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const inflation = rows.reduce((s, r) => s + r.amount * r.ratePct, 0) / sum;

  const ordered = [...rows].sort((a, b) => (a.division < b.division ? -1 : a.division > b.division ? 1 : 0));
  const breakdown = ordered.map((r) => ({
    division: r.division,
    weight: Math.round((r.amount / sum) * 1000) / 1000,
    ratePct: round1(r.ratePct),
    source: r.source,
  }));
  const topDrivers = rows
    .filter((r) => r.division !== 'TOTAL' && r.ratePct > 0)
    .sort((a, b) => b.amount * b.ratePct - a.amount * a.ratePct)
    .slice(0, 3)
    .map((r) => r.division);

  return { inflationPct: round1(inflation), breakdown, topDrivers };
}

/** Real change divides (the honest formula); required raise is on CURRENT pay. */
export function realChange(nominalPct: number, inflationPct: number): { realChangePct: number; requiredRaisePct: number } {
  const n = 1 + nominalPct / 100;
  const p = 1 + inflationPct / 100;
  return {
    realChangePct: round1((n / p - 1) * 100),
    requiredRaisePct: round1((p / n - 1) * 100),
  };
}
```

Note: `breakdown` is ordered by division code (`CP01 … CP13`, then `TOTAL`) so the response is stable; the test's first case lists CP04 before CP07, which matches.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary.util.spec.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/real-salary.util.ts apps/api/src/modules/insights/real-salary/__tests__/real-salary.util.spec.ts
git commit -m "Add the pure personal-inflation and real-change calculation"
```

---

### Task 5: Pure salary detection

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/salary-detect.util.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/salary-detect.util.spec.ts`

**Interfaces:**
- Consumes: type `SalaryCandidate`.
- Produces:
  ```ts
  export interface IncomeRow {
    amount: number; currencyCode: string; date: Date; description: string | null;
    categoryId: string | null; categoryName: string | null;
    isDebt: boolean; isDebtRepayment: boolean; clientId: string;
  }
  export function descriptionKey(description: string | null): string;
  export function salaryKeyOf(row: Pick<IncomeRow, 'categoryId' | 'description' | 'currencyCode'>): string;
  export function isSalaryEligible(row: IncomeRow): boolean;
  export function findSalaryCandidates(rows: IncomeRow[], now: Date): SalaryCandidate[];
  export function nominalChange(input: {
    rows: IncomeRow[]; salaryKey: string; now: Date; baseCurrency: string;
    convert: (amount: number, from: string) => number | null;
    manualPreviousMonthly: number | null;
  }): { nominalChangePct: number | null; fxApproximate: boolean };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import {
  descriptionKey, salaryKeyOf, isSalaryEligible, findSalaryCandidates, nominalChange, type IncomeRow,
} from '../salary-detect.util';

const NOW = new Date('2026-09-26T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const row = (o: Partial<IncomeRow> & { date: Date; amount: number }): IncomeRow => ({
  currencyCode: 'PLN', description: 'Wynagrodzenie ACME', categoryId: 'cat-salary', categoryName: 'Salary',
  isDebt: false, isDebtRepayment: false, clientId: 'c-' + o.date.toISOString(), ...o,
});
const monthly = (fromYm: string, months: number, amount: number, extra: Partial<IncomeRow> = {}) => {
  const [y, m] = fromYm.split('-').map(Number);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 10));
    return row({ date: d, amount, ...extra });
  });
};
const same = (a: number, from: string) => (from === 'PLN' ? a : null);

describe('descriptionKey / salaryKeyOf', () => {
  it('normalises case, digits and whitespace so monthly references do not split the series', () => {
    expect(descriptionKey('  Wynagrodzenie 09/2026  ACME ')).toBe('wynagrodzenie acme');
    expect(descriptionKey(null)).toBe('');
    expect(salaryKeyOf({ categoryId: 'c1', description: 'Salary 08', currencyCode: 'EUR' })).toBe('c1|salary|EUR');
    expect(salaryKeyOf({ categoryId: null, description: 'x', currencyCode: 'PLN' })).toBe('|x|PLN');
  });
});

describe('isSalaryEligible', () => {
  it('drops debts, repayments and transfers counted as income', () => {
    const base = row({ date: day('2026-09-10'), amount: 100 });
    expect(isSalaryEligible(base)).toBe(true);
    expect(isSalaryEligible({ ...base, isDebt: true })).toBe(false);
    expect(isSalaryEligible({ ...base, isDebtRepayment: true })).toBe(false);
    expect(isSalaryEligible({ ...base, clientId: 'transfer-income-abc' })).toBe(false);
    expect(isSalaryEligible({ ...base, amount: 0 })).toBe(false);
  });
});

describe('findSalaryCandidates', () => {
  it('finds a monthly series even when the amount changes (a raise must not split it)', () => {
    const rows = [
      row({ date: day('2026-07-10'), amount: 8000 }),
      row({ date: day('2026-08-10'), amount: 8400 }),
      row({ date: day('2026-09-10'), amount: 8400 }),
    ];
    const c = findSalaryCandidates(rows, NOW);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ key: 'cat-salary|wynagrodzenie acme|PLN', occurrences: 3, currencyCode: 'PLN' });
    expect(c[0].typicalAmount).toBe(8266.67);
  });

  it('ignores irregular income and anything older than 90 days', () => {
    const rows = [
      row({ date: day('2026-09-01'), amount: 50, description: 'Refund' }),
      row({ date: day('2026-09-05'), amount: 60, description: 'Refund' }),
      row({ date: day('2026-03-10'), amount: 8000 }),
      row({ date: day('2026-04-10'), amount: 8000 }),
    ];
    expect(findSalaryCandidates(rows, NOW)).toEqual([]);
  });

  it('orders several candidates by typical amount, largest first', () => {
    const rows = [
      ...monthly('2026-07', 3, 8000),
      ...monthly('2026-07', 3, 1200, { description: 'Najem mieszkania', categoryId: 'cat-rent' }),
    ];
    expect(findSalaryCandidates(rows, NOW).map((c) => c.categoryId)).toEqual(['cat-salary', 'cat-rent']);
  });
});

describe('nominalChange', () => {
  const key = 'cat-salary|wynagrodzenie acme|PLN';

  it('compares the mean monthly salary of the last 12 months with the 12 before', () => {
    const rows = [...monthly('2024-10', 12, 8000), ...monthly('2025-10', 12, 8400)];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: null }))
      .toEqual({ nominalChangePct: 5, fxApproximate: false });
  });

  it('uses the manual previous salary when the prior year is too thin', () => {
    const rows = monthly('2026-04', 6, 8400);
    expect(nominalChange({ rows, salaryKey: key, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: 8000 }))
      .toEqual({ nominalChangePct: 5, fxApproximate: false });
  });

  it('returns null when the prior year is thin and there is no manual figure', () => {
    const rows = monthly('2026-04', 6, 8400);
    expect(nominalChange({ rows, salaryKey: key, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: null }).nominalChangePct)
      .toBeNull();
  });

  it('counts two payments in one month as one month of salary', () => {
    const rows = [
      ...monthly('2024-10', 12, 8000),
      ...monthly('2025-10', 12, 4200),
      ...monthly('2025-10', 12, 4200).map((r) => ({ ...r, date: new Date(r.date.getTime() + 14 * 86400000) })),
    ];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(5);
  });

  it('salary rows with no rate are excluded, not counted as zero', () => {
    const rows = [...monthly('2024-10', 12, 2000, { currencyCode: 'EUR' }), ...monthly('2025-10', 12, 2100, { currencyCode: 'EUR' })];
    const eurKey = 'cat-salary|wynagrodzenie acme|EUR';
    expect(nominalChange({ rows, salaryKey: eurKey, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: null }))
      .toEqual({ nominalChangePct: null, fxApproximate: true });
  });

  it('ignores rows that do not belong to the confirmed key', () => {
    const rows = [...monthly('2024-10', 12, 8000), ...monthly('2025-10', 12, 8400), ...monthly('2025-10', 12, 99999, { description: 'Bonus' })];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, baseCurrency: 'PLN', convert: same, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/salary-detect.util.spec.ts`
Expected: FAIL — `Cannot find module '../salary-detect.util'`.

- [ ] **Step 3: Implement**

```ts
import type { SalaryCandidate } from '@budget/shared-types';
import { round1 } from './real-salary.util';

export interface IncomeRow {
  amount: number;
  currencyCode: string;
  date: Date;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isDebt: boolean;
  isDebtRepayment: boolean;
  clientId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;
const GAP_MIN = 25;
const GAP_MAX = 35;
const MIN_OCCURRENCES = 2;
/** A window needs this many months with salary to count as a year of pay. */
const MIN_MONTHS_PER_WINDOW = 3;

/** Digits and punctuation vary month to month ("Salary 09/2026") — drop them. */
export function descriptionKey(description: string | null): string {
  return (description ?? '')
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Category + description + currency — never amount, so a raise keeps one series. */
export function salaryKeyOf(r: Pick<IncomeRow, 'categoryId' | 'description' | 'currencyCode'>): string {
  return `${r.categoryId ?? ''}|${descriptionKey(r.description)}|${r.currencyCode}`;
}

export function isSalaryEligible(r: IncomeRow): boolean {
  return r.amount > 0 && !r.isDebt && !r.isDebtRepayment && !r.clientId.startsWith('transfer-income-');
}

export function findSalaryCandidates(rows: IncomeRow[], now: Date): SalaryCandidate[] {
  const since = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const groups = new Map<string, IncomeRow[]>();
  for (const r of rows) {
    if (!isSalaryEligible(r) || r.date.getTime() < since || r.date.getTime() > now.getTime()) continue;
    const k = salaryKeyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const out: SalaryCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.length < MIN_OCCURRENCES) continue;
    g.sort((a, b) => a.date.getTime() - b.date.getTime());
    let monthly = true;
    for (let i = 1; i < g.length; i++) {
      const gap = (g[i].date.getTime() - g[i - 1].date.getTime()) / DAY_MS;
      if (gap < GAP_MIN || gap > GAP_MAX) { monthly = false; break; }
    }
    if (!monthly) continue;
    const mean = g.reduce((s, r) => s + r.amount, 0) / g.length;
    out.push({
      key,
      categoryId: g[0].categoryId,
      categoryName: g[0].categoryName,
      descriptionKey: descriptionKey(g[0].description),
      currencyCode: g[0].currencyCode,
      typicalAmount: Math.round(mean * 100) / 100,
      occurrences: g.length,
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/** Mean monthly salary over months that had a salary payment; null below the minimum. */
function windowMean(
  rows: IncomeRow[], from: number, to: number, convert: (a: number, c: string) => number | null,
): { mean: number | null; fxMissing: boolean } {
  const perMonth = new Map<string, number>();
  let fxMissing = false;
  for (const r of rows) {
    const t = r.date.getTime();
    if (t < from || t >= to) continue;
    const v = convert(r.amount, r.currencyCode);
    if (v === null) { fxMissing = true; continue; }
    const ym = `${r.date.getUTCFullYear()}-${r.date.getUTCMonth()}`;
    perMonth.set(ym, (perMonth.get(ym) ?? 0) + v);
  }
  if (perMonth.size < MIN_MONTHS_PER_WINDOW) return { mean: null, fxMissing };
  let sum = 0;
  for (const v of perMonth.values()) sum += v;
  return { mean: sum / perMonth.size, fxMissing };
}

/**
 * Nominal pay change: mean monthly salary of the last 12 months vs the 12 before
 * (or vs the user's manual "a year ago" figure when the prior window is thin).
 * Amounts are converted to the base currency; a row with no rate is excluded and
 * flags fxApproximate — it never counts as zero.
 */
export function nominalChange(input: {
  rows: IncomeRow[];
  salaryKey: string;
  now: Date;
  baseCurrency: string;
  convert: (amount: number, from: string) => number | null;
  manualPreviousMonthly: number | null;
}): { nominalChangePct: number | null; fxApproximate: boolean } {
  const mine = input.rows.filter((r) => isSalaryEligible(r) && salaryKeyOf(r) === input.salaryKey);
  const end = input.now.getTime() + DAY_MS;
  const mid = end - 365 * DAY_MS;
  const start = mid - 365 * DAY_MS;

  const cur = windowMean(mine, mid, end, input.convert);
  const prev = windowMean(mine, start, mid, input.convert);
  const fxApproximate = cur.fxMissing || prev.fxMissing;

  const previous = prev.mean ?? (input.manualPreviousMonthly && input.manualPreviousMonthly > 0 ? input.manualPreviousMonthly : null);
  if (cur.mean === null || previous === null) return { nominalChangePct: null, fxApproximate };
  return { nominalChangePct: round1((cur.mean / previous - 1) * 100), fxApproximate };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/salary-detect.util.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/salary-detect.util.ts apps/api/src/modules/insights/real-salary/__tests__/salary-detect.util.spec.ts
git commit -m "Add salary detection grouped by category and description, not amount"
```

---

### Task 6: Eurostat client (JSON-stat parsing)

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/eurostat.client.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/eurostat.client.spec.ts`

**Interfaces:**
- Consumes: Task 3 `DIVISIONS`, `isDivision`, `isEurostatCountry`.
- Produces:
  ```ts
  export interface OfficialRateRow { country: string; division: CoicopDivision; month: string; annualRatePct: number }
  export const EUROSTAT_URL: string;
  export function parseJsonStat(body: unknown): OfficialRateRow[];
  @Injectable() export class EurostatClient { fetchLatest(fetchImpl?: typeof fetch): Promise<OfficialRateRow[]> }
  ```

- [ ] **Step 1: Write the failing test**

The fixture is a trimmed copy of a real `prc_hicp_minr` response (shape verified 2026-09-26): dimensions in `id` order, `value` keyed by the flat row-major index, absent keys = no data.

```ts
import { parseJsonStat, EurostatClient, EUROSTAT_URL } from '../eurostat.client';

const FIXTURE = {
  id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
  size: [1, 1, 3, 3, 1],
  dimension: {
    freq: { category: { index: { M: 0 } } },
    unit: { category: { index: { RCH_A: 0 } } },
    coicop18: { category: { index: { TOTAL: 0, CP01: 1, CP13: 2 } } },
    geo: { category: { index: { PL: 0, EU27_2020: 1, UA: 2 } } },
    time: { category: { index: { '2026-08': 0 } } },
  },
  // flat index = ((coicop * 3) + geo) — freq/unit/time have size 1
  value: { '0': 3.5, '1': 2.4, '3': -0.8, '6': 3.2, '4': 1.9 },
};

describe('parseJsonStat', () => {
  it('reads country × division rows and skips aggregates, unknown countries and empty cells', () => {
    expect(parseJsonStat(FIXTURE)).toEqual([
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      { country: 'PL', division: 'CP01', month: '2026-08', annualRatePct: -0.8 },
      { country: 'PL', division: 'CP13', month: '2026-08', annualRatePct: 3.2 },
    ]);
  });

  it('accepts an array-form category index', () => {
    const arrayForm = {
      ...FIXTURE,
      dimension: { ...FIXTURE.dimension, coicop18: { category: { index: ['TOTAL', 'CP01', 'CP13'] } } },
    };
    expect(parseJsonStat(arrayForm)).toHaveLength(3);
  });

  it('returns [] for an error body or garbage', () => {
    expect(parseJsonStat({ error: [{ status: 404 }] })).toEqual([]);
    expect(parseJsonStat(null)).toEqual([]);
    expect(parseJsonStat({ id: ['geo'], size: [1] })).toEqual([]);
  });
});

describe('EurostatClient', () => {
  it('requests the COICOP 2018 dataset and parses the body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => FIXTURE });
    const rows = await new EurostatClient().fetchLatest(fetchImpl as any);
    expect(rows).toHaveLength(3);
    const url: string = fetchImpl.mock.calls[0][0];
    expect(url.startsWith(EUROSTAT_URL)).toBe(true);
    expect(url).toContain('prc_hicp_minr');
    expect(url).toContain('unit=RCH_A');
    expect(url).toContain('coicop18=TOTAL');
    expect(url).toContain('coicop18=CP13');
    expect(url).toContain('lastTimePeriod=1');
  });

  it('throws on a non-2xx so the caller keeps its last stored month', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(new EurostatClient().fetchLatest(fetchImpl as any)).rejects.toThrow('503');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/eurostat.client.spec.ts`
Expected: FAIL — `Cannot find module '../eurostat.client'`.

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import type { CoicopDivision } from '@budget/shared-types';
import { DIVISIONS, isDivision, isEurostatCountry } from './coicop';

export interface OfficialRateRow {
  country: string;
  division: CoicopDivision;
  month: string;
  annualRatePct: number;
}

export const EUROSTAT_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

type CategoryIndex = Record<string, number> | string[];

function positions(index: CategoryIndex | undefined): Map<number, string> | null {
  if (!index) return null;
  const m = new Map<number, string>();
  if (Array.isArray(index)) index.forEach((code, i) => m.set(i, code));
  else for (const [code, i] of Object.entries(index)) m.set(i, code);
  return m;
}

/**
 * JSON-stat 2.0 → rows. `value` is keyed by the row-major flat index over
 * `size`, in `id` order; an absent key means "no observation". Only single
 * countries we support survive (aggregates like EU27_2020 are dropped).
 */
export function parseJsonStat(body: unknown): OfficialRateRow[] {
  const b = body as {
    id?: string[]; size?: number[]; value?: Record<string, number | null>;
    dimension?: Record<string, { category?: { index?: CategoryIndex } }>;
  } | null;
  if (!b || !Array.isArray(b.id) || !Array.isArray(b.size) || !b.value || !b.dimension) return [];
  const dims = b.id;
  const need = ['coicop18', 'geo', 'time'];
  if (!need.every((d) => dims.includes(d))) return [];

  const maps = dims.map((d) => positions(b.dimension![d]?.category?.index));
  if (maps.some((m) => m === null)) return [];

  const rows: OfficialRateRow[] = [];
  for (const [flatKey, raw] of Object.entries(b.value)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    let rest = Number(flatKey);
    const coord: string[] = new Array(dims.length);
    for (let i = dims.length - 1; i >= 0; i--) {
      const size = b.size[i];
      coord[i] = maps[i]!.get(rest % size) ?? '';
      rest = Math.floor(rest / size);
    }
    const division = coord[dims.indexOf('coicop18')];
    const country = coord[dims.indexOf('geo')];
    const month = coord[dims.indexOf('time')];
    if (!isDivision(division) || !isEurostatCountry(country) || !/^\d{4}-\d{2}$/.test(month)) continue;
    rows.push({ country, division, month, annualRatePct: raw });
  }
  const order = (d: CoicopDivision) => DIVISIONS.indexOf(d);
  return rows.sort((a, c) =>
    a.country.localeCompare(c.country) || order(a.division) - order(c.division) || a.month.localeCompare(c.month),
  );
}

@Injectable()
export class EurostatClient {
  /** Latest published month, all countries, TOTAL + CP01..CP13. Throws on HTTP failure. */
  async fetchLatest(fetchImpl: typeof fetch = fetch): Promise<OfficialRateRow[]> {
    const params = new URLSearchParams({ format: 'JSON', lang: 'EN', unit: 'RCH_A', lastTimePeriod: '1' });
    for (const d of DIVISIONS) params.append('coicop18', d);
    const res = await fetchImpl(`${EUROSTAT_URL}prc_hicp_minr?${params.toString()}`);
    if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}`);
    return parseJsonStat(await res.json());
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/eurostat.client.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/eurostat.client.ts apps/api/src/modules/insights/real-salary/__tests__/eurostat.client.spec.ts
git commit -m "Add the Eurostat HICP client with JSON-stat parsing"
```

---

### Task 7: Official inflation store + cron

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/official-inflation.service.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/official-inflation.service.spec.ts`

**Interfaces:**
- Consumes: Task 6 `EurostatClient`, `OfficialRateRow`; `PrismaService` (`../../../database/prisma.service`), `logFireAndForget` (`../../../common/utils/fire-and-forget`).
- Produces:
  ```ts
  @Injectable() export class OfficialInflationService implements OnApplicationBootstrap {
    refresh(): Promise<number>;                                 // rows upserted; throws never
    latestFor(country: string): Promise<{ month: string; rates: Partial<Record<CoicopDivision, number>> } | null>;
    @Cron('0 6 1,15 * *') scheduledRefresh(): Promise<void>;
    onApplicationBootstrap(): void;                             // fills an empty table, fire-and-forget
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { OfficialInflationService } from '../official-inflation.service';

function make(opts: { rows?: any[]; fetchError?: Error; stored?: any[]; count?: number } = {}) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma: any = {
    officialInflationRate: {
      upsert,
      count: jest.fn().mockResolvedValue(opts.count ?? 1),
      findFirst: jest.fn().mockResolvedValue(opts.stored?.[0] ?? null),
      findMany: jest.fn().mockResolvedValue(opts.stored ?? []),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const client: any = {
    fetchLatest: opts.fetchError ? jest.fn().mockRejectedValue(opts.fetchError) : jest.fn().mockResolvedValue(opts.rows ?? []),
  };
  return { svc: new OfficialInflationService(prisma, client), prisma, client, upsert };
}

describe('OfficialInflationService', () => {
  it('upserts every fetched row keyed by country+division+month', async () => {
    const rows = [
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      { country: 'PL', division: 'CP01', month: '2026-08', annualRatePct: -0.8 },
    ];
    const { svc, upsert } = make({ rows });
    await expect(svc.refresh()).resolves.toBe(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { country_division_month: { country: 'PL', division: 'TOTAL', month: '2026-08' } },
      create: { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      update: { annualRatePct: 3.5, fetchedAt: expect.any(Date) },
    });
  });

  it('a failed fetch keeps the stored data and does not throw', async () => {
    const { svc, upsert } = make({ fetchError: new Error('Eurostat HTTP 503') });
    await expect(svc.refresh()).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('latestFor returns the newest month for the country as a division map', async () => {
    const stored = [
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: '3.50' },
      { country: 'PL', division: 'CP04', month: '2026-08', annualRatePct: '5.10' },
    ];
    const { svc, prisma } = make({ stored });
    await expect(svc.latestFor('PL')).resolves.toEqual({ month: '2026-08', rates: { TOTAL: 3.5, CP04: 5.1 } });
    expect(prisma.officialInflationRate.findFirst).toHaveBeenCalledWith({
      where: { country: 'PL' }, orderBy: { month: 'desc' }, select: { month: true },
    });
  });

  it('latestFor is null when nothing is stored for the country', async () => {
    const { svc } = make({ stored: [] });
    await expect(svc.latestFor('PL')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/official-inflation.service.spec.ts`
Expected: FAIL — `Cannot find module '../official-inflation.service'`.

- [ ] **Step 3: Implement**

```ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { CoicopDivision } from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { EurostatClient } from './eurostat.client';
import { isDivision } from './coicop';

/**
 * The only writer of official_inflation_rates. User requests read it and never
 * call Eurostat, so an outage there only means the data is a month older — the
 * response carries `dataMonth` to make that visible.
 */
@Injectable()
export class OfficialInflationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OfficialInflationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eurostat: EurostatClient,
  ) {}

  /** A fresh deploy must not wait up to two weeks for the first cron run. */
  onApplicationBootstrap(): void {
    void this.prisma.officialInflationRate
      .count()
      .then((n) => (n === 0 ? this.refresh() : 0))
      .catch(logFireAndForget(this.logger, 'OfficialInflationService.bootstrapFill'));
  }

  /** Eurostat publishes mid-month; the 1st and 15th catch every release within ~2 weeks. */
  @Cron('0 6 1,15 * *')
  async scheduledRefresh(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<number> {
    let rows;
    try {
      rows = await this.eurostat.fetchLatest();
    } catch (e) {
      this.logger.warn(`Eurostat refresh failed, keeping stored data: ${String(e)}`);
      return 0;
    }
    if (rows.length === 0) {
      this.logger.warn('Eurostat refresh returned no rows, keeping stored data');
      return 0;
    }
    const now = new Date();
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.officialInflationRate.upsert({
          where: { country_division_month: { country: r.country, division: r.division, month: r.month } },
          create: { country: r.country, division: r.division, month: r.month, annualRatePct: r.annualRatePct },
          update: { annualRatePct: r.annualRatePct, fetchedAt: now },
        }),
      ),
    );
    this.logger.log(`Eurostat refresh stored ${rows.length} rows`);
    return rows.length;
  }

  async latestFor(country: string): Promise<{ month: string; rates: Partial<Record<CoicopDivision, number>> } | null> {
    const latest = await this.prisma.officialInflationRate.findFirst({
      where: { country },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (!latest) return null;
    const rows = await this.prisma.officialInflationRate.findMany({
      where: { country, month: latest.month },
      select: { division: true, annualRatePct: true },
    });
    const rates: Partial<Record<CoicopDivision, number>> = {};
    for (const r of rows) if (isDivision(r.division)) rates[r.division] = Number(r.annualRatePct);
    return { month: latest.month, rates };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/official-inflation.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/official-inflation.service.ts apps/api/src/modules/insights/real-salary/__tests__/official-inflation.service.spec.ts
git commit -m "Store official HICP rates from Eurostat on a twice-monthly cron"
```

---

### Task 8: COICOP classifier

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/coicop-classifier.service.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/coicop-classifier.service.spec.ts`

**Interfaces:**
- Consumes: Task 3 `divisionForSeedIcon`, `isDivision`, `DIVISIONS`; `PrismaService`; `ConfigService`; `CHEAP_MODEL` from `../../ai/services/model-resolver`.
- Produces:
  ```ts
  export const CLASSIFY_BATCH = 50;
  @Injectable() export class CoicopClassifierService {
    constructor(prisma: PrismaService, config: ConfigService, openai?: OpenAILike | null);
    /** Fills coicopDivision for the account's expense categories that have none. Never throws. */
    ensureClassified(accountId: string): Promise<void>;
  }
  export type OpenAILike = { chat: { completions: { create(args: any): Promise<any> } } };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { CoicopClassifierService, CLASSIFY_BATCH } from '../coicop-classifier.service';

function make(cats: any[], modelJson?: unknown, fail = false) {
  const update = jest.fn().mockResolvedValue({});
  const prisma: any = {
    category: { findMany: jest.fn().mockResolvedValue(cats), update },
  };
  const create = fail
    ? jest.fn().mockRejectedValue(new Error('openai down'))
    : jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(modelJson ?? {}) } }] });
  const openai = { chat: { completions: { create } } };
  const config: any = { get: jest.fn() };
  return { svc: new CoicopClassifierService(prisma, config, openai), prisma, update, create };
}

describe('CoicopClassifierService', () => {
  it('maps seed icons without calling the model', async () => {
    const { svc, update, create } = make([{ id: 'c1', name: 'Groceries', icon: '🛒' }]);
    await svc.ensureClassified('acc');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP01' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model with category NAMES only and stores valid answers', async () => {
    const { svc, update, create } = make(
      [{ id: 'c1', name: 'Czynsz', icon: '🏠' }, { id: 'c2', name: 'Kot', icon: null }],
      { '0': 'CP04', '1': 'CP13' },
    );
    await svc.ensureClassified('acc');
    const prompt: string = create.mock.calls[0][0].messages.map((m: any) => m.content).join('\n');
    expect(prompt).toContain('0: Czynsz');
    expect(prompt).toContain('1: Kot');
    expect(prompt).not.toMatch(/\d+[.,]\d{2}/); // no amounts
    expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP04' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'CP13' } });
  });

  it('stores TOTAL for an invented or missing answer so it is never re-asked', async () => {
    const { svc, update } = make([{ id: 'c1', name: 'Misc', icon: null }, { id: 'c2', name: 'X', icon: null }], { '0': 'CP99' });
    await svc.ensureClassified('acc');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'TOTAL' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'TOTAL' } });
  });

  it('leaves categories unclassified when the model call fails (retried next time)', async () => {
    const { svc, update } = make([{ id: 'c1', name: 'Misc', icon: null }], undefined, true);
    await expect(svc.ensureClassified('acc')).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it(`queries at most ${CLASSIFY_BATCH} unclassified expense categories of the account`, async () => {
    const { svc, prisma } = make([]);
    await svc.ensureClassified('acc');
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc', type: 'expense', isDeleted: false, coicopDivision: null },
      select: { id: true, name: true, icon: true },
      take: CLASSIFY_BATCH,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/coicop-classifier.service.spec.ts`
Expected: FAIL — `Cannot find module '../coicop-classifier.service'`.

- [ ] **Step 3: Implement**

```ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CHEAP_MODEL } from '../../ai/services/model-resolver';
import { DIVISIONS, divisionForSeedIcon, isDivision } from './coicop';

export const CLASSIFY_BATCH = 50;
export type OpenAILike = { chat: { completions: { create(args: any): Promise<any> } } };

const SYSTEM = `You map personal-finance expense category names to COICOP 2018 divisions.
Answer with a JSON object mapping each given index to one code from:
${DIVISIONS.join(', ')}.
CP01 food & non-alcoholic drinks, CP02 alcohol & tobacco, CP03 clothing & footwear,
CP04 housing, rent & utilities, CP05 furnishings & household, CP06 health, CP07 transport,
CP08 phone, internet & digital subscriptions, CP09 recreation, culture & holidays,
CP10 education, CP11 restaurants & accommodation, CP12 insurance & financial services,
CP13 personal care & miscellaneous. Use TOTAL when a name fits no single division.`;

/**
 * Gives each expense category a COICOP division once. Seed categories are
 * mapped by icon; the rest by a cheap model that sees ONLY the names. Every
 * answer is stored — an invalid or missing one as TOTAL — so a category is asked
 * about at most once; a failed call leaves it null to retry on the next request.
 * Not charged to the user's AI limit: one tiny call per account, ever.
 */
@Injectable()
export class CoicopClassifierService {
  private readonly logger = new Logger(CoicopClassifierService.name);
  private readonly openai: OpenAILike | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Optional() openai?: OpenAILike | null,
  ) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.openai = openai ?? (key ? (new OpenAI({ apiKey: key }) as unknown as OpenAILike) : null);
  }

  async ensureClassified(accountId: string): Promise<void> {
    try {
      const cats = await this.prisma.category.findMany({
        where: { accountId, type: 'expense', isDeleted: false, coicopDivision: null },
        select: { id: true, name: true, icon: true },
        take: CLASSIFY_BATCH,
      });
      const rest: { id: string; name: string }[] = [];
      for (const c of cats) {
        const d = divisionForSeedIcon(c.icon);
        if (d) await this.prisma.category.update({ where: { id: c.id }, data: { coicopDivision: d } });
        else rest.push(c);
      }
      if (rest.length === 0 || !this.openai) return;

      let answer: Record<string, unknown>;
      try {
        const res = await this.openai.chat.completions.create({
          model: CHEAP_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: rest.map((c, i) => `${i}: ${c.name}`).join('\n') },
          ],
        });
        answer = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      } catch (e) {
        this.logger.warn(`COICOP classification failed, will retry: ${String(e)}`);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        const v = answer[String(i)];
        await this.prisma.category.update({
          where: { id: rest[i].id },
          data: { coicopDivision: isDivision(v) ? v : 'TOTAL' },
        });
      }
    } catch (e) {
      this.logger.warn(`COICOP classification skipped: ${String(e)}`);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/coicop-classifier.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/coicop-classifier.service.ts apps/api/src/modules/insights/real-salary/__tests__/coicop-classifier.service.spec.ts
git commit -m "Classify expense categories into COICOP divisions from their names"
```

---

### Task 9: RealSalaryService (assembly, profile, categories, cache)

**Files:**
- Create: `apps/api/src/modules/insights/real-salary/real-salary.service.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/real-salary.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–8; `CacheService` (`../../../common/cache/cache.service`: `get<T>(key)`, `set(key, value, ttlSec)`, `delByPrefix(prefix)`), `ExchangeRateService` (`../../currency-exchange/exchange-rate.service`), `PriceHistoryService` (`../../price-history/price-history.service`), `getRatesSafe`/`convertAmount` (`../../../common/utils/fx`), `attributeToCategories` (`../../../common/utils/category-attribution`).
- Produces:
  ```ts
  export function realSalaryCacheKey(accountId: string, currency: string): string;   // `rs:${accountId}:${currency}`
  @Injectable() export class RealSalaryService {
    compute(accountId: string, userId: string, baseCurrency: string): Promise<RealSalaryResponse>;
    getProfile(accountId: string, userId: string): Promise<RealSalaryProfileResponse>;
    saveProfile(accountId: string, userId: string, dto: SalaryProfileDto): Promise<SalaryProfileDto>;
    listCategories(accountId: string): Promise<RealSalaryCategoryRow[]>;
    bustAccount(accountId: string): Promise<void>;
    bustUser(userId: string): Promise<void>;          // every account the user is a member of
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { RealSalaryService, realSalaryCacheKey } from '../real-salary.service';

const NOW = new Date();
const monthsAgo = (n: number, day = 10) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - n, day));
const salary = (n: number, amount: number) => ({
  amount, currencyCode: 'PLN', date: monthsAgo(n), description: 'Wynagrodzenie ACME',
  categoryId: 'cat-sal', category: { name: 'Salary' }, isDebt: false, isDebtRepayment: false, clientId: `s${n}`,
});
const KEY = 'cat-sal|wynagrodzenie acme|PLN';

function make(o: {
  encryptionTier?: number; profile?: any; incomes?: any[]; expenses?: any[]; timezone?: string;
  inflationCountry?: string | null; official?: any; receipt?: { inflationIndex: number | null; productCount: number };
  cached?: any;
} = {}) {
  const cacheSet = jest.fn();
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: o.encryptionTier ?? 0 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ timezone: o.timezone ?? 'Europe/Warsaw', inflationCountry: o.inflationCountry ?? null }) },
    salaryProfile: {
      findUnique: jest.fn().mockResolvedValue(o.profile ?? null),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ ...create })),
    },
    income: { findMany: jest.fn().mockResolvedValue(o.incomes ?? []) },
    expense: { findMany: jest.fn().mockResolvedValue(o.expenses ?? []) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    accountMember: { findMany: jest.fn().mockResolvedValue([{ accountId: 'acc' }, { accountId: 'acc2' }]) },
  };
  const cache: any = { get: jest.fn().mockResolvedValue(o.cached ?? null), set: cacheSet, delByPrefix: jest.fn() };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: {} }) };
  const priceHistory: any = { getPriceHistory: jest.fn().mockResolvedValue(o.receipt ?? { inflationIndex: null, productCount: 0 }) };
  const official: any = { latestFor: jest.fn().mockResolvedValue(o.official === undefined ? { month: '2026-08', rates: { TOTAL: 3.5, CP04: 5.1 } } : o.official) };
  const classifier: any = { ensureClassified: jest.fn().mockResolvedValue(undefined) };
  const svc = new RealSalaryService(prisma, cache, fx, priceHistory, official, classifier);
  return { svc, prisma, cache, cacheSet, official, classifier };
}

const spend = Array.from({ length: 6 }, (_, i) => ({
  amount: 1000, currencyCode: 'PLN', date: monthsAgo(i + 1), categoryId: 'cat-rent',
  category: { id: 'cat-rent', name: 'Rent', coicopDivision: 'CP04' }, categorySplits: [],
}));

describe('RealSalaryService.compute', () => {
  it('encrypted accounts get status encrypted and nothing is queried', async () => {
    const { svc, prisma } = make({ encryptionTier: 2 });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('encrypted');
    expect(prisma.income.findMany).not.toHaveBeenCalled();
  });

  it('no confirmed salary → no_salary_confirmed', async () => {
    const { svc } = make({ expenses: spend });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('no_salary_confirmed');
  });

  it('short salary history without a manual figure → salary_history_short', async () => {
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: null },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('salary_history_short');
  });

  it('under 3 months of spend → spend_under_3_months', async () => {
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend.slice(0, 2),
    });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('spend_under_3_months');
  });

  it('ready: nominal from salary, inflation from official rates, cached', async () => {
    const { svc, cacheSet, official, classifier } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r).toMatchObject({
      status: 'ready', country: 'PL', countryGuessed: true, dataMonth: '2026-08',
      nominalChangePct: 5, personalInflationPct: 5.1, realChangePct: -0.1, requiredRaisePct: 0.1,
    });
    expect(official.latestFor).toHaveBeenCalledWith('PL');
    expect(classifier.ensureClassified).toHaveBeenCalledWith('acc');
    expect(cacheSet).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'PLN'), r, 3600);
  });

  it('an explicit country beats the timezone guess', async () => {
    const { svc, official } = make({
      inflationCountry: 'DE', profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(official.latestFor).toHaveBeenCalledWith('DE');
    expect(r.countryGuessed).toBe(false);
  });

  it('outside coverage with thin receipts → no_inflation_source', async () => {
    const { svc } = make({
      timezone: 'Europe/Kyiv', official: null, profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('no_inflation_source');
    expect(r.country).toBeNull();
  });

  it('returns the cached response without recomputing', async () => {
    const cached = { status: 'ready' };
    const { svc, prisma } = make({ cached });
    await expect(svc.compute('acc', 'u1', 'PLN')).resolves.toBe(cached);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('reads expenses with every exclusion and split rows', async () => {
    const { svc, prisma } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 }, incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    await svc.compute('acc', 'u1', 'PLN');
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      accountId: 'acc', isDeleted: false, isDebt: false, isDebtRepayment: false, isPlanned: false, isSplitReceivable: false,
    });
    expect(where.date.gte).toBeInstanceOf(Date);
  });
});

describe('RealSalaryService profile + cache', () => {
  it('saveProfile upserts per user+account and busts the account cache', async () => {
    const { svc, prisma, cache } = make();
    await svc.saveProfile('acc', 'u1', { salaryKey: KEY, manualPreviousMonthly: 8000 });
    expect(prisma.salaryProfile.upsert).toHaveBeenCalledWith({
      where: { userId_accountId: { userId: 'u1', accountId: 'acc' } },
      create: { userId: 'u1', accountId: 'acc', salaryKey: KEY, manualPreviousMonthly: 8000 },
      update: { salaryKey: KEY, manualPreviousMonthly: 8000 },
    });
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc:');
  });

  it('bustUser clears every account the user belongs to', async () => {
    const { svc, cache } = make();
    await svc.bustUser('u1');
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc2:');
  });

  it('getProfile returns the stored profile and the detected candidates', async () => {
    const { svc } = make({ profile: { salaryKey: KEY, manualPreviousMonthly: null }, incomes: [1, 2].map((n) => salary(n, 8400)) });
    const r = await svc.getProfile('acc', 'u1');
    expect(r.profile).toEqual({ salaryKey: KEY, manualPreviousMonthly: null });
    expect(r.candidates.map((c) => c.key)).toEqual([KEY]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary.service.spec.ts`
Expected: FAIL — `Cannot find module '../real-salary.service'`.

- [ ] **Step 3: Implement**

Before writing, confirm the membership model name: `grep -n "^model AccountMember" apps/api/prisma/schema.prisma` — Expected: one match (Prisma client property `accountMember`). If different, use the actual name in `bustUser`.

```ts
import { Injectable } from '@nestjs/common';
import type {
  CoicopDivision, RealSalaryCategoryRow, RealSalaryProfileResponse, RealSalaryResponse,
  RealSalaryStatus, SalaryProfileDto,
} from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { PriceHistoryService } from '../../price-history/price-history.service';
import { convertAmount, getRatesSafe } from '../../../common/utils/fx';
import { attributeToCategories } from '../../../common/utils/category-attribution';
import { countryFromTimezone, isDivision, isEurostatCountry } from './coicop';
import { computePersonalInflation, realChange, type SpendByDivision } from './real-salary.util';
import { findSalaryCandidates, nominalChange, type IncomeRow } from './salary-detect.util';
import { OfficialInflationService } from './official-inflation.service';
import { CoicopClassifierService } from './coicop-classifier.service';

const CACHE_TTL_SEC = 3600;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SPEND_MONTHS = 3;

export function realSalaryCacheKey(accountId: string, currency: string): string {
  return `rs:${accountId}:${currency}`;
}

@Injectable()
export class RealSalaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly priceHistory: PriceHistoryService,
    private readonly official: OfficialInflationService,
    private readonly classifier: CoicopClassifierService,
  ) {}

  async compute(accountId: string, userId: string, baseCurrency: string): Promise<RealSalaryResponse> {
    const key = realSalaryCacheKey(accountId, baseCurrency);
    const cached = await this.cache.get<RealSalaryResponse>(key);
    if (cached) return cached;

    const now = new Date();
    const empty = (status: RealSalaryStatus, extra: Partial<RealSalaryResponse> = {}): RealSalaryResponse => ({
      status, baseCurrency, country: null, countryGuessed: false, dataMonth: null,
      nominalChangePct: null, personalInflationPct: null, realChangePct: null, requiredRaisePct: null,
      breakdown: [], topDrivers: [], fxApproximate: false, computedAt: now.toISOString(), ...extra,
    });

    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { encryptionTier: true } });
    if ((account?.encryptionTier ?? 0) >= 2) return empty('encrypted');

    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { timezone: true, inflationCountry: true },
    });
    const explicit = isEurostatCountry(user?.inflationCountry) ? user!.inflationCountry! : null;
    const country = explicit ?? countryFromTimezone(user?.timezone);
    const countryGuessed = !explicit && country !== null;

    const rates = await getRatesSafe(this.exchangeRateService, baseCurrency);
    const convert = (amount: number, from: string) => convertAmount(amount, from, baseCurrency, rates);

    // ── salary ────────────────────────────────────────────────────────────
    const profile = await this.prisma.salaryProfile.findUnique({
      where: { userId_accountId: { userId, accountId } },
      select: { salaryKey: true, manualPreviousMonthly: true },
    });
    if (!profile?.salaryKey) return empty('no_salary_confirmed', { country, countryGuessed });

    const incomes = await this.loadIncomes(accountId, new Date(now.getTime() - 2 * 366 * DAY_MS));
    const nominal = nominalChange({
      rows: incomes, salaryKey: profile.salaryKey, now, baseCurrency, convert,
      manualPreviousMonthly: profile.manualPreviousMonthly === null ? null : Number(profile.manualPreviousMonthly),
    });
    if (nominal.nominalChangePct === null) {
      return empty('salary_history_short', { country, countryGuessed, fxApproximate: nominal.fxApproximate });
    }

    // ── spend weights ─────────────────────────────────────────────────────
    await this.classifier.ensureClassified(accountId);
    const { spend, months, fxApproximate: spendFx } = await this.loadSpend(accountId, now, convert);
    if (months < MIN_SPEND_MONTHS) return empty('spend_under_3_months', { country, countryGuessed });

    // ── inflation ─────────────────────────────────────────────────────────
    const officialData = country ? await this.official.latestFor(country) : null;
    const receipt = await this.priceHistory.getPriceHistory(accountId, '12m');
    const inflation = computePersonalInflation({
      spend,
      officialRates: officialData?.rates ?? {},
      receiptIndexPct: receipt.inflationIndex,
      receiptProductCount: receipt.productCount,
    });
    const fxApproximate = nominal.fxApproximate || spendFx;
    if (!inflation) {
      return empty('no_inflation_source', {
        country: officialData ? country : null, countryGuessed, fxApproximate,
      });
    }

    const change = realChange(nominal.nominalChangePct, inflation.inflationPct);
    const result: RealSalaryResponse = {
      status: 'ready',
      baseCurrency,
      country: officialData ? country : null,
      countryGuessed: officialData ? countryGuessed : false,
      dataMonth: officialData?.month ?? null,
      nominalChangePct: nominal.nominalChangePct,
      personalInflationPct: inflation.inflationPct,
      realChangePct: change.realChangePct,
      requiredRaisePct: change.requiredRaisePct,
      breakdown: inflation.breakdown,
      topDrivers: inflation.topDrivers,
      fxApproximate,
      computedAt: now.toISOString(),
    };
    await this.cache.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  async getProfile(accountId: string, userId: string): Promise<RealSalaryProfileResponse> {
    const profile = await this.prisma.salaryProfile.findUnique({
      where: { userId_accountId: { userId, accountId } },
      select: { salaryKey: true, manualPreviousMonthly: true },
    });
    const now = new Date();
    const incomes = await this.loadIncomes(accountId, new Date(now.getTime() - 120 * DAY_MS));
    return {
      profile: {
        salaryKey: profile?.salaryKey ?? null,
        manualPreviousMonthly: profile?.manualPreviousMonthly == null ? null : Number(profile.manualPreviousMonthly),
      },
      candidates: findSalaryCandidates(incomes, now),
    };
  }

  async saveProfile(accountId: string, userId: string, dto: SalaryProfileDto): Promise<SalaryProfileDto> {
    const data = { salaryKey: dto.salaryKey, manualPreviousMonthly: dto.manualPreviousMonthly };
    const saved = await this.prisma.salaryProfile.upsert({
      where: { userId_accountId: { userId, accountId } },
      create: { userId, accountId, ...data },
      update: data,
    });
    await this.bustAccount(accountId);
    return {
      salaryKey: saved.salaryKey ?? null,
      manualPreviousMonthly: saved.manualPreviousMonthly == null ? null : Number(saved.manualPreviousMonthly),
    };
  }

  async listCategories(accountId: string): Promise<RealSalaryCategoryRow[]> {
    await this.classifier.ensureClassified(accountId);
    const rows = await this.prisma.category.findMany({
      where: { accountId, type: 'expense', isDeleted: false },
      select: { id: true, name: true, icon: true, coicopDivision: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r: { id: string; name: string; icon: string | null; coicopDivision: string | null }) => ({
      id: r.id, name: r.name, icon: r.icon, coicopDivision: isDivision(r.coicopDivision) ? r.coicopDivision : null,
    }));
  }

  async bustAccount(accountId: string): Promise<void> {
    await this.cache.delByPrefix(`rs:${accountId}:`);
  }

  async bustUser(userId: string): Promise<void> {
    const memberships = await this.prisma.accountMember.findMany({ where: { userId }, select: { accountId: true } });
    for (const m of memberships) await this.bustAccount(m.accountId);
  }

  private async loadIncomes(accountId: string, since: Date): Promise<IncomeRow[]> {
    const rows = await this.prisma.income.findMany({
      where: { accountId, isDeleted: false, date: { gte: since } },
      select: {
        amount: true, currencyCode: true, date: true, description: true, categoryId: true,
        category: { select: { name: true } }, isDebt: true, isDebtRepayment: true, clientId: true,
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((r: any) => ({
      amount: Number(r.amount), currencyCode: r.currencyCode, date: new Date(r.date),
      description: r.description ?? null, categoryId: r.categoryId ?? null, categoryName: r.category?.name ?? null,
      isDebt: r.isDebt, isDebtRepayment: r.isDebtRepayment, clientId: r.clientId,
    }));
  }

  private async loadSpend(
    accountId: string, now: Date, convert: (a: number, c: string) => number | null,
  ): Promise<{ spend: SpendByDivision[]; months: number; fxApproximate: boolean }> {
    const rows = await this.prisma.expense.findMany({
      where: {
        accountId, isDeleted: false, isDebt: false, isDebtRepayment: false, isPlanned: false,
        isSplitReceivable: false, date: { gte: new Date(now.getTime() - 365 * DAY_MS) },
      },
      select: {
        amount: true, currencyCode: true, date: true, categoryId: true,
        category: { select: { id: true, name: true, coicopDivision: true } },
        categorySplits: {
          where: { isDeleted: false },
          select: { categoryId: true, amount: true, category: { select: { id: true, name: true, coicopDivision: true } } },
        },
      },
    });

    const divisionOf = new Map<string, CoicopDivision>();
    const months = new Set<string>();
    const spend: SpendByDivision[] = [];
    let fxApproximate = false;
    for (const e of rows as any[]) {
      const d = new Date(e.date);
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
      if (e.category?.id && isDivision(e.category.coicopDivision)) divisionOf.set(e.category.id, e.category.coicopDivision);
      for (const s of e.categorySplits ?? []) {
        if (s.category?.id && isDivision(s.category.coicopDivision)) divisionOf.set(s.category.id, s.category.coicopDivision);
      }
      for (const part of attributeToCategories(e)) {
        const v = convert(part.amount, e.currencyCode);
        if (v === null) { fxApproximate = true; continue; }
        const division = (part.categoryId && divisionOf.get(part.categoryId)) || 'TOTAL';
        spend.push({ division, amount: v });
      }
    }
    return { spend, months: months.size, fxApproximate };
  }
}
```

Check the split relation name before running: `grep -n "categorySplits" apps/api/prisma/schema.prisma` — Expected: a relation field on `Expense`; if the split model has no `isDeleted`, drop that `where` (and note it in the ledger).

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary.service.spec.ts`
Expected: PASS (12 tests).

Note on the `ready` expectation: 6 months of `CP04` spend at 5.1 % → inflation 5.1; nominal (8400/8000 − 1) = 5.0 → real (1.05/1.051 − 1) = −0.095 → −0.1; required 0.1.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/real-salary/real-salary.service.ts apps/api/src/modules/insights/real-salary/__tests__/real-salary.service.spec.ts
git commit -m "Assemble the real-salary response from salary, spend and inflation sources"
```

---

### Task 10: Brief PDF

**Files:**
- Modify: `apps/api/src/modules/reports/generators/pdf-generator.ts:8-9` (export the two font paths)
- Create: `apps/api/src/modules/insights/real-salary/real-salary-brief.pdf.ts`
- Test: `apps/api/src/modules/insights/real-salary/__tests__/real-salary-brief.pdf.spec.ts`

**Interfaces:**
- Consumes: `RealSalaryResponse`; Task 3 `divisionLabel`; `FONT_REGULAR`, `FONT_BOLD` from `../../reports/generators/pdf-generator`.
- Produces:
  ```ts
  export const BRIEF_LANGS: readonly string[];               // the 9 app languages
  @Injectable() export class RealSalaryBriefPdf { render(data: RealSalaryResponse, lang: string): Promise<Buffer> }
  ```

- [ ] **Step 1: Export the fonts**

In `pdf-generator.ts` change

```ts
const FONT_REGULAR = path.join(INTER_DIR, '400Regular', 'Inter_400Regular.ttf');
const FONT_BOLD = path.join(INTER_DIR, '700Bold', 'Inter_700Bold.ttf');
```
to
```ts
export const FONT_REGULAR = path.join(INTER_DIR, '400Regular', 'Inter_400Regular.ttf');
export const FONT_BOLD = path.join(INTER_DIR, '700Bold', 'Inter_700Bold.ttf');
```

- [ ] **Step 2: Write the failing test**

```ts
import { RealSalaryBriefPdf, BRIEF_LANGS } from '../real-salary-brief.pdf';
import type { RealSalaryResponse } from '@budget/shared-types';

const DATA: RealSalaryResponse = {
  status: 'ready', baseCurrency: 'PLN', country: 'PL', countryGuessed: false, dataMonth: '2026-08',
  nominalChangePct: 5, personalInflationPct: 8.3, realChangePct: -3, requiredRaisePct: 3.1,
  breakdown: [
    { division: 'CP01', weight: 0.4, ratePct: 8.3, source: 'receipts' },
    { division: 'CP04', weight: 0.6, ratePct: 5.1, source: 'official' },
  ],
  topDrivers: ['CP01', 'CP04'], fxApproximate: false, computedAt: '2026-09-26T10:00:00.000Z',
};

describe('RealSalaryBriefPdf', () => {
  it('renders a PDF in every app language (Cyrillic and Polish glyphs included)', async () => {
    const pdf = new RealSalaryBriefPdf();
    expect(BRIEF_LANGS).toEqual(['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']);
    for (const lang of BRIEF_LANGS) {
      const buf = await pdf.render(DATA, lang);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(1500);
    }
  });

  it('falls back to English for an unknown language', async () => {
    const buf = await new RealSalaryBriefPdf().render(DATA, 'xx');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('refuses a response that is not ready', async () => {
    await expect(new RealSalaryBriefPdf().render({ ...DATA, status: 'no_salary_confirmed' }, 'en')).rejects.toThrow('not ready');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary-brief.pdf.spec.ts`
Expected: FAIL — `Cannot find module '../real-salary-brief.pdf'`.

- [ ] **Step 4: Implement**

```ts
import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import type { RealSalaryResponse } from '@budget/shared-types';
import { FONT_BOLD, FONT_REGULAR } from '../../reports/generators/pdf-generator';
import { divisionLabel } from './coicop';

export const BRIEF_LANGS: readonly string[] = ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl'];

interface BriefLabels {
  title: string;
  subtitle: (month: string | null) => string;
  pay: string;
  inflation: string;
  real: string;
  required: string;
  byCategory: string;
  share: string;
  rate: string;
  receipts: string;
  official: string;
  drivers: string;
  sources: (country: string | null, month: string | null) => string;
  disclaimer: string;
}

const pct = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);

const L: Record<string, BriefLabels> = {
  en: {
    title: 'My real salary', subtitle: (m) => `Personal inflation vs pay${m ? ` · data ${m}` : ''}`,
    pay: 'Pay change, 12 months', inflation: 'My inflation', real: 'Real pay change',
    required: 'Raise needed to keep up', byCategory: 'Where prices rose for me', share: 'Share of my spending',
    rate: 'Price change', receipts: 'my receipts', official: 'official data', drivers: 'Biggest drivers',
    sources: (c, m) => `Sources: my spending in the app; Eurostat HICP${c ? ` for ${c}` : ''}${m ? `, ${m}` : ''}; my scanned receipts.`,
    disclaimer: 'An estimate from my own spending and public price statistics — not financial advice.',
  },
  pl: {
    title: 'Moja realna pensja', subtitle: (m) => `Osobista inflacja a wynagrodzenie${m ? ` · dane ${m}` : ''}`,
    pay: 'Zmiana wynagrodzenia, 12 mies.', inflation: 'Moja inflacja', real: 'Realna zmiana wynagrodzenia',
    required: 'Podwyżka potrzebna, by nie tracić', byCategory: 'Gdzie ceny wzrosły u mnie', share: 'Udział w moich wydatkach',
    rate: 'Zmiana cen', receipts: 'moje paragony', official: 'dane oficjalne', drivers: 'Największe czynniki',
    sources: (c, m) => `Źródła: moje wydatki w aplikacji; Eurostat HICP${c ? ` dla ${c}` : ''}${m ? `, ${m}` : ''}; moje zeskanowane paragony.`,
    disclaimer: 'Szacunek na podstawie moich wydatków i publicznych statystyk cen — nie jest to porada finansowa.',
  },
  de: {
    title: 'Mein Reallohn', subtitle: (m) => `Persönliche Inflation vs. Gehalt${m ? ` · Daten ${m}` : ''}`,
    pay: 'Gehaltsänderung, 12 Monate', inflation: 'Meine Inflation', real: 'Reale Gehaltsänderung',
    required: 'Nötige Erhöhung, um mitzuhalten', byCategory: 'Wo die Preise für mich stiegen', share: 'Anteil an meinen Ausgaben',
    rate: 'Preisänderung', receipts: 'meine Belege', official: 'amtliche Daten', drivers: 'Größte Treiber',
    sources: (c, m) => `Quellen: meine Ausgaben in der App; Eurostat HVPI${c ? ` für ${c}` : ''}${m ? `, ${m}` : ''}; meine gescannten Belege.`,
    disclaimer: 'Eine Schätzung aus meinen Ausgaben und öffentlichen Preisstatistiken – keine Finanzberatung.',
  },
  es: {
    title: 'Mi salario real', subtitle: (m) => `Inflación personal frente al sueldo${m ? ` · datos ${m}` : ''}`,
    pay: 'Cambio de sueldo, 12 meses', inflation: 'Mi inflación', real: 'Cambio real del sueldo',
    required: 'Subida necesaria para no perder', byCategory: 'Dónde subieron mis precios', share: 'Parte de mi gasto',
    rate: 'Cambio de precios', receipts: 'mis recibos', official: 'datos oficiales', drivers: 'Mayores causas',
    sources: (c, m) => `Fuentes: mis gastos en la app; IPCA de Eurostat${c ? ` para ${c}` : ''}${m ? `, ${m}` : ''}; mis recibos escaneados.`,
    disclaimer: 'Una estimación a partir de mis gastos y estadísticas públicas de precios; no es asesoramiento financiero.',
  },
  fr: {
    title: 'Mon salaire réel', subtitle: (m) => `Inflation personnelle et salaire${m ? ` · données ${m}` : ''}`,
    pay: 'Évolution du salaire, 12 mois', inflation: 'Mon inflation', real: 'Évolution réelle du salaire',
    required: 'Augmentation nécessaire pour suivre', byCategory: 'Où mes prix ont augmenté', share: 'Part de mes dépenses',
    rate: 'Évolution des prix', receipts: 'mes tickets', official: 'données officielles', drivers: 'Principaux facteurs',
    sources: (c, m) => `Sources : mes dépenses dans l’app ; IPCH d’Eurostat${c ? ` pour ${c}` : ''}${m ? `, ${m}` : ''} ; mes tickets scannés.`,
    disclaimer: 'Une estimation à partir de mes dépenses et de statistiques publiques de prix — pas un conseil financier.',
  },
  ru: {
    title: 'Моя реальная зарплата', subtitle: (m) => `Личная инфляция и зарплата${m ? ` · данные за ${m}` : ''}`,
    pay: 'Изменение зарплаты за 12 месяцев', inflation: 'Моя инфляция', real: 'Реальное изменение зарплаты',
    required: 'Нужная прибавка, чтобы не отставать', byCategory: 'Где цены выросли для меня', share: 'Доля моих расходов',
    rate: 'Изменение цен', receipts: 'мои чеки', official: 'официальные данные', drivers: 'Главные причины',
    sources: (c, m) => `Источники: мои расходы в приложении; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мои отсканированные чеки.`,
    disclaimer: 'Оценка по моим расходам и открытой статистике цен — не финансовая консультация.',
  },
  ua: {
    title: 'Моя реальна зарплата', subtitle: (m) => `Особиста інфляція і зарплата${m ? ` · дані за ${m}` : ''}`,
    pay: 'Зміна зарплати за 12 місяців', inflation: 'Моя інфляція', real: 'Реальна зміна зарплати',
    required: 'Потрібне підвищення, щоб не відставати', byCategory: 'Де ціни зросли для мене', share: 'Частка моїх витрат',
    rate: 'Зміна цін', receipts: 'мої чеки', official: 'офіційні дані', drivers: 'Головні причини',
    sources: (c, m) => `Джерела: мої витрати в застосунку; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мої відскановані чеки.`,
    disclaimer: 'Оцінка за моїми витратами та відкритою статистикою цін — не фінансова консультація.',
  },
  be: {
    title: 'Мой рэальны заробак', subtitle: (m) => `Асабістая інфляцыя і заробак${m ? ` · даныя за ${m}` : ''}`,
    pay: 'Змена заробку за 12 месяцаў', inflation: 'Мая інфляцыя', real: 'Рэальная змена заробку',
    required: 'Патрэбнае павышэнне, каб не адставаць', byCategory: 'Дзе цэны выраслі для мяне', share: 'Доля маіх выдаткаў',
    rate: 'Змена цэн', receipts: 'мае чэкі', official: 'афіцыйныя даныя', drivers: 'Галоўныя прычыны',
    sources: (c, m) => `Крыніцы: мае выдаткі ў праграме; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мае адсканаваныя чэкі.`,
    disclaimer: 'Ацэнка па маіх выдатках і адкрытай статыстыцы цэн — не фінансавая кансультацыя.',
  },
  nl: {
    title: 'Mijn reële salaris', subtitle: (m) => `Persoonlijke inflatie tegenover loon${m ? ` · gegevens ${m}` : ''}`,
    pay: 'Loonsverandering, 12 maanden', inflation: 'Mijn inflatie', real: 'Reële loonsverandering',
    required: 'Nodige verhoging om bij te blijven', byCategory: 'Waar mijn prijzen stegen', share: 'Deel van mijn uitgaven',
    rate: 'Prijsverandering', receipts: 'mijn bonnen', official: 'officiële cijfers', drivers: 'Grootste oorzaken',
    sources: (c, m) => `Bronnen: mijn uitgaven in de app; Eurostat HICP${c ? ` voor ${c}` : ''}${m ? `, ${m}` : ''}; mijn gescande bonnen.`,
    disclaimer: 'Een schatting op basis van mijn uitgaven en openbare prijsstatistieken — geen financieel advies.',
  },
};

/** Deterministic, no LLM: every number comes straight from the response. */
@Injectable()
export class RealSalaryBriefPdf {
  render(data: RealSalaryResponse, lang: string): Promise<Buffer> {
    if (data.status !== 'ready') return Promise.reject(new Error('Real salary is not ready'));
    const t = L[lang] ?? L.en;
    const code = L[lang] ? lang : 'en';

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('Inter', FONT_REGULAR);
      doc.registerFont('Inter-Bold', FONT_BOLD);

      doc.font('Inter-Bold').fontSize(22).text(t.title);
      doc.font('Inter').fontSize(11).fillColor('#555555').text(t.subtitle(data.dataMonth)).moveDown(1.2);

      const kv = (label: string, value: string, bold = false) => {
        doc.fillColor('#000000').font('Inter').fontSize(12).text(label, { continued: true });
        doc.font(bold ? 'Inter-Bold' : 'Inter').text(`  ${value}`);
      };
      kv(t.pay, pct(data.nominalChangePct));
      kv(t.inflation, pct(data.personalInflationPct));
      kv(t.real, pct(data.realChangePct), true);
      kv(t.required, pct(data.requiredRaisePct), true);
      doc.moveDown(1.2);

      doc.font('Inter-Bold').fontSize(14).text(t.byCategory).moveDown(0.4);
      doc.font('Inter').fontSize(10).fillColor('#555555').text(`${t.share} · ${t.rate}`).moveDown(0.3);
      for (const row of data.breakdown) {
        const src = row.source === 'receipts' ? t.receipts : t.official;
        doc.fillColor('#000000').fontSize(11)
          .text(`${divisionLabel(row.division, code)} — ${Math.round(row.weight * 100)}% · ${pct(row.ratePct)} (${src})`);
      }
      if (data.topDrivers.length > 0) {
        doc.moveDown(0.8).font('Inter-Bold').fontSize(12).text(t.drivers);
        doc.font('Inter').fontSize(11).text(data.topDrivers.map((d) => divisionLabel(d, code)).join(', '));
      }

      doc.moveDown(1.5).fontSize(9).fillColor('#777777').text(t.sources(data.country, data.dataMonth));
      doc.moveDown(0.3).text(t.disclaimer);
      doc.end();
    });
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary-brief.pdf.spec.ts src/modules/reports`
Expected: PASS (3 new tests; existing reports tests still pass).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/generators/pdf-generator.ts apps/api/src/modules/insights/real-salary/real-salary-brief.pdf.ts apps/api/src/modules/insights/real-salary/__tests__/real-salary-brief.pdf.spec.ts
git commit -m "Add the real-salary raise brief PDF in nine languages"
```

---

### Task 11: Routes, module wiring, category + user fields

**Files:**
- Modify: `apps/api/src/modules/insights/insights.controller.ts` (new routes)
- Modify: `apps/api/src/modules/insights/insights.module.ts` (providers)
- Modify: `apps/api/src/modules/categories/dto/index.ts` (`UpdateCategoryDto.coicopDivision`)
- Modify: `apps/api/src/modules/categories/categories.controller.ts` (bust cache on division change)
- Modify: `apps/api/src/modules/users/users.controller.ts` + `users.service.ts` (`inflationCountry`)
- Test: `apps/api/src/modules/insights/real-salary/__tests__/real-salary.routes.spec.ts`

**Interfaces:**
- Consumes: Task 9 `RealSalaryService`, Task 10 `RealSalaryBriefPdf`, Task 3 `isEurostatCountry`, `DIVISIONS`.
- Produces HTTP:
  - `GET /insights/real-salary` → `RealSalaryResponse`
  - `GET /insights/real-salary/profile` → `RealSalaryProfileResponse`
  - `PUT /insights/real-salary/profile` body `SalaryProfileDto` → `SalaryProfileDto` (viewer-blocked)
  - `GET /insights/real-salary/categories` → `RealSalaryCategoryRow[]`
  - `POST /insights/real-salary/brief?lang=xx` → `application/pdf` (Pro)
  - `PATCH /categories/:id` accepts `coicopDivision`
  - `PATCH /users/me` accepts `inflationCountry: string | null`; `GET /users/me` returns it

- [ ] **Step 1: Write the failing test** (controller-level validation, no Nest app — mirrors existing controller specs)

```ts
import { BadRequestException } from '@nestjs/common';
import { validateSalaryProfile } from '../real-salary.validation';
import { validateInflationCountry } from '../real-salary.validation';

describe('real-salary request validation', () => {
  it('accepts a salary key and a positive manual figure', () => {
    expect(validateSalaryProfile({ salaryKey: 'c|x|PLN', manualPreviousMonthly: 8000 }))
      .toEqual({ salaryKey: 'c|x|PLN', manualPreviousMonthly: 8000 });
  });
  it('accepts clearing both', () => {
    expect(validateSalaryProfile({ salaryKey: null, manualPreviousMonthly: null }))
      .toEqual({ salaryKey: null, manualPreviousMonthly: null });
  });
  it('rejects a malformed key, a negative or absurd figure, or a missing body', () => {
    expect(() => validateSalaryProfile({ salaryKey: 'nopipes', manualPreviousMonthly: null })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile({ salaryKey: 'a|b|PLN', manualPreviousMonthly: -1 })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile({ salaryKey: 'a|b|PLN', manualPreviousMonthly: 1e10 })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile(undefined as any)).toThrow(BadRequestException);
  });
  it('accepts a Eurostat country or null, rejects anything else', () => {
    expect(validateInflationCountry('PL')).toBe('PL');
    expect(validateInflationCountry(null)).toBeNull();
    expect(() => validateInflationCountry('GR')).toThrow(BadRequestException);
    expect(() => validateInflationCountry('pl')).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/insights/real-salary/__tests__/real-salary.routes.spec.ts`
Expected: FAIL — `Cannot find module '../real-salary.validation'`.

- [ ] **Step 3: Implement the validation module**

`apps/api/src/modules/insights/real-salary/real-salary.validation.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { SalaryProfileDto } from '@budget/shared-types';
import { isEurostatCountry } from './coicop';

const KEY = /^[^|]*\|[^|]*\|[A-Z]{3}$/;
const MAX_MONTHLY = 10_000_000;

export function validateSalaryProfile(body: unknown): SalaryProfileDto {
  const b = body as Partial<SalaryProfileDto> | undefined;
  if (!b || typeof b !== 'object') throw new BadRequestException('Body required');
  const salaryKey = b.salaryKey ?? null;
  const manual = b.manualPreviousMonthly ?? null;
  if (salaryKey !== null && (typeof salaryKey !== 'string' || salaryKey.length > 300 || !KEY.test(salaryKey))) {
    throw new BadRequestException('Invalid salaryKey');
  }
  if (manual !== null && (typeof manual !== 'number' || !Number.isFinite(manual) || manual <= 0 || manual > MAX_MONTHLY)) {
    throw new BadRequestException('Invalid manualPreviousMonthly');
  }
  return { salaryKey, manualPreviousMonthly: manual };
}

export function validateInflationCountry(value: unknown): string | null {
  if (value === null) return null;
  if (!isEurostatCountry(value)) throw new BadRequestException('Invalid inflationCountry');
  return value;
}
```

Run the test — Expected: PASS (4 tests).

- [ ] **Step 4: Controller routes** — in `insights.controller.ts` add imports and inject the two new providers into the constructor (append to the existing parameter list):

```ts
import { Body, Post, Put, Query, Res } from '@nestjs/common';   // merge into the existing @nestjs/common import
import type { Response } from 'express';
import { ViewerBlockGuard } from '../../common/guards/viewer-block.guard';
import { RealSalaryService } from './real-salary/real-salary.service';
import { RealSalaryBriefPdf } from './real-salary/real-salary-brief.pdf';
import { validateSalaryProfile } from './real-salary/real-salary.validation';
```

Before adding, locate `ViewerBlockGuard`'s real path: `grep -rn "export class ViewerBlockGuard" apps/api/src` — use that path in the import (it lives beside `AccountRoleGuard`; CLAUDE.md: "zero-dependency guard in same file").

Constructor additions:

```ts
    private readonly realSalaryService: RealSalaryService,
    private readonly realSalaryBriefPdf: RealSalaryBriefPdf,
```

Routes (place them BEFORE any `@Get(':...')` parameter route in this controller, if one exists — static paths first):

```ts
  @Get('real-salary')
  async getRealSalary(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.compute(req.accountId, req.user.id, req.user.currencyCode || 'USD');
  }

  @Get('real-salary/profile')
  async getRealSalaryProfile(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.getProfile(req.accountId, req.user.id);
  }

  @Put('real-salary/profile')
  @UseGuards(new ViewerBlockGuard())
  async saveRealSalaryProfile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.realSalaryService.saveProfile(req.accountId, req.user.id, validateSalaryProfile(body));
  }

  @Get('real-salary/categories')
  async getRealSalaryCategories(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.listCategories(req.accountId);
  }

  @Post('real-salary/brief')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getRealSalaryBrief(@Req() req: AuthenticatedRequest, @Query('lang') lang: string | undefined, @Res() res: Response) {
    const data = await this.realSalaryService.compute(req.accountId, req.user.id, req.user.currencyCode || 'USD');
    if (data.status !== 'ready') {
      res.status(409).json({ message: 'Real salary is not ready', status: data.status });
      return;
    }
    const pdf = await this.realSalaryBriefPdf.render(data, lang || 'en');
    const fileName = `real-salary-${data.computedAt.slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Report-Filename', fileName);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }
```

- [ ] **Step 5: Module wiring** — `insights.module.ts`: add imports and providers:

```ts
import { RealSalaryService } from './real-salary/real-salary.service';
import { RealSalaryBriefPdf } from './real-salary/real-salary-brief.pdf';
import { OfficialInflationService } from './real-salary/official-inflation.service';
import { CoicopClassifierService } from './real-salary/coicop-classifier.service';
import { EurostatClient } from './real-salary/eurostat.client';
```

Append to `providers`: `RealSalaryService, RealSalaryBriefPdf, OfficialInflationService, CoicopClassifierService, EurostatClient`. Nothing new is exported — Categories and Users bust the cache through the `@Global()` `CacheService` by key prefix, so they never import `InsightsModule`. `ExchangeRateService` comes from the already-imported `CurrencyExchangeModule`, `PriceHistoryService` from `PriceHistoryModule`, `ConfigService` from `ConfigModule` — all already in `imports`.

- [ ] **Step 6: `coicopDivision` on categories** — `categories/dto/index.ts`, in `UpdateCategoryDto` add:

```ts
  @IsOptional()
  @IsString()
  @IsIn(['TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07', 'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13'])
  coicopDivision?: string;
```

`CategoriesService.update` already spreads the DTO into `prisma.category.update` (`const { clientId: _ignoredClientId, ...rest } = dto`), so the column is written with no service change. In `categories.controller.ts`, inject `private readonly cache: CacheService` (import from `../../common/cache/cache.service`; it is `@Global()`, no module import needed) and, in the PATCH handler right after the service call returns:

```ts
    // real-salary weights read coicopDivision — its cached answer is now stale
    if (dto.coicopDivision !== undefined) {
      await this.cache.delByPrefix(`rs:${req.accountId}:`);
    }
```

- [ ] **Step 7: `inflationCountry` on users** — `users.service.ts` `CreateUserData`: add `inflationCountry?: string | null;`. In `users.controller.ts`:
  - add `inflationCountry?: string | null;` to the `PATCH me` body type;
  - before `usersService.update`, add:

```ts
    if (body.inflationCountry !== undefined) {
      body.inflationCountry = validateInflationCountry(body.inflationCountry);
    }
```
  - after `usersService.update`, add:

```ts
    if (body.inflationCountry !== undefined) {
      // Every account's real-salary answer depends on the user's country.
      for (const accountId of await this.usersService.listAccountIds(req.user.id)) {
        await this.cache.delByPrefix(`rs:${accountId}:`);
      }
    }
```
    Add to `UsersService`:
```ts
  async listAccountIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.accountMember.findMany({ where: { userId }, select: { accountId: true } });
    return rows.map((r) => r.accountId);
  }
```
    and inject `private readonly cache: CacheService` into `UsersController` (import from `../../common/cache/cache.service`).
  - add `inflationCountry: user.inflationCountry,` to BOTH the `GET me` and `PATCH me` response objects;
  - import `validateInflationCountry` from `../insights/real-salary/real-salary.validation`.

- [ ] **Step 8: Verify**

Run (from `apps/api`): `npx tsc --noEmit && npx jest src/modules/insights src/modules/categories src/modules/users && npm run lint`
Expected: no type errors; all tests PASS; lint 0 errors.

Run (repo root): `bash scripts/check-no-shared-utils-runtime-import.sh`
Expected: exit 0 (every `@budget/shared-types` import added is `import type`).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/insights apps/api/src/modules/categories apps/api/src/modules/users
git commit -m "Expose real-salary routes, the COICOP category field and the user's inflation country"
```

---

### Task 12: Wiki page (API half)

**Files:**
- Create: `docs/wiki/features/real-salary.md`
- Modify: `docs/wiki/index.md` (link under the analytics/insights hub, beside `personal-inflation-index`)
- Modify: `docs/wiki/features/personal-inflation-index.md` (one "related" link to `real-salary.md`)

- [ ] **Step 1: Write the page** with sections *What this is / Entry points / Key concepts / Invariants / Known gaps / History*. Invariants to state, each with its reason:
  - dataset is `prc_hicp_minr` / `coicop18` / `TOTAL` — the old `prc_hicp_manr` froze at 2025-12;
  - user requests never call Eurostat; only `OfficialInflationService` writes the table, twice a month plus a boot fill when empty;
  - salary grouped by category + description, never amount (a raise must not split the series); transfers-as-income and debts excluded;
  - receipt index replaces CP01 only at ≥ 10 products;
  - a missing division rate falls back to `TOTAL`, never 0;
  - the classifier sees names only, stores `TOTAL` for unknown, is not charged to the AI limit;
  - cache `rs:{accountId}:{currency}` busted by profile PUT, category division PATCH and `inflationCountry` PATCH;
  - the brief PDF uses no LLM and refuses a non-ready response (409).
  Known gaps: non-EU official CPI; per-account (not cross-account) salary; mobile UI is plan 2.
- [ ] **Step 2: Lint the wiki** — Run (repo root): `python scripts/wiki-lint.py` — Expected: no finding mentions `real-salary`.
- [ ] **Step 3: Commit**

```bash
git add docs/wiki/features/real-salary.md docs/wiki/index.md docs/wiki/features/personal-inflation-index.md
git commit -m "Document the real-salary API in the wiki"
```

---

## After this plan

Plan 2 (mobile): `docs/superpowers/plans/2026-09-26-real-salary-mobile.md` — screen, setup wizard, country/category editors, share card, Pro brief download, i18n × 9, help section (three registrations), then `finish-aba-task` for the whole feature. The API can ship first: without the screen nothing calls it, and the cron simply fills its table.
