# Child costs

*Hub: [analytics-insights](../analytics-insights.md) · [api](../api.md) · related: [tags](tags.md),
[receipt-category-split](receipt-category-split.md), [display-currency-conversion](display-currency-conversion.md),
[offline-first-sync](offline-first-sync.md), [account-backups](account-backups.md),
[move-expense-between-accounts](move-expense-between-accounts.md)*

## What this is

Lets a parent see what a child costs: attribute a whole expense (several children split it equally
unless a share is edited) or individual receipt lines to a child, and read per-child totals in the
display currency. It also covers the 800+ child-benefit coverage figure, a shareable card and a
Pro-only PDF statement ("zestawienie") for a co-parent or a lawyer. Everything is deterministic —
**no model call anywhere**. Issue: [ABA-747](https://github.com/micode-ai/ai-budget-assistant/issues/785) (spec `docs/superpowers/specs/2026-11-11-child-costs-design.md`).

## Entry points

- Schema + migration `20261113000000_children` — `Child`, `ExpenseChild`, `ExpenseItem.childId`,
  `ProductChildRule`
- `apps/api/src/modules/children/` — `children.service.ts`, `children.controller.ts` (also hosts the
  line route `PATCH /expenses/:expenseId/items/:itemId/child`), `child-product-rules.service.ts`,
  `child-resolver.util.ts`, `child-statement.service.ts`, `child-statement.pdf.ts`
- `apps/api/src/common/utils/child-attribution.ts` — canonical attribution maths (`childCostSummary`,
  `benefitCoverage`); mirrored in `packages/shared-utils` and tested from
  `apps/mobile/src/features/children/__tests__/`
- `apps/api/src/modules/sync/handlers/child.handler.ts`, `expense-child.handler.ts`
- Mobile: `src/stores/childStore.ts`, `childSync.ts`, `src/db/childRepository.ts`,
  `src/features/children/` (`childCosts.ts`, `statementGate.ts`, `useChildAttribution.ts`,
  `useChildStatement.ts`, `bulkAssign.ts`), `src/components/children/` (phone + `desktop/`),
  `app/children/`, `app/settings/children.tsx`

## Key concepts

**Two attribution modes.** Whole-expense (`ExpenseChild` rows with a `share`; shares on one expense
sum to 1) and line (`ExpenseItem.childId`). A line's money is its amount with the receipt discount
folded in proportionally, the same folding as receipt category splits.

**One spend predicate, both sides.** `filterConsumption` on the device and `EXCLUDE_SPLIT_RECEIVABLE`
on the server drop `isSplitReceivable` (never `isDebt`); child totals additionally drop `isPlanned`
and soft-deleted rows (ruling R1: a planned expense is never spend).

**Suggestions.** Attributing a line writes a `ProductChildRule` keyed by `normalizeProductName`;
`POST /children/suggestions` offers it for matching lines of a later receipt. It is only ever a
suggestion the user accepts.

**800+ coverage.** The device recognises benefit income by description (`800+`, `800 plus`,
`rodzina 800`, `świadczenie wychowawcze`, case- and diacritics-insensitive), one payment per child
per month, and shows benefit received ÷ that child's spending in the same period.

**Device sync queue.** Child writes are the first consumer of the mobile `sync_queue` (the generic
`/sync` push is still unused for other entities). Line attribution replays through the REST `PATCH`
because the `expense_item` sync handler would wipe `canonicalName`. `/sync/pull` carries children and
expense links so a second device or reinstall sees them (ruling R7). The device also gained
`expense_items.server_known`, `line_discount` and `category_id` (ruling R9). The one-time backfill
of `server_known` on existing synced rows is gated by the `sync_metadata` key
`migration:expense_items_server_known_backfill` (`src/db/runOnce.ts`), so it does not rewrite the
table on every launch (ruling R14). A hand-added line whose push succeeds is re-keyed to its
server id and marked `server_known` at once (`adoptServerItemId`), not at the next launch.

**Undeliverable line changes (ruling R12).** A queued line change waits, uncounted, while its
EXPENSE is not on the server. Once the expense is there but the line is still not server-known (the
offline retry path sends no lines; a refetch replaces lines only when the server returns some), the
line may never become addressable. The drain then stamps the change as undeliverable
(`markLinesUndeliverable` — the first stamp is kept, no attempt is counted, because drains are
frequent and a later refetch may still adopt the line), lets the expense's other changes through
(they touch other rows), and drops it seven days after the first stamp (`UNDELIVERABLE_LINE_TTL_MS`)
with a `console.warn` carrying only a count. The Statement PDF gate does not wait for these rows:
`countStatementQueue` counts only changes in good standing and reports the undeliverable lines, and
the dialog says how many line attributions could not be sent and are not in the statement.

**Local `line_discount` comes only from server data (ruling R13).** The receipt create request does
not send OCR line discounts, so a line created on the device is written with `lineDiscount: null`
(`expenseStore.addExpense`) — storing the scanned value made line totals jump once the server's lines
were adopted, and differ from the web and the statement.

**Statement PDF.** `POST /children/:id/statement` builds a bounded, paged PDF: summary, per-month
and per-category tables, an expense list and a receipt appendix. Receipts are fetched 20 at a time
with caps of 150 receipts, 40 MB in all and 3 MB per image (env-tunable); stored images are already
≤800 px (ABA-463) so there is no resampling dependency (ruling R10). Every page carries the localised
footer and the "data as of" stamp.

## Invariants

- **No model call.** Attribution, suggestions and 800+ detection are rules. Nothing in this feature
  may add one.
- **`Child` stores only `name` (max 40), `color`, `archivedAt`, ids and timestamps** — no birth date,
  surname, photo or school. Children are archived, never hard-deleted from the UI; archived children
  keep attributions and can still produce statements.
- **`child.name` is tier-1 encrypted** (`ENCRYPTION_FIELDS.child`) and is **never logged, sent to
  telemetry, a model or the community layers.** On an encrypted account the server stores the
  placeholder `enc:<clientId>` and dedups by `clientId` (ruling R8); the device must never send the
  plaintext name on such an account (tagStore does — do not copy it).
- **Whole and line attribution are mutually exclusive per expense.** Switching asks for confirmation
  and the last action wins; bulk "Assign to child" skips expenses that have line attribution and
  reports the skipped count. A chip selection that goes stale while a card is mounted must not
  silently re-apply over line attribution.
- **Totals use the same spend predicate on device and server** (see above), and the PDF's
  by-category table splits a whole-attributed expense across its category splits exactly as the
  screen does.
- **Display currency.** Totals convert to `user.currencyCode`; an amount with an unknown rate is
  excluded and flagged `fxApproximate`, shown as "≈" — never summed unconverted.
- **Learned product→child rules are server-only and never applied silently.**
- **Receipt regeneration ("Extract items") carries `childId` by normalized product key** onto a new
  line whose key equals an old attributed line's; the rest are cleared and the user is told how many
  were lost.
- **The sync queue drain is pinned to the account** through an explicit `X-Account-Id` (a switch
  mid-drain must not send under the new account). Link and line changes for an expense not yet on the
  server wait without burning attempts — otherwise attempts run out and the next pull wipes the local
  links. A child adopted by name resolves to the server PK, not a second local id. The queue and the
  child tables are cleared on sign-out.
- **Any client id is resolved `OR:[{id},{clientId}]` and the resolved server PK is written.**
- **A cross-account move drops child attribution** (links and `childId`) — the children belong to the
  source account.
- **Backups export and restore children, links and line `childId`.**
- **Share card:** thin wrapper over `ShareImageCard`; the child's name is hidden by default (toggle),
  no merchant names.
- **Statement access:** `@RequireTier('pro')`, `ViewerBlockGuard` (editors only), and only
  `encryptionTier === 0` — otherwise 403 `{ code: 'ENCRYPTED_ACCOUNT' }`. Footer on every page
  ("Zestawienie sporządzone w aplikacji AI Budżet na podstawie danych wprowadzonych przez
  użytkownika"); no court headers, nothing "certified". It is a statement of what the user entered,
  not a legal document, and covers only what reached the server.
- **Pending gate (interim).** The app flushes its sync queue and refuses to request a statement
  while anything for the account is pending (`statementGate.ts`). Undeliverable line changes (see
  above) are reported in the dialog, never counted as pending — otherwise one unknown line would
  block the statement forever. Known window: see Known gaps.
- **Copy never says a child "costs too much" and never compares children.**
- **Repo rules that bite here:** schema change and migration in one commit; no runtime import from
  `@budget/shared-*` in `apps/api`; `logFireAndForget`; nine locales; phone + desktop together.

## Known gaps

- No tier-upgrade re-encryption exists for any entity, so a plaintext child name created before
  E2EE was enabled stays plaintext until edited.
- `syncPendingExpenses` marks rows synced after a failed push, and an offline expense delete is never
  retried (separate issue, ruling R11) — the statement's pending gate can therefore pass with an
  unsent expense, and the statement may omit a just-entered one on a flaky network.
- An offline 800+ unmark can be reverted by a retry.
- Web "Extract items" waits for new lines sequentially.
- The reports `PdfGenerator` never draws its page footer (pre-existing, separate issue); the
  statement has its own footer.
- The app does not send OCR line discounts on receipt create, so server `lineDiscount` is 0 for
  device-scanned receipts, and the device stores none either (ruling R13), so phone, web and
  statement agree (none of them shows a per-line discount for such a receipt).
- A line attribution whose line never reaches the server is dropped after seven days and is not in
  the statement (the dialog says how many).
- "Data as of" prints in UTC. The statement's receipt-id query is the first `= ANY(${array})` raw
  query in the codebase — smoke it on a real DB at deploy.
- Not built: a 50/50 co-parent ledger, bot and chat attribution, a What's New entry. Separated
  parents are advised to keep children on a personal account (user docs).

## History

[ABA-747](https://github.com/micode-ai/ai-budget-assistant/issues/785) (the feature). Follow-up: [ABA-748](https://github.com/micode-ai/ai-budget-assistant/issues/786) (logout clears queued child data on a failed sign-out).
