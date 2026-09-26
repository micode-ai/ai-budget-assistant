# PIT deductions helper (Poland) — design

Date: 2026-09-26 · Status: approved in brainstorming, awaiting spec review

## Goal

All year the app quietly collects expenses that may be deductible in the Polish PIT; in
January it hands over "what to put in PIT/O, and the documents that back it up", with an
estimated refund. Money back the user can count, plus a seasonal acquisition and Pro-conversion
peak (January–April).

**This is tax-adjacent guidance.** Three rules hold regardless of any later decision:
1. Limits, rates and form field numbers live in **per-tax-year config**, never in code.
2. Most deductions need a **faktura in the taxpayer's name, not a paragon** — the app flags
   missing documents rather than silently counting the expense.
3. Copy says **"may be deductible — check"**, never "you will get". A **doradca podatkowy review
   of the rules file and the PDF text is a release gate** (`PIT_ENABLED` stays off until then).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Deductions in v1 | **ulga internetowa, darowizny (+ krwiodawstwo), IKZE**; ulga na dzieci as an informational block only |
| How expenses get in | **Suggest → user confirms, plus a manual toggle**; a confirmation learns a merchant rule |
| Tier | **In-year tracking free; PDF package + January push Pro** |
| Who sees it | `User.inflationCountry = 'PL'` (from the real-salary spec) or, before that ships, timezone `Europe/Warsaw`; UI in all 9 languages, PIT names and fields kept in Polish |
| Rules storage | **Versioned JSON in the repo**, one file per tax year, reviewed by PR |

Rejected: rehabilitacyjna / termomodernizacyjna in v1 (certificates, closed work lists,
ownership rules — error risk far higher); internet-only pilot (too little value); manual-only
(finds nothing); auto-only (a bundled phone+internet bill would be wholly deducted — a tax
error); all-free (loses the conversion moment); all-Pro (free users never see the refund);
admin-editable DB rules (weak review trail); constants in code.

## Rules config

`apps/api/src/modules/pit/rules/<year>.json` — for each kind: annual cap / percentage cap,
blood-donation rate per litre, required document type, PIT/O field references, merchant and
keyword heuristics, the children-relief amounts. Validated at boot against a schema; a missing
required field fails startup. Past years' files are never edited. **Yearly update before
January is an ops task** (listed in the wiki page).

## Data

One migration, same commit as the schema change (ABA-558):

- `pit_deduction_marks` — `id`, `expenseId`, `accountId`, `userId`, `taxYear`,
  `kind` (`internet|donation|blood_donation|ikze`), `deductibleAmount` (may be below the expense
  amount — bundled bills), `documentStatus` (`faktura_ok|needs_faktura|transfer_ok|unknown`),
  `source` (`suggested_confirmed|manual`), timestamps. Unique on `(expenseId, userId)`.
- `pit_merchant_rules` — `accountId`, `userId`, `merchantKey` (`merchant.trim().toLowerCase()`,
  same key as merchant-category rules), `kind`.
- `pit_dismissed_candidates` — `expenseId`, `userId`.
- `User`: `pitChildrenCount Int?`, `pitInternetFirstYear Int?`, `pitTaxRate Int @default(12)`,
  `pitIncomeOverride Decimal?`, `notifyPitSeason Boolean @default(true)`.

**Marks belong to a person, not just the account** — PIT is personal, so in a shared family
account each member sees only their own marks. Every query filters by `userId`.

## Calculation (pure, unit-tested)

- `findPitCandidates(expenses, rules, merchantRules, dismissed)` — ISP names (Orange, Play,
  UPC, T-Mobile, Vectra, Netia, Plus, Starlink…), donation recipients (fundacja, stowarzyszenie,
  PCK, Caritas, WOŚP, keywords), IKZE (brokers + "IKZE"). Dismissed ones never return.
