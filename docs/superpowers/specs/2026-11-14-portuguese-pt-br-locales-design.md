# Portuguese (Portugal) and Portuguese (Brazil) — two new locales + BRL

Status: awaiting approval · 2026-11-14

## Intent

Open the product to two Portuguese-speaking markets at once: Portugal and Brazil. They get
**two separate, complete languages**, not one "neutral Portuguese". The vocabulary and register
differ throughout (ecrã/tela, ficheiro/arquivo, guardar/salvar, utilizador/usuário,
telemóvel/celular, the gerund), so a shared text reads as foreign to one side. Brazil also needs
its own currency, **BRL**. Without it a Brazilian user can switch the app to their language but
cannot keep their books in their own money. BRL is part of this project.

## Goals

- Two app languages, picked in Settings and detected from the device. **Português (Portugal)**
  uses internal code `pt` and Intl/hreflang `pt-PT`. **Português (Brasil)** uses internal code
  `br` and Intl/hreflang `pt-BR`.
- Every surface that has the nine languages today also has both new ones: the mobile/web app,
  server pushes, e-mails, all three bots, the three guest pages (`s/`, `sl/`, `g/`), the AI chat
  (replies, confirmations, fixed strings), PDFs, the category catalog, the help system (in-app
  and public), the landing, the store listings and the admin broadcast picker.
- BRL is a first-class currency everywhere the other 14 are: the type, validation, constants,
  formatting, FX rates, chat tools, rate alerts, the AI statement import and the notification
  parser.
- The AI chat recognises Portuguese and answers in the user's variant.

## Non-goals

- A blog cluster (SEO articles) in pt/br. It is a separate follow-up through `blog-writer`.
- Brazilian or Portuguese bank-statement parsers. The AI universal import already covers unknown
  CSV/PDF formats.
- Brazil-specific features (Pix, NFC-e QR receipt fetch, parcelamento).
- New native app store builds beyond the normal next release.
- Subscription prices in BRL (`pricing-data.json`, Stripe products). This is a separate follow-up
  task after launch. Until then, Brazilian users see subscription prices in USD.
- Native-speaker review. The model's translation ships directly (user decision); quality is
  covered by the reviewer-agent pass below.

## Anti-goals (failure even if it "works")

- A Brazilian user silently seeing European Portuguese, or the reverse, because a lookup collapsed
  `pt-BR` to `pt`. This is why the internal code is `br` and not `pt-BR`.
- A Portuguese chat message answered in French or Spanish. Today's `detectLanguage` would send
  `ç/à/â/ê/ô` to French and `á/í/ó/ú` to Spanish.
