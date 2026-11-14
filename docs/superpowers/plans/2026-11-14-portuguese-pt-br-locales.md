# Portuguese (PT/BR) Locales + BRL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship European Portuguese (`pt`) and Brazilian Portuguese (`br`) as two complete
languages on every surface that has the current nine, plus BRL as a first-class currency.

**Architecture:** Internal locale codes `pt`/`br`. One locale resolver turns any external
language tag into an internal code, and one Intl mapper turns an internal code back into a
BCP-47 tag. Both are a duplicated API/shared-utils pair, following the `category-catalog`
precedent. Every existing per-locale map gets two new entries. BRL is appended to every currency
list.

**Tech Stack:** NestJS + Jest (API), Expo/i18next + Jest (mobile), Next.js (admin), Python
generators (help, landing, store assets).

**Spec:** `docs/superpowers/specs/2026-11-14-portuguese-pt-br-locales-design.md`

## Global Constraints

- Internal codes: `pt` = Português (Portugal), `br` = Português (Brasil). Intl/hreflang/Play:
  `pt` → `pt-PT`, `br` → `pt-BR`. **Never pass `br` raw to `Intl.*`**, because Intl reads it
  as Breton.
- External tag rule: `pt-BR`/`pt_BR`/`pt-br` → `br`. Other `pt-*` → `pt`. Bare `pt` → `br`.
  `uk` → `ua`. Device locale: `pt` with region `BR` or no region → `br`, any other region → `pt`.
- Chat: detection returns `Portuguese`. The variant comes from the UI locale: `pt` →
  `European Portuguese`, `br` → `Brazilian Portuguese`, anything else → `Brazilian Portuguese`.
- BRL formatting: `{ symbol: 'R$', locale: 'pt-BR', position: 'before' }`. Constants name:
  `Brazilian Real`. Prompt symbol map: `R$=BRL`.
- The API must not import runtime values from `@budget/shared-utils` (deploy guard). Duplicated
  pairs must be changed on both sides.
- Translation: every file stays consistent in one variant. Use the glossary
  `apps/mobile/src/i18n/PT_BR_GLOSSARY.md` from Task 3 onward.
- **Translation review gate** (every task that adds pt/br text, before its commit): dispatch a
  fresh `general-purpose` subagent that did not write the text. Brief: "Proofread the `pt` and
  `br` strings in <files> against `en` and `apps/mobile/src/i18n/PT_BR_GLOSSARY.md`. Report:
  European words in `br` and Brazilian words in `pt`; meaning drift from `en`; any changed or
  missing `{{placeholder}}`, plural suffix or HTML/markdown tag; machine-sounding financial
  phrasing; any wording that says a receipt was 'overcharged'/'promo not applied', or that
  calls a deposit refundable rather than 'already paid'. List each finding as file:key → issue
  → fix." Apply the fixes, then commit.
- One squashed commit per ABA task. Five ABA tasks: Part A, B, C, D, E. Create each ABA issue
  through `finish-aba-task` at the end of its part. **Do not push** until the user approves.
  Parts A–C are pushed together.
- Repo-wide "9 locales" rules become 11 in Part C.

## Review Focus

1. **A Brazilian browser on a guest page** (`Accept-Language: pt-BR,pt;q=0.9`) must get
   Brazilian text, not European. Pinned in Task 4.
2. **A `br` user's dates, numbers and money on the server** (`Intl.ListFormat` in
   `mail.service.ts`, the analytics month labels, PDFs, the shopping-list guest page money
   format) must format as `pt-BR`, not Breton or English. Pinned in Task 2 (`toIntlLocale`) and
   Task 4.
3. **A Portuguese chat message with `ç`/`á` and no `ã`/`õ`** ("Gastei 20 euros no café hoje")
   must be detected as Portuguese, not French or Spanish. A French "j'ai payé au café" must stay
   French. Pinned in Task 5.
4. **A Telegram user with `language_code: 'pt-br'` who is not linked yet** must get the
   Brazilian `linkFirst`, not English. Pinned in Task 4.
