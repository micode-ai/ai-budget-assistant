# Receipt Split via Guest Link — Design (v1)

> **Elevator pitch:** photograph a restaurant bill, tap the dishes each person had, and send everyone a link with their own amount and a ready-to-pay BLIK / Revolut / PayPal button. **The recipient does not need an account.** Each shared dinner becomes 3–4 first-touch impressions of the product.

## Why this feature and not another sharing feature

Every sharing surface the app already has — Trip Wallet, Family Feed, Purchase Requests, shared-account settle-up — operates **inside an account that already exists**, i.e. between people who are already users. None of them can acquire anyone. This is the first feature whose normal, non-viral, everyday use puts the product in front of a stranger, with a real reason to open it (money they owe) and a natural conversion moment (the "I paid" tap).

It rides almost entirely on machinery that already exists:

| Already built | Reused for |
|---|---|
| Receipt OCR → `expense_items` (`description`, `quantity`, `unitPrice`, `totalPrice`) | the line items being assigned |
| `resolveShares` (`modules/expenses/trip-share-calculator.ts`) | the "just split equally" mode |
| Payment-link generation (`trip-settle-up.service.ts:177` — `revolut.me` / `paypal.me` / BLIK) | the guest's pay button |
| Debts as flags on `Expense`/`Income` (`isDebt`, `debtContactName`, `Income.relatedDebtExpenseId`) | receivable tracking, reminders, one-tap settle, AI commands |
| `slack/helpers/oauth-pages.ts` (server-rendered HTML) + `setGlobalPrefix({ exclude })` | the public guest page |
| `RedisThrottlerStorage` + `@Throttle` (precedent `GET /users/search`) | rate limiting the public routes |
| `SettleUpTransaction` `pending → confirmed` | the claim/confirm handshake |

## Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| **Receivable tracking** | Reuse the existing debts mechanism — one `isDebt` `Expense` per guest, `debtContactName` = the guest's name. Free reminders, one-tap settle, per-contact summary, AI `record_debt_repayment`. |
| **Guest capability** | Read + a single write: **"I paid"** → author confirms. Mirrors `SettleUpTransaction`'s `pay` → `confirm` handshake. |
| **Double-counting** | The original receipt expense **stays whole**; only split-generated debt rows are excluded from consumption totals, via a new explicit marker. Standalone debts are untouched. |
| **Guest page hosting** | HTML rendered by the API, proxied so the public URL sits on the apex: `https://ai-budget.pl/s/<token>`. |

### Non-goals for v1

- Guest disputing an assignment ("that wasn't my dish") — v2; it forces post-hoc recalculation of already-created debt rows.
- Multi-currency splits. One split = the receipt's currency, no FX.
- Splitting an E2EE (tier-2) account's expense — explicitly rejected, see *Edge cases*.
- Offline creation of a split. Tokens are server-generated, so this is an online action like `moveExpense`.
- Reminder cron for unpaid guests. The existing debt-reminder cron already nags the author about the receivable.

## Data model

### New table

```prisma
model ReceiptSplitParticipant {
  id            String    @id @default(uuid())
  accountId     String    @map("account_id")
  expenseId     String    @map("expense_id")
  name          String                              // display name typed by the author
  token         String    @unique                   // 32 hex chars = 128 bits
  amount        Decimal   @db.Decimal(12, 2)
  currencyCode  String    @map("currency_code")
  itemIds       Json?     @map("item_ids")          // assigned expense_item ids; null = equal split
  debtExpenseId String?   @map("debt_expense_id")   // the isDebt Expense created for this guest
  openedAt      DateTime? @map("opened_at")          // first view — funnel metric
  claimedAt     DateTime? @map("claimed_at")         // guest tapped "I paid"
  settledAt     DateTime? @map("settled_at")         // author confirmed
  expiresAt     DateTime  @map("expires_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  expense Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)

  @@index([expenseId])
  @@map("receipt_split_participants")
}
```

The table holds **the link and its state**. The debt itself stays in `Expense`, so nothing about "who owes me" moves to a second mechanism.