- A key that renders as its raw key string, because i18next falls back to the key and not to
  English (see the What's New spotlight invariant).
- Mixing variants inside one locale file. Each file must be consistent PT-PT or consistent PT-BR.

## Constraints (from the codebase)

- Mobile: `apps/mobile/src/i18n/index.ts` holds `SUPPORTED_LANGUAGES`, `intlLocaleMap`,
  `resources` and `getDeviceLanguage()`. Today `getDeviceLanguage()` uses `languageCode` only.
  It must also read `regionCode` and map `pt` + `BR` → `br`, any other `pt` → `pt`. The
  source file `en.ts` is ~3.8k lines.
- Server: ~40 non-test files carry a per-locale map or `case 'Dutch'` switch (grep `nl:` /
  `'nl'` / `'Dutch'`). Several call sites normalise with `locale.split('-')[0]`. That works for
  `br` as-is, and is exactly why `pt-BR` would have been wrong.
- `PromptBuilder.detectLanguage` decides on letters unique to a language. Portuguese-only
  letters are `ã/õ`. Common-word fallback (like Dutch's) covers messages without them. Letters
  cannot tell PT from BR, so detection returns "Portuguese" and the variant comes from the UI
  locale (`user.language`). When the UI locale is not `pt`/`br`, the default variant is
  Brazilian (the larger speaker base).
  `localeToLanguageName` maps `pt` → `European Portuguese`, `br` → `Brazilian Portuguese`, so
  the prompt names the variant explicitly.
- `user.language` is a free `String` with no `@IsIn`, so the DB and DTO need no migration.
- The currency list is duplicated in ~10 places (`primitives.ts`, `CurrencySchema`, shared-utils
  constants/formatting, `ai-tool-schemas.ts`, `exchange-rate.service.ts`,
  `exchange-rate-alerts.service.ts`, `statement-ai.validator.ts`, the notification parser
  `generic.ts`) and in the chat prompt's symbol map. All get BRL, and the prompt gets `R$=BRL`.
  The FX source `open.er-api.com` serves BRL. Formatting: `{ symbol: 'R$', locale: 'pt-BR',
  position: 'before' }`.
- Repo rules that say "9 locales" (CLAUDE.md i18n bullet, the `i18n-add-strings` skill, the
  `aba-code-reviewer` agent, the help-section skill, release-notes `<version>-app-versions.md`)
  become 11 in the same task that adds the locales. Otherwise the next contributor ships a key
  without pt/br.
- Tests that enumerate locales (`notification-i18n.spec`, `shared-messages.spec`,
  `category-catalog` snapshot, guest-page specs, `launcherShortcuts` test, etc.) are extended,
  not loosened.
- Help: a new language is a new `user_docs/<lang>/` folder (47 sections) plus the language lists
  in `scripts/generate-help-content.js` and `docs/marketing/help/build_help.py`.
  `docs/marketing/` is gitignored: generated pages need `git add -f`.

## Approaches

1. **Two complete, independent locales (chosen).** Full `pt.ts` and `br.ts`, two entries in
   every server map. Twice the translation, but each market gets its whole language. It fits
   the existing parity checks unchanged.
2. **`br` as a delta over `pt` via i18next fallback.** Less text, but the differences are
   pervasive, so the delta stays large. A missed key silently shows a European word to a
   Brazilian. The server has no fallback chain, so ~40 call sites would need a new helper.
   Rejected.
3. **One neutral Portuguese.** Rejected by the user: two languages were asked for.

Codes: internal `pt` / `br`, following the existing `ua` precedent. Externally `pt-PT` / `pt-BR`
for Intl, hreflang and Play.

### Resolving an external tag to `pt` / `br` (my call)

Stored codes are always `pt`/`br`. Every place that reads a language tag from **outside** must
go through one shared resolver. That covers `Accept-Language` on the guest pages
(`guest-page-i18n.ts`, `guest-list-page-i18n.ts`, the groups page), the Telegram/WhatsApp/Slack
`language_code`, and the device locale. These readers must never use a bare `split('-')[0]`,
which would turn `pt-BR` into `pt`. The rule is:

- `pt-BR` / `pt_BR` / `pt-br` → `br`
- `pt-PT` and other regional `pt-*` (AO, MZ, CV, …) → `pt`
- **bare `pt` with no region → `br`** (the larger speaker base; the same default as chat)
- device: `languageCode` `pt` + `regionCode` `BR` or no region → `br`; any other region → `pt`

API side: a small util under `apps/api/src/common/utils/`. Mobile side: inside
`getDeviceLanguage()`. The existing `uk`→`ua` alias moves into the same resolver. Every external
reader gets a test for `pt-BR`, `pt-PT` and bare `pt`.

## Delivery stages (my call)

Each stage is its **own ABA task with one squashed commit**, following the repo's
one-commit-per-task rule. Pushing deploys, so stages 1–3 are pushed **together**, in the order
2 → 3 → 1. The API then accepts BRL and answers in pt/br before any user can pick either in the
app. If they went out one by one, a `br` user would get English pushes and bots, and BRL rows
would be rejected by sync. Stages 4 and 5 can follow separately.

1. **Foundation + app.** Mobile `pt.ts` and `br.ts` with full translation, registration,
   device-language mapping, Intl, the settings picker and the scattered mobile maps
   (`launcherShortcuts.json`, `ColorPicker`, children statement, etc.). Repo rules "9 → 11".
2. **BRL.** Every currency list above, the prompt symbol map and the formatting entry.
3. **Server.** All server maps (pushes, e-mails, bot shared messages, bot platform copy, guest
   pages, category catalog + snapshot, OCR/categorisation prompts, voice digest, PDFs,
   purchase requests, inbound mail), plus chat detection, variant naming and the chat's
   fixed-string switches.
4. **Help.** `user_docs/pt` and `user_docs/br`, regenerated `content.ts`, the public help center.
5. **Marketing and admin.** Landing pt/br with hreflang `pt-PT`/`pt-BR`, Google Play listings
   (both store locales), store assets, `gsc-snapshot.py` `LANGS`, the admin broadcast language
   picker.

### Translation review (user decision)

The model translates. Then, in every stage that adds text, a **separate reviewer agent** (a
fresh subagent that did not write the translation) proofreads the pt and br text before the
commit. It checks for:

- European words in `br`, or Brazilian words in `pt`, measured against the glossary;
- mistranslations and meaning drift from `en`;
- broken `{{placeholders}}`, plural forms and HTML/markdown markup;
- awkward or machine-sounding phrasing, especially in financial terms;
- forbidden wording from the existing copy invariants (for example, the receipt price check
  must never say "overcharged", and deposits must be "already paid").

The translator fixes the findings before the commit. Shipping does not wait for a human.

Release notes for the next version get a `<version>-app-versions.md` in 11 locales.

## Left to the builder

- Translation is done by the model per stage. Each file must stay internally consistent in
  register and vocabulary. Keep a short PT↔BR glossary (decided terms) in the stage-1 commit and
  reuse it in later stages.
- The common-word list for Portuguese detection, and its tests (including PT vs FR/ES
  disambiguation cases).
- Exact flag/label strings in the picker.