5. **An existing user whose stored `language` is `pt`** still gets European strings. A key
   missing in `br.ts` must fail a test, not render the key string. Pinned in Task 7 (parity
   test).

---

## Part A — BRL (ABA task 1)

### Task 1: BRL in every currency list

**Files:**
- Modify: `packages/shared-types/src/entities/primitives.ts:1` (`Currency` union)
- Modify: `packages/shared-utils/src/validation/index.ts:4` (`CurrencySchema`)
- Modify: `packages/shared-utils/src/constants/index.ts` (currency list, after CHF)
- Modify: `packages/shared-utils/src/formatting/index.ts` (format map, after CHF)
- Modify: `apps/api/src/modules/ai/services/ai-tool-schemas.ts:3`
- Modify: `apps/api/src/modules/currency-exchange/exchange-rate.service.ts:12`
- Modify: `apps/api/src/modules/exchange-rate-alerts/exchange-rate-alerts.service.ts:19`
- Modify: `apps/api/src/modules/import-bank/ai/statement-ai.validator.ts:36`
- Modify: `apps/mobile/src/services/notificationParser/generic.ts:24,63` (`BRL` code plus the
  `R$` symbol entry)
- Modify: `apps/api/src/modules/ai/services/prompt-builder.service.ts:123` (append `R$=BRL`)
- Test: `packages/shared-utils/src/formatting/__tests__/` (existing formatting spec, or create
  `brl.test.ts`), plus the notification-parser test folder

**Interfaces:**
- Produces: `Currency` includes `'BRL'`. Every other part may rely on it.

- [ ] **Step 1: Write failing tests**
  - `formatCurrency(1234.5, 'BRL')` equals `'R$ 1.234,50'`. Check the exact NBSP output against
    `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})` and assert that.
  - `CurrencySchema.parse('BRL')` does not throw.
  - Notification parser: `'Compra aprovada R$ 52,90 PADARIA'` parses to amount `52.9`, currency
    `'BRL'`.
  - `statement-ai.validator` accepts a row with `currency: 'BRL'`.
- [ ] **Step 2: Run them and verify they fail.** Run `npx jest <paths>` in each package.
  Expected: FAIL.
- [ ] **Step 3: Add `'BRL'` to every list above.** Run `grep -rn "'CHF'"` over `apps packages` with
  `node_modules`/`.next` excluded. Every hit must also contain `'BRL'`.
- [ ] **Step 4: Run tests plus `npm run typecheck`.** Expected: PASS, 0 errors. Any `Record<Currency, …>`
  the compiler now flags gets a BRL entry.
- [ ] **Step 5: Commit** `ABA-<N> Add BRL as a supported currency`.

---

## Part B — Server (ABA task 2)

### Task 2: Locale resolver and Intl mapper (API + shared-utils pair)

**Files:**
- Create: `apps/api/src/common/utils/app-locale.ts` (canonical)
- Create: `packages/shared-utils/src/formatting/app-locale.ts` (mirror, exported from the
  formatting barrel)
- Test: `apps/api/src/common/utils/app-locale.spec.ts`

**Interfaces:**
- Produces:
  - `resolveAppLocale(tag: string | null | undefined, supported: readonly string[]): string | null`.
    It follows the Global Constraints rule and returns `null` when nothing in `supported`
    matches. It accepts one tag, not a full `Accept-Language` header.
  - `resolveAcceptLanguage(header: string | undefined, supported: readonly string[]): string | null`.
    It walks the comma list in order and returns the first `resolveAppLocale` hit.
  - `toIntlLocale(code: string): string`. `pt`→`pt-PT`, `br`→`pt-BR`, `ua`→`uk-UA`, `be`→`be-BY`,
    `nl`→`nl-NL`, `en`→`en-US`, `ru`→`ru-RU`, `pl`→`pl-PL`, `es`→`es-ES`, `fr`→`fr-FR`,
    `de`→`de-DE`. Unknown codes → `en-US`.

