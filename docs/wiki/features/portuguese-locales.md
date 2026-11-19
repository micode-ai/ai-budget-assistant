# Portuguese locales (Portugal and Brazil)

## What this is
Two complete app languages: European Portuguese (`pt`) and Brazilian Portuguese (`br`). They are
separate languages, not one translation plus a delta. Vocabulary and the form of address differ
throughout, so a shared text would read as foreign to one side. BRL arrived with them, so a
Brazilian user can keep their books in their own money.

## Entry points
- `apps/api/src/common/utils/app-locale.ts` and its twin
  `packages/shared-utils/src/formatting/app-locale.ts`, which provide `resolveAppLocale`,
  `resolveAcceptLanguage` and `toIntlLocale`. The parity test is
  `apps/mobile/src/i18n/__tests__/appLocaleParity.test.ts`.
- `apps/mobile/src/i18n/index.ts` handles registration, `getDeviceLanguage`, `getIntlLocale` and
  the plural-rule override. The locale files are `locales/pt.ts` and `locales/br.ts`, guarded by
  `__tests__/localeParity.test.ts`.
- The glossary is `apps/mobile/src/i18n/PT_BR_GLOSSARY.md`. It holds the decided PT-PT and PT-BR
  terms, binding for every new string.
- In chat, `PromptBuilder.detectLanguage` / `detectUserLanguage` live in
  `apps/api/src/modules/ai/services/prompt-builder.service.ts` (see
  [chat-architecture](chat-architecture.md), section *Language*).

## Key concepts
- **Internal vs external codes.** Stored codes (`user.language`, the app's saved language, the
  `?lang=` on our own share links) are internal and match **exactly**: `pt` always means
  European. External tags (browser `Accept-Language`, a bot's `language_code`, the device locale)
  go through `resolveAppLocale`, which maps them as follows:
  - `pt-BR` → `br`;
  - any other `pt-*` → `pt`;
  - bare `pt` → `br`, because Brazil is the larger speaker base;
  - `uk` → `ua`.
- **Never `br` into `Intl`.** To `Intl`, `br` means Breton (month names, plural categories).
  Every Intl, `toLocale*` and i18next plural call maps through `toIntlLocale` / `getIntlLocale`,
  which give `pt-PT` and `pt-BR`. i18next's `pluralResolver.getRule` is wrapped for the same reason.
- **Chat variant.** Letters cannot tell PT from BR, so detection returns `Portuguese` and the UI
  locale picks the variant (European for `pt`, Brazilian for anything else). The word list is
  vetoed by Spanish-only words, and shared words such as `mercado` and `gastos` decide nothing.
- **External emission.** HTML `lang`, hreflang and Play listings use `pt-PT` / `pt-BR`. URL path
  segments are `/pt/` and `/br/`. Meta WhatsApp templates use `pt_PT` / `pt_BR`.

## Invariants
- A stored `pt` stays European on every path. Re-resolving an internal code turned it Brazilian
  twice during the build: once in the bot lookup and once in `catalogLocale`.
- `pt` and `br` copy is never copied from one to the other; the glossary decides terms. A URL is
  a "link" in both; "ligação" means a network connection only.
- Plan names stay Free / Pro / Business. Brazil sees BRL prices once all four `_BRL` Stripe keys
  exist (ABA-757). Feature names are translated: Fat Finder is "Auditoria de despesas", Financial
  Wrapped is "Resumo do ano", in the app, help and landing alike.

- The `getRule` wrapper remaps only the OUTERMOST call. Hermes on Android has no
  `Intl.PluralRules`, so `pt-PT` always throws there and i18next retries with `this.getRule('pt')`;
  remapping that retry recursed forever and crashed the home tab for every pt/br Android user
  (ABA-835). Pinned by `__tests__/pluralRulesWithoutIntl.test.ts`.

## Known gaps
- On Android every language uses i18next's one/other fallback (no `Intl.PluralRules` in Hermes),
  so the pt-PT/pt-BR distinction this page describes only takes effect on web.
- Report PDF labels have no pt/br. Exact-million counts hit ICU's `many` category and fall back to
  English (as es/fr already do).
- A Breton-locale external tag `br` resolves to Brazilian Portuguese, on purpose.

## History
- [ABA-755](https://github.com/micode-ai/ai-budget-assistant/issues/793): both locales, BRL, help,
  site. Design: `docs/superpowers/specs/2026-11-14-portuguese-pt-br-locales-design.md`.
- ABA-757 BRL prices, ABA-758 pt/br blog and localized screenshots.
- [ABA-761](https://github.com/micode-ai/ai-budget-assistant/issues/799): post-launch review; ship-quality, calques and English feature names fixed.
- [ABA-835](https://github.com/micode-ai/ai-budget-assistant/issues/873): infinite plural-rule recursion on Android fixed.
