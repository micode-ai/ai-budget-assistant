# Receipt splitting / guest links

*Hub: [api](../api.md) · item-level detail: [receipt-split-item-shares](receipt-split-item-shares.md)*

## What this is

The payer of a shared bill splits it among friends who do not have the app. Each friend gets a
public, unauthenticated web link showing only their own share plus a payment deep-link; the payer
sees a per-person status list (`sent → opened → claimed → settled`).

## Entry points

- `apps/api/src/modules/receipt-split/` — the module
- `guest.controller.ts` (`@Controller('s')`) — `GET /s/:token`, `POST /s/:token/paid`,
  `POST /s/:token/flag`, `GET /s/:token/receipt`, and the QR group routes
- `receipt-split.controller.ts` — the payer-facing CRUD under `/expenses/:id/receipt-split*`
- `apps/api/src/global-prefix-exclusions.ts` — `GLOBAL_PREFIX_EXCLUDED_ROUTES`
- `apps/api/src/common/utils/expense-filters.ts` — `EXCLUDE_SPLIT_RECEIVABLE`
- `apps/mobile/app/expense/split.tsx` — the one screen (creation form becomes the status view)
- `apps/mobile/src/components/receipt-split/` — `AssignmentEditor`, `ParticipantStatusList`,
  `GroupQrModal`, `ItemReassignSheet`
- `apps/mobile/src/stores/receiptSplitStore.ts` — server-only, no SQLite mirror

Migrations: `20260726120000_add_receipt_split`, `20260726130000_add_receipt_split_cancelled_at`,
`20260727120000_add_receipt_split_participant_seq`, `20260727130000_add_user_payment_methods`.

## Key concepts

**Two controllers.** `GuestController` is the only unauthenticated surface in the app. Payer CRUD
is a separate `ReceiptSplitController` at `/expenses/:id/receipt-split*` — a distinct route segment
from the unrelated category-splits `/expenses/:id/splits` — carrying `JwtAuthGuard` +
`AccountContextGuard` at class level and `ViewerBlockGuard` + `TripArchivedGuard` per route,
including the `GET`: a viewer cannot see the split any more than create one.

**Accounting.** Creating a split writes one `isDebt: true, isSplitReceivable: true` expense per
participant (the receivable) alongside the original receipt expense. Splitting a 200 bill three
ways would otherwise double-count as 350 of spend.

**Payment info resolution** happens at request time, not write time, so setting it after links
were sent still fixes them. Three levels: the `user_payment_methods` list (any rows at all is the
whole answer), else the legacy `User.paymentMethod`/`paymentHandle` pair, else — only when either
legacy field is unset — the payer's `AccountMember` pair for that account. The guest page renders
one block per resolved method; `buildGuestPayLink` returns `{paymentLink, instructions}` and its
revolut/paypal branches mirror `trip-settle-up.service.ts`'s `createPayment`.

**A fully E2EE (tier-2) account is rejected with 400** — the server cannot read encrypted line
items to build the guest page.

## Invariants

**The global-prefix exclusion is one wildcard and must stay one.** `GLOBAL_PREFIX_EXCLUDED_ROUTES`
covers the whole `s` subtree rather than naming each guest route. It used to name them one by one,
which made it a parallel list somebody had to remember to update — and when the QR group routes
were added nobody did, so every scanned QR 404'd in production, invisibly, because the payer never
opens the guest link themselves. Two gotchas if you touch it: Nest matches these patterns against
the route's **definition** path (`/s/g/:groupToken`, params and all), not a request URL; and `*` is
a literal in path-to-regexp 3.x, so the wildcard must be written `(.*)`. `global-prefix-exclusions.spec.ts`
reflects over `GuestController`'s real routes and asserts each one is excluded.

**Filter on `isSplitReceivable`, never on `isDebt`.** For a standalone cash loan the debt row IS
the outflow, so filtering on `isDebt` would silently rewrite the numbers of every user who tracks
debts. `EXCLUDE_SPLIT_RECEIVABLE` is the single shared predicate spread into every user-facing
total (`analytics.service.ts`, `budget-alert.service.ts`, `safe-to-spend.service.ts`,
`wallet.service.ts`); mobile mirrors it with `filterConsumption()` (absent means false — the column
is nullable client-side), consumed by seven client surfaces.

**Unknown, expired and cancelled tokens must be indistinguishable.** They render byte-identical
responses — same status, body and length — so a probing guest cannot tell "never existed" from
"used to exist". Enforced by a deliberately two-query `findUsableParticipant`; the split matters
for timing, not tidiness.

**At most one live split per expense**, enforced by the partial unique index
`receipt_split_live_slot` on `(expense_id, seq) WHERE cancelled_at IS NULL`. A concurrent
double-create collides and the P2002 is caught **outside** the `$transaction`; a re-split after
`cancelSplit` freely reuses `seq 0` because the cancelled rows have dropped out of the index.

**The payer's confirm claims atomically.** `PATCH .../confirm` runs `DebtsService.recordRepayment` —
the same path a manual repayment takes — under an `updateMany` guard on `settledAt IS NULL`, so a
double-tap or retry cannot mint two repayment incomes.

**`getSplit` 404s when no split exists.** That is the normal state of every unsplit receipt, not a
failure; `receiptSplitStore.load` treats a 404 as "no split" and warns only on any other error.

**A guest CTA must not reuse `.btn-primary`.** That class is the marker `guest.controller.spec.ts`
uses to prove the pay affordance disappears once a share is claimed; a CTA borrowing it silently
defeated seven of those assertions. The CTA has its own `.btn-cta`, and a test pins the separation.

**The guest page is the one surface a non-user opens unprompted**, often paying through it, so its
footer is an acquisition card: `poweredBy` as the heading, a primary button to the web app
(`?src=split&loc=guest`, in `helpers/guest-page.ts`), Google Play as a secondary link. The button
says what the reader just experienced ("Split your own bill"), not "try the app". **There is no iOS
link and none may be re-added until a real App Store id exists** — the old one pointed at
`apps.apple.com/app/id000000000`, a placeholder that never resolved, handed to plausibly half of
every bill's recipients; a test asserts the placeholder is absent. The group-picker and confirm pages
have no footer.

## Known gaps

- `APP_PUBLIC_URL` is unset in production, so links fall back to `https://api.ai-budget.pl`. The
  pretty apex form needs a `location /s/` nginx block that does not exist yet — runbook
  `docs/ops/receipt-split-rollout.md`.
- No per-type notification preference for `split_payment_claimed` or `split_item_flagged` —
  deliberate, matching the `account_invitation` precedent that a one-off action request needs no
  opt-out beyond deleting the thing itself.

## History

- **ABA-422** — screen decomposition: `split.tsx` was 972 lines mixing both states; now a thin
  composition over `AssignmentEditor` and `ParticipantStatusList`, with `useAddParticipant` +
  `AddPersonRow` for the add-person sub-flow.
- **ABA-487** — the guest-page CTA card; the dead iOS store link deleted from the type and all nine
  locale blocks.
- **ABA-534** — the global-prefix exclusion collapsed to one wildcard after every QR 404'd.
- **ABA-540** — guest dispute flags.
- **QR group split** — `groupToken` on the `seq:0` anchor row, names-only picker page, confirm
  step, `GroupQrModal`. Not a new privacy boundary: "Copy all links" already bundled every
  name+token in one blob.