- [ ] **Step 1: Write the spec.** With `S = ['en','pt','br','ua','nl']`:
  - `resolveAppLocale('pt-BR',S)` → `'br'`, `('pt_br',S)` → `'br'`, `('pt',S)` → `'br'`,
    `('pt-PT',S)` → `'pt'`, `('pt-AO',S)` → `'pt'`, `('uk',S)` → `'ua'`, `('nl-BE',S)` → `'nl'`,
    `('xx',S)` → `null`, `(undefined,S)` → `null`.
  - `resolveAcceptLanguage('pt-BR,pt;q=0.9,en;q=0.8',S)` → `'br'`;
    `('fr-FR,pt-PT;q=0.5',S)` → `'pt'`.
  - `toIntlLocale('br')` → `'pt-BR'`, `('pt')` → `'pt-PT'`, `('zz')` → `'en-US'`.
- [ ] **Step 2: Run it and verify it fails.** Run `cd apps/api && npx jest app-locale`.
- [ ] **Step 3: Implement both files with identical logic.** Add a header comment naming the twin
  file and the reason for the pair (the API has no build step for shared-utils).
- [ ] **Step 4: Run the spec.** Expected: PASS.

### Task 3: Glossary + server copy maps

**Files:**
- Create: `apps/mobile/src/i18n/PT_BR_GLOSSARY.md`. It has two columns (PT-PT | PT-BR) and
  about 60 decided terms: the app's core nouns (expense, income, budget, account, category,
  receipt, wallet, debt, goal, subscription, transfer, settings, screen, file, save, delete,
  user, phone, sign in, sign up, statement, invoice …) and the form of address. **PT-PT: "você"
  avoided, impersonal/"o seu"; PT-BR: "você".**
- Modify: add `pt` and `br` entries to each map:
  `apps/api/src/common/bot-i18n/shared-messages.ts`, `modules/telegram/helpers/i18n.ts`,
  `modules/whatsapp/helpers/i18n.ts`, `modules/slack/helpers/i18n.ts`,
  `modules/notifications/notification-i18n.ts`, `modules/mail/onboarding-email-i18n.ts`,
  `modules/mail/app-connected-email-i18n.ts`, `modules/inbound-mail/inbound-mail-push.ts`,
  `modules/purchase-requests/purchase-requests.service.ts`,
  `modules/voice-digest/voice-digest-blocked-i18n.ts`, `modules/voice-digest/digest-text.util.ts`,
  `modules/voice-digest/voice-digest-narrator.service.ts`, `modules/children/child-statement.pdf.ts`,
  `modules/insights/real-salary/real-salary-brief.pdf.ts`, `modules/insights/real-salary/coicop.ts`,
  `modules/ai/services/goal-planner.service.ts`, the three guest-page i18n files
  (`receipt-split/helpers/guest-page-i18n.ts`, `shopping-list/helpers/guest-list-page-i18n.ts`,
  `groups/helpers/group-guest-page-i18n.ts`).
- Modify (duplicated pairs, both sides): `apps/api/src/common/utils/category-catalog.ts` +
  `packages/shared-utils/src/formatting/category-catalog.ts`;
  `apps/api/src/common/utils/deposit-category.ts` +
  `packages/shared-utils/src/formatting/deposit-category.ts`; regenerate
  `category-catalog.snapshot.json` the way its spec documents.
- Test: extend every spec that enumerates locales. These are `shared-messages.spec`,
  `notification-i18n.spec`, `app-connected-email-i18n.spec`, `category-catalog.spec`,
  `default-categories.spec`, `coicop.spec`, `real-salary-brief.pdf.spec`,
  `child-statement.pdf.spec`, `guest.controller.spec`, `group-guest.controller.spec`,
  `inbound-mail.util.spec` and `activation-nudge.cron.spec`. Add `'pt','br'` to their locale
  arrays.

**Interfaces:**
- Consumes: `toIntlLocale` (Task 2) wherever a file builds an Intl/`toLocale*` locale from a
  code. The PDFs, `digest-text.util.ts:321` (replace its `ua`→`uk` special case) and the
  guest-page `intlLocale` fields all use it.
- Produces: the glossary, used by Parts C–E.

- [ ] **Step 1: Write the glossary.**
- [ ] **Step 2: Extend the locale arrays in the specs listed above.** Run
  `cd apps/api && npx jest`. Expected: those suites FAIL on missing `pt`/`br`.
