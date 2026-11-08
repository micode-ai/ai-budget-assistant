# Contract: supported currencies

Source of truth: `Currency` in `packages/shared-types/src/entities/primitives.ts`.
Every list below must contain exactly the same codes (guarded by a spec in shared-utils):

| Place | Symbol |
|---|---|
| `SUPPORTED_CURRENCIES` (shared-utils constants) | list |
| `CurrencySchema` (shared-utils validation) | zod enum |
| `currencyConfig` (shared-utils formatting) | Record<Currency,...> (compile-time exhaustive) |
| `SUPPORTED_RATE_CURRENCIES` (API exchange-rate.service) | provider filter |
| `SUPPORTED_CURRENCIES` (exchange-rate-alerts.service, notification parser) | local copies |
| `CURRENCY_CODES` (ai-tool-schemas) | LLM enum |
| `SUPPORTED_AI_CURRENCIES` (statement-ai.validator) | import validation |

Rules: `kr` is never mapped to an ISO code (SEK/NOK/DKK ambiguity) — the ISO code must be present.
No DB migration: `currencyCode` columns are strings.