- `computePitSummary(marks, rules[year], userInputs)`:
  - internet: `min(Σ, cap)`, only in the first or second consecutive year
    (`pitInternetFirstYear`);
  - donations: `min(Σ, pct × annualIncome)`, annual income estimated from the app's incomes,
    user-overridable; blood donation as its own line at the config rate;
  - IKZE: `min(Σ, annual limit)`;
  - estimated refund `Σ deductions × pitTaxRate` (12 % default, 32 % selectable) — always labelled
    an estimate;
  - children: informational "you may be entitled to up to X zł" from config, no expenses.
- Amounts in PLN; foreign-currency expenses converted with `common/utils/fx.ts` and flagged
  "check the NBP rate" (the tax office uses the NBP rate of the preceding business day, not ours).

## API — module `pit`

`JwtAuthGuard` + `AccountContextGuard`; marks filtered by `userId`. Hidden (404) while
`PIT_ENABLED` is off.

- `GET /pit/:year/summary` — free: per-kind totals vs caps, refund estimate, count missing a
  faktura, children block, `rulesVersion`.
- `GET /pit/:year/candidates`.
- `POST /pit/marks`, `PATCH /pit/marks/:id`, `DELETE /pit/marks/:id` — `ViewerBlockGuard`;
  confirming a candidate also creates a `pit_merchant_rule`.
- `POST /pit/candidates/:expenseId/dismiss`.
- `PATCH /users/me/pit-profile` — children, internet first year, tax rate, income override.
- `POST /pit/:year/package` — `@RequireTier('pro')`, PDF via
  `reports/generators/pdf-generator.ts`; **no LLM**, templated text in 9 languages, PIT fields in
  Polish; carries `rulesVersion` and date.

**Rules applied at import.** A bank-import / notification expense whose merchant has a
`pit_merchant_rule` gets a mark automatically (`needs_faktura` or `transfer_ok`), with the same
override priority as merchant-category rules.

## Mobile

- `app/pit/[year].tsx` (header + back): refund estimate hero, three deduction cards with a
  used-of-cap bar, "missing faktura" list, **PIT package (Pro)** button (paywall via
  `upgradeStore`), children block; tabs for past years that have marks.
- Candidate review screen: Yes / No / Edit amount per item. On confirming internet: "needs a
  faktura in your name — ask your provider"; for a bundled provider: "only the internet part
  counts".
- `ExpenseDetailsCard`: "For PIT" toggle + kind picker, PL users only.
- Entry points: Analytics tab, Settings, and 1 Jan–30 Apr a home card (`WidgetKey` `pit` — all
  three entries: `WIDGET_KEYS`, `HomeWidgetSwitch`, `settings/widgets.tsx` label map).

**January push.** `pit-season.cron.ts` on 15 January: "Your PIT <year> summary is ready — about
N zł may come back", to users with marks, via `paginateById`, gated by `notifyPitSeason`.

## Disclaimers

Permanent banner on the screen and in the PDF, all 9 languages: "An estimate, not tax advice.
Check in Twój e-PIT or with a doradca podatkowy." Never "you will get" — only "about N zł may
come back" (same wording discipline as the receipt price check).

## Testing

- `computePitSummary`: every cap at its boundaries; 6 % of income; internet in year 3 (not
  eligible); bundled bill with a partial amount; non-PLN flag; 12 % vs 32 %.
- `findPitCandidates`: providers, foundations, IKZE; false positives ("Play" in a café
  description); dismissed candidates never return.
- Rules-file schema check.
- `userId` isolation in a shared account.
- Merchant rule applied at import.

## Docs and i18n

~45 `pit.*` keys × 9 locales; a new help section (registered in all three places); wiki page
`docs/wiki/features/pit-deductions.md` including the yearly rules-update procedure.

## Release checklist

1. doradca podatkowy review of `rules/<year>.json` and the PDF text.
2. Turn on `PIT_ENABLED`.
3. Ship before January for the season.

## Out of scope (v1)

ulga rehabilitacyjna and termomodernizacyjna; joint spouse filing; NBP rates (flag only);
e-Deklaracje / XML export; faktura-vs-paragon detection in OCR.
