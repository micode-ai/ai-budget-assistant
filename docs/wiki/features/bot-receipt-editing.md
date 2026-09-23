# Bot receipt editing

*Hubs: [telegram-bot](../telegram-bot.md) · [whatsapp-bot](../whatsapp-bot.md) ·
[slack-bot](../slack-bot.md) · related: [receipt-category-split](receipt-category-split.md)*

## What this is

Correcting a scanned receipt's line items and total from a chat bot before it is saved — the gap
ABA-481 left when it gave line editing to the app only.

## Entry points

- `apps/api/src/common/utils/receipt-item-edit.ts` — `parseItemEditCommand`,
  `applyItemEditCommand`, `seedItemGroups`, `recomputeSplits`
- `apps/api/src/common/bot-i18n/shared-messages.ts` — `buildItemListBlock`
- `modules/{telegram,whatsapp,slack}/handlers/photo.handler.ts` — `handleItemEditInput`
- `modules/{telegram,whatsapp,slack}/*-bot.service.ts` — the text router that calls it

## Key concepts

**Corrections are typed, never tapped.** WhatsApp allows at most 3 buttons or 10 list rows per
message (`whatsapp-client.service.ts` throws above that) and a real receipt has 20–40 lines, so a
per-line picker is impossible. The flow mirrors the date-edit flow every bot already had: a button
arms a typed-input mode, a Redis key `{platform}:awaiting_item_edit:{userKey}` (TTL 600) remembers
the receipt, and `handleItemEditInput(text, userState)` consumes following messages, returning
`false` when this user is not editing so the message still reaches the AI chat.

**Grammar, identical on all three platforms, one correction per message:** `3 = 14,69` price,
`3: Хлеб` rename, `3 -` delete, `+ Хлеб 5,99` add, `= 233,98` receipt total. Comma and dot decimals
both work.

**The rendered list** is a numbered block plus a `Lines: … · receipt total: …` footer — that gap is
the only signal a misread is still there.

## Invariants

**The two typed-input modes are mutually exclusive.** Entering one clears the other, and confirm or
cancel clears both, or the next chat message is swallowed by the correction parser.

**Parsing is syntax only; every money rule lives in `applyItemEditCommand`.** That is why `3 = 0`
parses and is then rejected. A price correction recomputes `unitPrice` from the quantity (a stale one
feeds the Personal Inflation Index); a rename drops the line's `canonicalName`, which described the
old text.

**The split is rebuilt from the corrected lines with the tolerance gate relaxed to 100%.** The user
corrected them by hand and is the authority, mirroring the app's `buildManualSplits` no-gate path.
Because a split always sums to the receipt total, correcting only a line pushes the difference into
the residual — which is why editing the total had to be in scope.

**A proposed category survives, and its sentinel never escapes.** Groups are keyed by `categoryId`
when there is one and by name when there is not; the internal `proposed:` sentinel is mapped back to
`null` before the result leaves the function. Letting it out as an id is the ABA-451 failure mode.

**Seed the grouping once, on entering edit mode.** `seedItemGroups` lands the split's `itemIndexes`
onto the items so a later deletion cannot shift them (the app needed `reindexAfterRemoval` for
exactly that). It writes a Redis-only `items[].categoryName` the confirm path ignores.

**`buildItemListBlock` emits no markup tags**, since OCR descriptions contain `&` and `<`; the
Telegram call site escapes the whole block.

**One platform divergence.** Telegram and Slack get a flat `✏️ Items` button; WhatsApp's scan reply
already used all three buttons, so `changeDate` became `✏️ Edit`, opening a two-row list (Items /
Date). The one-tap "Add expense" path is unchanged everywhere.

## Known gaps

- Not editable from a bot: quantity, the receipt's discount/deposit, and a line's category (the
  app's `ItemCategorySheet` owns that). The price check is not re-run on a corrected price.
- A receipt beyond ~60 lines exceeds Telegram's 4 096-character limit; the render is not chunked.

## History

ABA-482.
