# Income by voice and by receipt

*Hub: [ai-features](../ai-features.md) · related: [chat-architecture](chat-architecture.md)*

## What this is

The income-side twins of the expense voice and receipt-scan flows: the user says "got 3,000
salary from work" or photographs an invoice or payslip, and the app prefills an income for them to
confirm. Without these, AI capture only ever produced expenses.

## Entry points

- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/parse-income` (and its expense twin
  `POST /ai/parse-expense`)
- `apps/api/src/modules/ai/services/categorization.service.ts` — `parseIncomeFromText`
- `apps/mobile/app/income/voice.tsx` — record → `api.transcribeAudio` (Whisper) →
  `api.parseIncome` → confirm form
- `apps/mobile/app/income/receipt.tsx` — camera / gallery / PDF → `useReceiptScanner`
  (`POST /ai/scan-receipt`) → confirm
- `apps/mobile/src/services/ai.api.ts` — `parseIncome`
- Reached from the home quick-action strip (`voice_income`, `scan_invoice` in
  `apps/mobile/src/components/home/HomeQuickActionStrip.tsx`, both hidden by default) and from the
  voice/receipt buttons of `IncomeCreateForm` on `apps/mobile/app/income/new.tsx`
- `packages/shared-types/src/entities/primitives.ts` — `IncomeSource`

## Key concepts

- **`parse-income` matches against income categories only** (`type: 'income'`, system and the
  account's own), with the same history and embedding hints the expense parser uses. It is
  `AiUsageGuard`-gated and metered as one `parse` request; transcription is metered separately as
  `voice`, the scan as `ocr`.
- **Receipt capture for an income keeps the total and the date only** — no line items, no category
  split. Line items are an expense concept (price history, splits, shopping-list reconciliation).
- **`Income.source`** records where an income came from: `voice` and `ocr` here, `manual`, `import`,
  and the three bot sources. It is a Prisma column (`20260602000000_add_income_source`) and a
  mobile SQLite column added by an `ALTER TABLE` in `apps/mobile/src/db/client.native.ts`, default
  `manual`.

## Invariants

- **An expense parser must never be reused for an income** — it would match the text against
  expense categories and file a salary under groceries. The two endpoints differ only in that.
- **Both flows end on a confirm form**, never a silent write: the parse is a guess.

## Known gaps

- `app/income/voice.tsx` and `app/income/receipt.tsx` still live in `app/`, so the desktop
  dashboard's quick links cannot host them (see `railQuickLinks.ts`).
- The batch-scanning session counter and the scan-another checkpoint exist only on the expense
  receipt flow.

## History

- ABA-191 — `POST /ai/parse-income`, both screens, `Income.source`.