### New column on `Expense`

```prisma
isSplitReceivable Boolean @default(false) @map("is_split_receivable")
```

Meaning: *this row exists in the ledger but is not consumption.* It must be a real column, not a join through `debtExpenseId`, because the same filter has to run in mobile SQLite where a join per aggregation is not viable.

Propagation checklist for the column: `packages/shared-types` `Expense` entity → Prisma migration → `apps/mobile/src/db/schema/index.ts` → `ALTER TABLE expenses ADD COLUMN is_split_receivable INTEGER` in `client.native.ts` → `expenseRepository` insert/upsert/row-mapping → sync payload.

### The author is not a participant row

The author's own share is implicit: `expense.amount − Σ participant.amount`. Storing it would create a row whose token nobody should ever receive.

## Accounting — the correctness core

A 200 zł bill split with three guests at 50 each:

| Row | Cash-flow surfaces (wallet balance, net profit) | Consumption surfaces (analytics, budgets, home totals) |
|---|---|---|
| Original receipt expense, 200 | counted | counted |
| 3 debt rows, 50 each (`isDebt` + `isSplitReceivable`) | **excluded** | **excluded** |
| Repayment, 50 (`Income`, `isDebtRepayment`) | counted | counted |

Two-month total: `−200 + 150 = −50` — exactly the author's own share.

**Why the exclusion is narrow.** "Exclude all `isDebt` rows" is wrong. For a standalone cash loan ("I handed Kolya 500"), the debt `Expense` **is** the outflow — excluding it would silently rewrite the numbers of every user already tracking debts. Duplication arises only when the outflow is *already* recorded by another row, which is exactly the split case. Hence the dedicated marker, and hence **no data migration and no change to existing users' historical figures.**

**Where the filter lives.** Not in `loadAllExpenses` (`expenseRepository.ts:133`), even though that is where `isPlanned` is filtered. On native, `debtStore` reads a separate query (`loadDebtExpenses`), so filtering there would be safe — but on **web** `debtStore` derives debts from the same in-memory `expenseStore.expenses` array (`debtStore.ts:49`), so hiding the rows at load time would empty the web debts screen.

Instead: one shared helper `filterConsumption(expenses)` in `apps/mobile/src/utils/`, called from `useAnalytics`, budget-progress computation, and the home-screen totals. One place to change, several call sites.

Server-side, the same exclusion is needed in `AnalyticsService.getSummary` (read by the AI tools), `SafeToSpendService`, and `BudgetAlertService`.

**Deliberate, not a bug:** the debt rows *do* remain visible in the Expenses tab list, exactly as manually created debts do today. Their amounts no longer distort any total, and a visible "Kolya · 50 zł" row is informative. If it turns out to clutter, filtering the list is a follow-up, not part of v1.

**Known trade-off:** the full 200 zł stays in the "Restaurants" category even though only 50 was the author's. This is the honest cash-flow view, and the 150 receivable is visible next to it. The alternative — shrinking the expense to the author's share — was rejected because it breaks two invariants: `amount` would stop matching the sum of `expense_items`, and a 200 zł bank-notification push would no longer reconcile against a 50 zł expense, so Android auto-capture would create a phantom duplicate.

## Pure functions

`resolveItemSplit(items, assignments)` — new, alongside `resolveShares`:

- an item assigned to N participants is divided equally among them;
- unassigned items go to the author;
- the rounding remainder goes to the author (not to the last participant as in `resolveShares` — the author absorbs residuals because they are the one who paid);
- returns `{ participantId, amount }[]` plus the author's residual share.

`resolveShares` is reused **unchanged** for the equal-split mode: its `RawShare.userId` field acts as an opaque id, so participant ids can be passed through it directly.

One ordering requirement makes the two paths agree on rounding: `resolveShares` assigns the residual cent to the **last** entry, so the author must be passed **last** in the equal-split call. Then the author absorbs the remainder in both modes, and no guest is ever asked for a cent more than their arithmetic share. Cover this with an explicit test — it is invisible in the code and easy to break by reordering a list.