- [ ] **Step 3: Translate.** Add `pt` and `br` to every map, copying the `en` keys exactly. Where a
  map is typed `Record<Lang, …>` or a `Lang` union exists, extend the union. WhatsApp templates
  use `pt_PT`/`pt_BR` as the Meta language code.
- [ ] **Step 4: Run `npx jest` and `npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Translation review gate** (Global Constraints) over the files from Step 3. Apply
  the fixes and re-run the tests.

### Task 4: External tags go through the resolver

**Files:**
- Modify: `receipt-split/helpers/guest-page-i18n.ts:450-480` and
  `shopping-list/helpers/guest-list-page-i18n.ts:169-190`, plus the groups guest-page resolver
  if it has its own. Replace `ACCEPT_LANGUAGE_ALIASES` + `split('-')[0]` with
  `resolveAcceptLanguage`. `?lang=` goes through `resolveAppLocale`.
- Modify: `common/bot-i18n/shared-messages.ts` `createBotT`. The `t(key, lang)` lookup normalises
  `lang` with `resolveAppLocale(lang, Object.keys(messages-locales))` before indexing, falling
  back to `en`. This fixes every Telegram/WhatsApp/Slack call site at once.
- Modify: `mail/mail.service.ts:407` → `new Intl.ListFormat(toIntlLocale(known), …)`.
- Modify: `analytics/analytics.service.ts:620,700`. `effectiveLocale` passes through
  `toIntlLocale` when it is an app code.
- Test: `guest.controller.spec.ts`, `shared-messages.spec.ts`.

- [ ] **Step 1: Write failing tests**
  - Guest page: header `pt-BR,pt;q=0.9` → `lang === 'br'`; `pt-PT` → `'pt'`; `uk-UA` → `'ua'`
    (regression).
  - Bot `t('linkFirst','pt-br')` equals `messages.br.linkFirst`; `t('linkFirst','pt')` equals
    `messages.br.linkFirst`; `t('linkFirst','pt-PT')` equals `messages.pt.linkFirst`.
- [ ] **Step 2: Run them and verify they fail.**
- [ ] **Step 3: Implement the edits above.**
- [ ] **Step 4: Run `npx jest` (whole API).** Expected: PASS.

### Task 5: Chat language detection and variant

**Files:**
- Modify: `apps/api/src/modules/ai/services/prompt-builder.service.ts:29-75` and its fixed-string
  `switch` statements (`case 'Dutch'`, ~10 sites in `prompt-builder.service.ts` and
  `chat.service.ts`)
- Modify: `categorize-suggestions.service.ts`, `categorize-income-suggestions.service.ts`,
  `ocr.service.ts`, `receipt-category-split.service.ts` (their `LANGUAGE_NAMES` maps: `pt` →
  `European Portuguese`, `br` → `Brazilian Portuguese`)
- Test: `prompt-builder.service.spec.ts`

**Interfaces:**
- `detectLanguage(text)` may now return `'Portuguese'`.
- `localeToLanguageName('pt')` → `'European Portuguese'`; `('br')` → `'Brazilian Portuguese'`.
- `detectUserLanguage` maps a detected `'Portuguese'` to the UI variant
  (`localeToLanguageName(uiLanguage)` if it is a Portuguese variant, else
  `'Brazilian Portuguese'`).

- [ ] **Step 1: Write failing tests**
  - `detectLanguage('Gastei 20 euros no café hoje')` → `'Portuguese'` (no ã/õ, so common-word path)
  - `detectLanguage('Comprei pão e feijão')` → `'Portuguese'` (ã)
  - `detectLanguage("J'ai payé 5 euros au café")` → `'French'`
  - `detectLanguage('Gasté 20 euros en el café')` → `'Spanish'`
  - `detectUserLanguage('Comprei pão', [], 'pt')` → `'European Portuguese'`;
    `(…, [], 'br')` → `'Brazilian Portuguese'`; `(…, [], 'en')` → `'Brazilian Portuguese'`
  - every fixed-string helper that switches on a language returns non-English text for both
    variants (one assertion per helper, e.g. the shopping-list removal reply at line ~444)
- [ ] **Step 2: Run and verify it fails.**
- [ ] **Step 3: Implement.** Order matters. The Portuguese check runs **before** the French/Spanish
  block: `ã`/`õ` → Portuguese, else a word list
  (`\b(gastei|paguei|comprei|hoje|ontem|não|você|despesa|receita|conta|dinheiro|mercado|orçamento)\b`)
  → Portuguese. The fixed-string switches gain `case 'European Portuguese'` and
  `case 'Brazilian Portuguese'`. For bare `'Portuguese'`, use the Brazilian string.
- [ ] **Step 4: Run `npx jest prompt-builder chat`.** Expected: PASS.
- [ ] **Step 5: Translation review gate** over the new switch strings.
- [ ] **Step 6: Commit Part B** as one squashed commit
  `ABA-<N> Serve Portuguese (PT and BR) from the API, bots and chat`.

---

## Part C — App (ABA task 3)

### Task 6: Registration, device mapping, scattered maps

**Files:**
- Modify: `apps/mobile/src/i18n/index.ts`. Add `SUPPORTED_LANGUAGES` entries
  `{ code: 'pt', label: 'Português (Portugal)', flag: 'PT' }` and
  `{ code: 'br', label: 'Português (Brasil)', flag: 'BR' }`. `intlLocaleMap` gets
  `pt: 'pt-PT', br: 'pt-BR'`. `resources` gets both. `getDeviceLanguage()` uses `resolveAppLocale`
  from shared-utils with `locales[0].languageTag`. For `pt` with an empty region, the
  constraints rule yields `br`.
- Modify: `apps/mobile/src/utils/categoryDisplayName.ts:25` (`catalogLocale` → `resolveAppLocale`),
  `src/features/developers/developerApps.ts:13`, `src/components/ColorPicker.tsx`,
  `src/features/children/useChildStatement.ts`, `plugins/launcherShortcuts.json`
  (Android resource dirs `values-pt-rPT` / `values-pt-rBR`, matching how the plugin maps `uk`).
- Test: `src/utils/__tests__/categoryDisplayName.test.ts`,
  `src/features/launcherShortcuts/__tests__/launcherShortcuts.test.ts` (`LOCALES` gets `pt`,`br`),
  new `src/i18n/__tests__/deviceLanguage.test.ts`.

- [ ] **Step 1: Write failing tests.** Mock `getLocales()`:
  - `pt-BR` → `'br'`
  - `pt-PT` → `'pt'`
  - `pt` (no region) → `'br'`
  - `uk-UA` → `'ua'`
  - `ja-JP` → `'en'`

  Also: `catalogLocale('pt-BR')` → `'br'`.
- [ ] **Step 2: Run `cd apps/mobile && npx jest i18n categoryDisplayName launcherShortcuts`.**
  Expected: FAIL.
- [ ] **Step 3: Implement.** The locale files may be stubbed as `export default {}` until Task 7.
- [ ] **Step 4: Run the tests.** Expected: PASS.

### Task 7: `pt.ts` and `br.ts`

**Files:**
- Create: `apps/mobile/src/i18n/locales/pt.ts`, `apps/mobile/src/i18n/locales/br.ts`
- Test: create `apps/mobile/src/i18n/__tests__/localeParity.test.ts`

- [ ] **Step 1: Write the parity test.** It covers `pt` and `br` only, because older locales may
  already drift. Assert:
  - The set of flattened key paths equals `en`'s exactly.
  - For every key, the sorted `{{name}}` placeholders equal `en`'s.
  - No value equals its own key path.
- [ ] **Step 2: Run it and verify it fails** (stubs are empty).
- [ ] **Step 3: Translate.** Use `en.ts` (3,789 lines) as the source. Work in top-level-namespace
  chunks of about 400 lines, one subagent per chunk and variant. Each subagent gets the glossary
  and the namespace, and returns a TS object fragment. Assemble the fragments in `en.ts` key
  order and keep `as const`.
- [ ] **Step 4: Run the parity test plus `npm run typecheck` (mobile).** Expected: PASS.
- [ ] **Step 5: Translation review gate**, chunked the same way.

### Task 8: Admin pickers and repo rules 9 → 11

**Files:**
- Modify: `apps/admin/src/components/communications/BroadcastTab.tsx:97` (add
  `<SelectItem value="pt">Portuguese (Portugal)</SelectItem>` and
  `value="br"` `Portuguese (Brazil)`), `apps/admin/src/app/app-versions/page.tsx:29` (`LOCALES`).
- Modify: `CLAUDE.md` i18n bullet (11 locales, list `pt.ts`, `br.ts`, note the `br`≠Breton Intl
  rule and the resolver pair), `.claude/skills/i18n-add-strings/SKILL.md`,
  `.claude/agents/aba-code-reviewer.md`, `.claude/skills/add-help-section/SKILL.md`, and every
  other "9 locales"/"all 9" mention found by `grep -rn "9 locale\|all 9\|nine" CLAUDE.md .claude docs/wiki`.
- Note: `.claude/agents/*.md` already have unrelated local modifications (an auto-commit process
  pushes them). Stage only the lines this task changes (`git add -p` is unavailable, so edit and
  commit just those files after checking `git diff` shows only this task's lines; otherwise
  leave the agent file and mention it in the ABA issue).

- [ ] **Step 1: Edit.** Then run `cd apps/admin && npm run typecheck`. Expected: 0 errors.
- [ ] **Step 2: Commit Part C** as one squashed commit
  `ABA-<N> Add Portuguese (Portugal) and Portuguese (Brazil) to the app`.
- [ ] **Step 3: Full check.** Run `npm run typecheck && npm run lint && npm run test` at the root.
  Expected: all green. Then ask the user to approve pushing Parts A–C together.

---

## Part D — Help (ABA task 4)

### Task 9: `user_docs/pt` and `user_docs/br`

**Files:**
- Create: `user_docs/pt/*.md` and `user_docs/br/*.md` (47 each, same filenames as `user_docs/en`)
- Modify: `scripts/generate-help-content.js:4,144` (`LANGUAGES`, `HelpLanguage`),
  `docs/marketing/help/build_help.py` (language list, hreflang `pt-PT`/`pt-BR`)
- Regenerate: `apps/mobile/src/help/content.ts` (`npm run generate:help`, never by hand); the
  public help site (follow the `add-help-section` skill's regeneration command, with
  `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`)

- [ ] **Step 1: Translate the 94 files.** Use subagents, about 8 files each, with the glossary.
- [ ] **Step 2: Translation review gate.**
- [ ] **Step 3: Regenerate and verify.** Run `npm run generate:help`. Expected: "Generated … across
  11 languages". The help-site build exits 0. `git add -f` the generated pages.
- [ ] **Step 4: Commit Part D** as one commit.

## Part E — Marketing (ABA task 5)

### Task 10: Landing, store listings, store assets, GSC

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` (pt/br landing, hreflang `pt-PT`/`pt-BR`,
  BRL prices **not** shown, USD stays), `docs/marketing/seo/build_blog.py`,
  `build_pillar_links.py`, `build_excel_template.py` (register the languages so the language
  switcher and hreflang include them; no articles yet), `docs/marketing/scripts/build_store_assets.py`,
  `docs/marketing/copy/google-play-listings.md` (`pt-PT` and `pt-BR` listings, Play limits 30/80
  chars), `scripts/gsc-snapshot.py:38` (`LANGS`)
- Regenerate the landing with `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`.

- [ ] **Step 1: Write the copy.** Run the translation review gate on it.
- [ ] **Step 2: Rebuild.** Every generator exits 0. The new pages exist. Each pt/br page carries
  `hreflang="pt-PT"` and `hreflang="pt-BR"` alternates, and no generated page carries `noindex`.
  Use `git add -f`.
- [ ] **Step 3: Commit Part E.**

### Wrap-up

- [ ] Next release: `<version>-app-versions.md` has 11 locales (memory rule
  "bump version → release notes").
- [ ] Create a follow-up issue: "BRL subscription pricing" (out of scope, per spec).
