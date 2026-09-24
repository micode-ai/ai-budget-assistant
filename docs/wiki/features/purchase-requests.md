# Purchase requests — group approval for shared accounts

*Hub: [api](../api.md)*

## What this is

Any member of a shared account — viewers included — can propose a purchase. The other members vote
in the app or through the Telegram/WhatsApp bots; an approved request can be turned into a
**planned** expense and later marked as purchased.

## Entry points

- `apps/api/src/modules/purchase-requests/` — controller, service (`computeDecision`,
  `computeDecisionOwnerOnly`, `vote`)
- Bots: `modules/telegram/handlers/purchase-request.handler.ts` (callbacks `pr_approve:{id}` /
  `pr_reject:{id}`), `modules/whatsapp/handlers/purchase-request.handler.ts` (`pr_approve--{id}` —
  WhatsApp ids use `--` because UUIDs contain `-`)
- Mobile: `apps/mobile/src/stores/purchaseRequestStore.ts`; `app/purchase-requests/index.tsx`
  (Active / Approved / History), `new.tsx` (also edit, via `?editId=`), `[id].tsx`; entry from the
  Settings hub with a pending-count badge, and the `shopping_hub` quick action
- Schema: `purchase_requests`, `purchase_request_votes`, `Account.purchaseApprovalRule`,
  `Expense.isPlanned`

## Key concepts

**Three approval rules** (`ApprovalRule`, default `MAJORITY`): `MAJORITY` — approve or reject once
either count exceeds half the effective members; `UNANIMOUS` — one reject kills it, every effective
member must approve; `OWNER_ONLY` — only the owner's vote counts. "Effective members" is the member
count **minus explicit `ABSTAIN` votes**.

**Votes are an upsert on `[requestId, userId]`**, so a member can change their vote.

**Lifecycle**: `PENDING` → `APPROVED` / `REJECTED` → (convert: creates a planned `Expense`, sets
`plannedExpenseId`) → `PURCHASED`. The creator or the owner may edit or delete a `PENDING` request;
delete sets `REJECTED` rather than removing the row.

**Four pushes** — created (all members but the creator), voted (creator), approved (all), rejected
(creator) — gated by `user.notifyPurchaseRequests`.

## Invariants

**The approval rule is copied onto the request at creation** (`PurchaseRequest.approvalRule`).
Changing the account's rule later does not re-judge requests already pending.

**Voting is open to viewers**, so `POST /:id/vote` is deliberately NOT behind `ViewerBlockGuard`;
create, convert, mark-purchased, edit and the approval-rule setting are. Delete is checked in the
service (creator or owner).

**Route order matters**: `PATCH settings/approval-rule` and `GET pending-count` are declared before
the `:id` routes, or Express would capture them as ids.

**A planned expense never counts as spend.** `loadAllExpenses` in `expenseRepository.ts` filters
`is_planned IS NULL OR is_planned = 0`. Marking purchased from the expense screen updates
`isPlanned: false` optimistically **first**, then calls `markAsPurchased`, and rolls back on failure.

**The store is server-only, not offline-first** — a vote needs cross-member consistency.

**A rejected request's feed events are deleted** (fire-and-forget) so its card leaves the
[family feed](family-feed.md) immediately.

## Known gaps

- Members who never vote still count in the denominator, so under `MAJORITY` or `UNANIMOUS`
  silence can leave a request pending forever — and there is no expiry cron.
- No comments thread; bot messages carry no image.

## History

ABA-298 (the feature) · ABA-302 (edit and delete a pending request) · ABA-299 (feed events) ·
ABA-303 (feed cleanup on rejection) · ABA-332 (entry merged into the `shopping_hub` quick action).