(Optional cleanup, out of v1 scope: rename that field to `participantId` at its two call sites for honesty.)

## API surface

### Authenticated (`JwtAuthGuard + AccountContextGuard + ViewerBlockGuard + TripArchivedGuard`)

```
POST   /expenses/:id/split                            create a split
GET    /expenses/:id/split                            current state for the status view
PATCH  /expenses/:id/split/:participantId/confirm     author confirms repayment
DELETE /expenses/:id/split                            cancel (soft-delete debt rows + drop participants)
```

- `POST` is **idempotent**: if a split already exists for the expense, return it instead of creating a second set of tokens (the ABA-316 pattern — pre-check, and catch a concurrent-race `P2002` **outside** any `$transaction`, since Postgres poisons the transaction — ABA-313).
- Validation before any write: `Σ participant.amount ≤ expense.amount` (0.01 tolerance), between 1 and 20 participants, each `name` non-empty after trimming and `@MaxLength(60)`, each `amount > 0`, and every id in `itemIds` belonging to *this* expense.
- `confirm` delegates to the existing `DebtsService.recordRepayment(accountId, userId, debtExpenseId, amount)`, so the repayment lands through exactly the same path as a manual one, then stamps `settledAt`.
- Creation writes the participants and their debt `Expense` rows in one `$transaction`.
- Route order: these come after `PATCH /expenses/bulk` and `POST /expenses/merge`. Because each new path has a static segment following `:id`, no shadowing occurs — but the declaration-order rule (ABA-166) still applies to anything added later.

### Public (no guard, listed in `setGlobalPrefix({ exclude })` in `main.ts:32`)

```
GET  /s/:token          guest page (HTML)
POST /s/:token/paid     "I paid"
```

Only these two. A JSON variant of the guest payload is deliberately **not** shipped in v1 — nothing consumes it, and an unused public read endpoint is attack surface for free. It belongs to the follow-up that moves the page to the apex.

## Security model

- **Token**: `randomBytes(16).toString('hex')` — 128 bits. Do **not** copy the 8-character hex invitation-code pattern; 32 bits is brute-forceable for a public, payment-adjacent page.
- **Response contains only**: merchant, date, payer's display name, the guest's *own* items, their amount and currency, and the payment link/handle. Never `accountId`, other participants' amounts, other line items, the receipt image, or any email.
- **No enumeration**: an unknown token and an expired token produce the *same* response.
- **`POST /s/:token/paid`** is idempotent (sets `claimedAt` only when null) and writes nothing else. Worst case for a leaked token is a false "I paid" claim, which the author must still confirm.
- **Throttling**: `@Throttle` on both public routes.
- **Lifetime**: 30 days, then the expired page.
- All interpolation through `escapeHtml` (the `oauth-pages.ts` helper).

### Payment handle needs to move to the user

Today `paymentMethod` / `paymentHandle` live on `AccountMember`, i.e. scoped to a trip account. A split happens in personal accounts too, where no such row carries a handle. Add `User.paymentMethod` / `User.paymentHandle` with the same `SettleMethod` enum and the same allow-list validation (`/^[A-Za-z0-9+ ._-]{1,50}$/` — `+` and space are there for BLIK phone numbers). Resolution order for a split: user-level handle, then the account-member handle as a fallback.

## Mobile flow

Entry point: `app/expense/[id].tsx` gains a "Split" action next to the existing move-to-account action, under the same `canEdit` gate.

New screen `app/expense/split.tsx` — **register its header in `app/_layout.tsx`**:

- line items with participant chips; tapping an item assigns it to the selected participants; "+ person" adds a name;
- when the expense has no items (entered manually), fall back to equal-split-among-N;
- the author's own share is shown as the live remainder;
- `validateSplit()` blocks submit when the shares exceed the bill, mirroring `validateTripSplit()`.

