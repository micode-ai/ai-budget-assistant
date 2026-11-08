# Supported currencies

## What this is
The set of currency codes a user can pick for expenses, wallets, budgets and the base currency. It is a plain string everywhere in storage, so adding a code needs no migration.

## Entry points
- `packages/shared-types/src/entities/primitives.ts` — the `Currency` union (source of truth).
- `packages/shared-utils/src/constants/index.ts`, `validation/index.ts`, `formatting/index.ts` — picker list, zod enum, formatter table (a `Record<Currency, …>`, so a missing entry fails typecheck).
- API copies: `currency-exchange/exchange-rate.service.ts` (`SUPPORTED_RATE_CURRENCIES`), `exchange-rate-alerts.service.ts`, `ai/services/ai-tool-schemas.ts`, `import-bank/ai/statement-ai.validator.ts`.
- `apps/mobile/src/services/notificationParser/generic.ts` — `SUPPORTED_CURRENCIES`, `SYMBOL_TO_ISO`.
- Parity test: `apps/mobile/src/features/currencies/__tests__/supportedCurrencies.test.ts`.

## Invariants
- All lists carry the same codes; the API cannot import shared-utils at runtime, so its copies are hand-kept. A new code goes in every place above.
- A bare `kr` is never mapped to an ISO code (SEK, NOK or DKK); only the ISO code identifies it. Bare `Ft` and `Fr.` are also unmapped.
- Specs that need an "unsupported" currency use JPY or a fake code, never a code that may be added later.
- Mobile currency pickers derive their list from `SUPPORTED_CURRENCIES` (`account/create`, `wallet/rate-alerts`, `ConverterView`, `ExchangeView`, `SetBalanceView`, `TransferAccountCard`) — a hard-coded copy left six pickers on the old seven codes when ABA-721 first landed. The API's hand-kept copies also include the bots' `parse-amount.ts` code regex (Telegram and WhatsApp), the Money Manager parser's code regex, and the symbol mappings in `prompt-builder.service.ts` and `price-tag.service.ts`.

## Known gaps
No per-bank resolution of `kr`; the group-bot symbol regex lists only the original symbols.

## History
ABA-721 added CZK, SEK, NOK, DKK, HUF, RON, CHF.
