# Receipt split — item-level shares

*Parent: [receipt-split](receipt-split.md)*

## What this is

Splitting a bill by its actual line items rather than equally: who claimed which line, lines
claimed by several people, explicit per-line percentages, and the guest's view of what each line
cost *them*. Also the guest's ability to flag a line as wrong and the payer's ability to fix one
line without cancelling the split.

## Entry points

- `apps/api/src/modules/receipt-split/split-calculator.ts` — `resolveItemSplit`,
  `reassignSplitItem`, `allocateItemShares`
- `apps/mobile/src/components/split/itemAssignments.ts` — `toggleItemAssignment`,
  `itemIdsForParticipant`, `assigneeLabel`
- `apps/mobile/src/components/split/itemShares.ts` — all per-line share arithmetic
- `apps/mobile/src/components/receipt-split/ItemReassignSheet.tsx`
- `apps/mobile/src/components/receipt-split/LineShareEditor.tsx`

Migrations: `20260913120000_add_receipt_split_flags`, `20260914140000_add_receipt_split_item_share_bp`.

## Key concepts

**A line can be claimed by several people.** The server always allowed it — `resolveItemSplit`
divides a line equally among claimants and `CreateSplitDto` puts no uniqueness constraint across
participants — so this was only ever a client limitation. Assignments are
`Record<itemId, participantId[]>`; tapping a person toggles them and deliberately KEEPS the line
selected, because claiming a shared bottle means tapping two or three people in a row.

**Explicit per-line shares.** `ItemAssignment.itemShareBp` carries a share in basis points
(6000 = 60%), stored as a nullable JSONB **beside** `item_ids`, never a reshaping of it. NULL and
any line missing from the map keep the original "divide equally" meaning, so there is no backfill
and no change for existing splits. The decision is **per line**, not per split: one receipt mixes
a hand-split wine with bread still divided equally.

**Shares need not add up to 100% — whatever is left belongs to the payer.** That single convention
is what let uneven splits exist without inventing a payer participant row (guest token, debt
expense, notifications, guest routes, status rows) and without touching the eight places in
`guest.controller.ts` that read `itemIds` as a flat string array. It mirrors how `ownShare` and an
entirely unclaimed line already work.

**The payer is a chip, not a number to type.** Tapping your own chip takes, or gives back, an
equal part of the selected line. The chip's state is **derived** (`payerClaimsLine` = the line is
hand-split AND the friends do not take all of it), never stored — "the payer has 40% of this line"
and "the shares add up to 60%" are the same statement, and a second flag could only ever disagree
with the numbers.

**The guest page shows each line as that guest's own share**, never the line's outright price.
`allocateItemShares` allocates the participant's **stored** amount across their claimed lines in
integer cents, handing leftovers out by largest fractional remainder. It allocates against the
stored number rather than recomputing it on purpose: recomputing means re-summing `price / claimants`
in floating point, so the lines could disagree with the total by a cent purely from addition order.

## Invariants

**Line items must reach `syncStatus: 'synced'` or item-level splitting is unreachable.**
`deriveSplitMode` offers the item mode only when every line is synced, because the server validates
`itemIds` against its own rows and rejects a client-generated id. A receipt scanned on the device
writes its lines as `pending` under client ids, and both paths that could adopt the server's rows
were gated on the local table being EMPTY — which after a scan it never is. Net effect: the split
screen silently fell back to an equal split on every receipt, on the device that scanned it. Three
things keep it fixed: `addExpense` adopts `created.items` from the create response, `loadExpenseItems`
refetches when **any** line is pending (not only when there are none), and the write goes through
`replaceItemsForExpense` — one transaction, hard delete + insert — because the server's rows carry
different ids and a merge would preserve the unusable one.

**`updateExpenseItem` / `addExpenseItem` must push to the server.** Both were local-only while only
delete called the API. Once a pending line triggers a refetch, an unpushed edit is no longer merely
invisible to the server but **visibly reverted** on the next load.

**A receipt-wide discount must never be charged at gross line prices.** Stored line prices are
gross and sum to more than what was paid, and since the payer's share is only ever the remainder,
the payer silently absorbed the whole discount — found on a real split at 36% over. Every item-mode
claim is scaled by `(lines − discount) / lines`, deliberately **not** `billTotal / lines`: a
returnable-packaging deposit is part of `billTotal` but is not a line item, and dividing by the paid
total would quietly charge participants a slice of it. Only a discount strictly between 0 and the
line sum scales anything, so malformed data cannot zero every share.

**Share validation lives in the service, not the DTO.** class-validator has no "record of bounded
integers" rule and the service is the authority — callers bypassing the HTTP pipe must not skip it.
A share must be claimed by that participant, be a whole number of bp in 0..10000, and one line may
not exceed 10000 across participants. Deliberately NOT validated: that a line *reaches* 10000.

**Stale shares must be pruned in storage, not only in the recompute.** Reassignment carries other
lines' shares through but must drop the reassigned line's own, in the stored map as well — otherwise
the entry survives and the next read re-applies it.

**An explicit zero is kept, never deleted.** "Nothing off this line" is a real answer; dropping the
entry would silently restore an equal slice.

**Reassignment locks the whole split once anyone has claimed or settled.** Coarse on purpose:
reassigning changes an amount someone may already have acted on, and locking only the touched
participants would require reasoning about a shared-line edit that transitively touches a locked
person.

**`GET /s/:token/receipt` sniffs the content type from the bytes**, never from the stored
`receiptMimeType`. `SaveReceiptImageDto.mimeType` is a bare `@IsString()`, so any signed-in user can
store any string there, and this route is unauthenticated — echoing it would let someone choose how
a browser executes their file on our origin. Unrecognized bytes are refused rather than served under
a guess, with `X-Content-Type-Options: nosniff` on top.

**A flagged `itemId` is clamped, never trusted.** Only a value present in `participant.itemIds` is
honored; anything else — including a real item id belonging to a different participant on the same
receipt — silently degrades to a whole-share report rather than erroring, preserving the same
never-confirm-or-deny posture as every other guest route.

## Known gaps

- No share editing after creation: ABA-546's reassignment flow resets a line to equal.
- Equal mode is untouched; existing splits keep dividing equally.
- Flags are never auto-resolved except by an in-place reassignment of that exact line.

## History

ABA-535 (shared items, real per-line amounts, receipt viewing) · ABA-540 (dispute flags) ·
ABA-542 (line items must reach synced) · ABA-546 (in-place reassignment) · ABA-549 (discount
scaling) · ABA-550 (explicit per-line shares) · ABA-551 (payer row read the stored map while the
rows above showed the equal division — 50+50+100=200%) · ABA-552 (payer as a chip).