After saving, the same screen becomes the status view — `sent → opened → claimed → settled` per participant, with a "Confirm" button on claimed rows. Sharing is per participant via `Share.share`, plus a "copy all links" affordance.

Store: `receiptSplitStore.ts` — server-only, in the same spirit as `purchaseRequestStore` / `tripStore`, because token state must be consistent across devices and members.

## Guest page and notifications

The HTML follows `oauth-pages.ts` structurally but is branded: merchant and date, "Anna paid for everyone", the guest's items, their amount in large type, a pay button (BLIK instructions / `revolut.me` / `paypal.me`), an "I paid" button, and a store-links CTA at the bottom. That CTA is the growth loop the feature exists for.

Localization: 9 languages in `modules/receipt-split/helpers/guest-page-i18n.ts`, a structural copy of `notification-i18n.ts`. Language resolution: `?lang=` from the shared link (the author shares in their own language) → `Accept-Language` → English.

Notification: a new type `split_payment_claimed`, pushed to the author when a guest taps "I paid", **with no preference toggle** — same reasoning as `account_invitation`: a one-off action request, not a recurring background alert. Deep-links to the split screen.

## Edge cases

| Case | Behavior |
|---|---|
| E2EE (tier-2) account | Reject with `BadRequestException`. Items and merchant are encrypted at rest, so the server cannot populate the guest page. Precedent: `moveToAccount` rejects encrypted expenses. |
| Archived trip account | Blocked by `TripArchivedGuard`. |
| Viewer role | Blocked by `ViewerBlockGuard` server-side and hidden by `canEdit` client-side. |
| Author deletes the receipt expense | `ExpensesService.remove` must **explicitly** soft-delete the split's debt rows and expire its participants (set `expiresAt` to now, so live links stop resolving). The Prisma `onDelete: Cascade` is only a safety net for a genuine hard delete — the app soft-deletes expenses (`isDeleted`), which does not fire a database cascade. Getting this wrong leaves guest links alive for a receipt that no longer exists. |
| Guest opens an expired link | Generic "link not found or expired" page, identical to the unknown-token response. |
| Guest claims twice | Second call is a no-op (idempotent `claimedAt`). |
| Author confirms twice | Second call is rejected once `settledAt` is set, so no duplicate repayment income. |

## Testing

- `resolveItemSplit` — rounding remainder, an item shared by two people, unassigned items falling to the author, zero participants.
- **`filterConsumption` — the key regression test:** a 200 bill plus three 50 debt rows must total exactly 200 of spend, while a standalone "lent 500 in cash" debt must still count as spend.
- Service: idempotent creation, `Σ shares ≤ bill`, idempotent claim, double-confirm rejection, cascade delete, E2EE rejection, viewer rejection.
- Public controller: reachable without a token, unknown and expired tokens produce identical responses, throttle applied, no foreign data in the JSON response.
- Token entropy (length and charset).
- i18n completeness across all 9 locales plus the guest-page string table.

## Deploy notes

- Prisma migration for the new table and the new `Expense` column. Author it DB-free via `prisma migrate diff` — this repo runs migrations against prod from the deploy `migrator`, there is no local DB.
- Mobile SQLite `ALTER TABLE` in `client.native.ts`.
- **Manual ops step:** one `location /s/ { proxy_pass … }` block in `shared-nginx` on the VPS, so the public URL is `ai-budget.pl/s/<token>` rather than `api.ai-budget.pl`. The shared-nginx config lives on the server, not in this repo, so this does not deploy itself with the code.
- No CORS change: the guest page is server-rendered same-origin. `GET /s/:token/data` would need one only if a future static apex page fetches it from the browser.

## Follow-ups

- Guest-side dispute of an assignment (v2) — requires recalculating already-created debt rows.
- Multi-currency splits.
- Converting the guest page into a static apex page, which is when a JSON payload endpoint becomes worth adding.
- Filtering split-receivable rows out of the Expenses tab list, if the extra rows prove noisy.
- Funnel instrumentation on `openedAt` → `claimedAt` → install, to measure whether the loop actually acquires users.
