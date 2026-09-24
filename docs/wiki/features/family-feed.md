# Family Feed

*Hub: [api](../api.md)*

## What this is

An activity feed for shared accounts: who added which expense or income, and what happened to each
purchase request, with emoji reactions. Personal accounts have no feed.

## Entry points

- `apps/api/src/modules/family-feed/` — `recordEvent`, `getFeed`, `groupEvents`,
  `cleanupOldEvents` (cron `0 3 * * *`)
- Writers: `expenses/expense-created-hooks.service.ts` (`EXPENSE_ADDED`), `incomes/incomes.service.ts`
  (`INCOME_ADDED`), `purchase-requests/purchase-requests.service.ts` (created / approved /
  purchased / rejected)
- Endpoints: `GET /family-feed` (limit clamped to 1–100, NaN-safe), `POST` and
  `DELETE /family-feed/:eventId/react`
- Mobile: `src/stores/familyFeedStore.ts`, `src/components/feed/{FeedGroupCard,EmojiReactionBar}.tsx`,
  `app/family-feed/index.tsx`, `src/components/widgets/FamilyFeedWidget.tsx`
- Retention setting: `system_config` key `familyFeedRetentionDays`, edited in admin
  Settings → System Health via `GET/PATCH /admin/config`

## Key concepts

**Grouping.** Expense and income events group by `(userId, calendar day)` into one card; purchase
request events are always individual cards, and only the newest event per request is kept
(`seenPrIds` — events arrive newest first).

**Live request status.** `getFeed` batch-reads `purchase_requests.status` and passes a
`prStatusMap` to `groupEvents`, so the card shows the request's current state even when its only
feed event is `PURCHASE_REQUEST_CREATED`.

**Reactions** are an upsert on `[eventId, userId]` from a six-emoji allowlist (`ALLOWED_EMOJIS`).
Viewers can react — there is no `ViewerBlockGuard` on this controller.

**Retention** defaults to 5 days; the nightly cron deletes older events.

## Invariants

**`recordEvent` no-ops on a personal account**, and every writer calls it fire-and-forget through
`@Optional()` injection, logging with `logFireAndForget` — a feed failure must never fail the write
that caused it.

**`FeedGroup.eventIds` carries `event.entityId`** — the expense/income primary key, used for
deep-links — not the feed event's own id.

**The widget reloads on `currentAccountId` change**, or it would show the previous account's feed.
It is hidden when the current account is personal, and it is the **first** entry in `WIDGET_KEYS`
— inserted at its position, not appended, for existing users.

**Optimistic reactions roll back** to the previous state on failure, with a `console.warn`.

## Known gaps

Recorded as deferred at ABA-299: budget/goal/anomaly events in the feed, push notifications for
reactions, a comments thread, Slavic plural forms in the copy.

## History

ABA-299 (the feed) · ABA-303 (configurable retention; rejected requests removed from the feed).
