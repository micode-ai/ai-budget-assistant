# Family Feed — Design Spec

**Date:** 2026-06-30
**Status:** Approved

## Overview

An Instagram-style activity feed for shared accounts. Family and couple members see each other's financial activity in a scrollable card feed on the home screen. Expenses from the same user on the same day are grouped into one card. Emoji reactions let members respond without leaving the app.

## Goals

- **Transparency**: shared visibility into who is spending what, without requiring manual communication
- **Engagement**: emoji reactions make shared finance feel alive and collaborative
- **Purchase requests integration**: PR events appear in the feed as first-class cards (replaces the interim Settings-hub entry point in Phase 2)

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Architecture | Event log table | Clean eventId for reactions; fast reads; easy to extend |
| Content | Expenses + incomes + purchase requests only | YAGNI — budget/goal/anomaly events deferred |
| Reactions | Emoji only (6 options) | Simple; no comments thread complexity |
| Grouping | By userId + calendar day | Predictable, prevents feed noise from heavy users |
| Navigation | Home widget → full screen | No new tab; doesn't break existing nav |
| Offline-first | No | Feed needs cross-member consistency; server-only |
| Backfill | None | Feed starts from deploy date |
| Personal accounts | Excluded | Feed only meaningful with ≥2 members |

## Data Model

### Migration: `20260630100000_add_family_feed`

```prisma
enum FeedEventType {
  EXPENSE_ADDED
  INCOME_ADDED
  PURCHASE_REQUEST_CREATED
  PURCHASE_REQUEST_APPROVED
  PURCHASE_REQUEST_PURCHASED
}

model FamilyFeedEvent {
  id        String        @id @default(cuid())
  accountId String
  userId    String
  type      FeedEventType
  entityId  String        // PK of the source row
  metadata  Json          // { amount: number, currency: string } always
                          // + { title: string } for purchase_request_* types
                          // merchant/description intentionally omitted (may be encrypted)
  createdAt DateTime      @default(now()) @map("created_at")

  account   Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  reactions FeedReaction[]

  @@index([accountId, createdAt(sort: Desc)])
  @@map("family_feed_events")
}

model FeedReaction {
  id        String          @id @default(cuid())
  eventId   String          @map("event_id")
  userId    String          @map("user_id")
  emoji     String          // one of: 👍 ❤️ 😮 😂 🔥 😬
  createdAt DateTime        @default(now()) @map("created_at")

  event FamilyFeedEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@map("feed_reactions")
}
```

### Modifications to existing models

```prisma
model Account {
  // ...existing fields...
  feedEvents FamilyFeedEvent[]
}

model User {
  // ...existing fields...
  feedEvents  FamilyFeedEvent[]
  feedReactions FeedReaction[]
}
```

### Event recording (fire-and-forget)

Events are written from existing services after a successful write. All calls check `account.type !== 'personal'` first.

| Source | Event type | When |
|---|---|---|
| `ExpensesService.create()` | `EXPENSE_ADDED` | After expense is created |
| `IncomesService.create()` | `INCOME_ADDED` | After income is created |
| `PurchaseRequestsService.create()` | `PURCHASE_REQUEST_CREATED` | After PR is persisted |
| `PurchaseRequestsService.evaluateApproval()` | `PURCHASE_REQUEST_APPROVED` | When status transitions to `APPROVED` |
| `PurchaseRequestsService.markAsPurchased()` | `PURCHASE_REQUEST_PURCHASED` | When status transitions to `PURCHASED` |

Mobile sync (`POST /sync/push`) creates expenses via `ExpensesService.create()`, so events are captured automatically.

## API

Module: `apps/api/src/modules/family-feed/`

All endpoints: `JwtAuthGuard + AccountContextGuard` (class-level).

### Endpoints

| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/family-feed` | — | Grouped feed for the account |
| `POST` | `/family-feed/:eventId/react` | — (viewers can react) | Upsert reaction |
| `DELETE` | `/family-feed/:eventId/react` | — | Remove own reaction |

### `GET /family-feed`

Query params: `cursor?: string` (eventId for pagination), `limit?: number` (default 100, max 100).

Fetches the last N `FamilyFeedEvent` rows for the account ordered by `createdAt DESC`, including `reactions` and `user { name }`. Groups in memory:

- `EXPENSE_ADDED` and `INCOME_ADDED` group by `(userId, calendarDay)` → one `FeedGroup`
- `PURCHASE_REQUEST_*` are always individual `FeedGroup` cards

Returns `FeedGroup[]`.

### Response types

```typescript
interface FeedGroup {
  id: string                    // id of first event in group (stable grouping key)
  type: 'expenses' | 'incomes'
      | 'purchase_request_created'
      | 'purchase_request_approved'
      | 'purchase_request_purchased'
  userId: string
  userName: string
  date: string                  // 'YYYY-MM-DD' in UTC (server has no user timezone)
  // expense/income groups only:
  count?: number
  totalAmount?: number
  currency?: string
  eventIds?: string[]           // individual event ids for deep-linking
  // purchase_request cards only:
  purchaseRequest?: {
    id: string
    title: string
    amount: number
    currency: string
    status: string
  }
  // reactions (all types):
  reactions: { emoji: string; count: number; userIds: string[] }[]
  myReaction: string | null     // current user's emoji, null if none
}
```

### `POST /family-feed/:eventId/react`

Body: `{ emoji: string }`. Validates emoji is one of the 6 allowed values. Upserts `FeedReaction` on `[eventId, userId]` — changing emoji replaces the previous one. No push notification sent.

### `DELETE /family-feed/:eventId/react`

Deletes the caller's `FeedReaction` for the event. No-op if none exists.

## Shared Types

### `packages/shared-types/src/entities/index.ts`

```typescript
interface FamilyFeedEvent {
  id: string
  accountId: string
  userId: string
  type: FeedEventType
  entityId: string
  metadata: { amount: number; currency: string; title?: string }
  createdAt: string
  reactions: FeedReaction[]
}

interface FeedReaction {
  id: string
  eventId: string
  userId: string
  emoji: string
  createdAt: string
}

interface FeedGroup {
  id: string
  type: 'expenses' | 'incomes' | 'purchase_request_created'
      | 'purchase_request_approved' | 'purchase_request_purchased'
  userId: string
  userName: string
  date: string
  count?: number
  totalAmount?: number
  currency?: string
  eventIds?: string[]
  purchaseRequest?: { id: string; title: string; amount: number; currency: string; status: string }
  reactions: { emoji: string; count: number; userIds: string[] }[]
  myReaction: string | null
}

type FeedEventType = 'EXPENSE_ADDED' | 'INCOME_ADDED'
  | 'PURCHASE_REQUEST_CREATED' | 'PURCHASE_REQUEST_APPROVED'
  | 'PURCHASE_REQUEST_PURCHASED'
```

### `packages/shared-types/src/dto/index.ts`

```typescript
interface ReactToFeedEventDto { emoji: string }
```

## Mobile

### New files

| File | Description |
|---|---|
| `apps/mobile/src/stores/familyFeedStore.ts` | Zustand store (server-only, in-memory) |
| `apps/mobile/src/services/family-feed.api.ts` | API client |
| `apps/mobile/app/family-feed/index.tsx` | Full feed screen |
| `apps/mobile/src/components/feed/FeedGroupCard.tsx` | Card component (all types) |
| `apps/mobile/src/components/feed/EmojiReactionBar.tsx` | Reaction row + picker |
| `apps/mobile/src/components/widgets/FamilyFeedWidget.tsx` | Home widget (last 3 groups) |

### Store (`familyFeedStore.ts`)

```typescript
interface FamilyFeedStore {
  groups: FeedGroup[]
  isLoading: boolean
  cursor: string | null   // for pagination

  loadFeed: () => Promise<void>
  loadMore: () => Promise<void>
  react: (eventId: string, emoji: string) => Promise<void>   // optimistic
  removeReaction: (eventId: string) => Promise<void>         // optimistic
}
```

Not offline-first. All actions await server response, then update in-memory state. Optimistic update applied immediately; rolled back on error.

### Navigation

`app/family-feed/index.tsx` registered in `app/_layout.tsx` with title "Family Feed" and back arrow.

### Home widget

`FamilyFeedWidget` added to `WIDGET_KEYS` as `'familyFeed'`. Rendered in `(tabs)/index.tsx` widget order. Visible only when `currentAccount().type !== 'personal'`. Shows last 3 `FeedGroup` cards + "Show all" button. Hidden entirely for personal accounts.

### Card layouts

**Expense/Income day-group:**
```
[Avatar] Name · Today
         3 expenses · 210 zł         [▾ expand]
         [👍 2] [❤️ 1]  [+ react]
```
Expanded: list of individual rows (merchant or description + amount). Each row taps to `expense/[id]` or `income/[id]`.

**Single expense or income (only one that day):**
```
[Avatar] Name · Yesterday
         Biedronka · 87 zł
         [😮 1]  [+ react]
```

**Purchase request card:**
```
[🛒] Name proposed a purchase           APPROVED
     Nike Air Max 270 · 450 zł
     [👍 3] [🔥 1]  [+ react]
```
Taps to `/purchase-requests/[id]`.

### Reactions UX

Tap `[+ react]` → bottom sheet with 6 emoji buttons in a row. Tap emoji → `react(eventId, emoji)`, optimistic update. Tap own emoji in the bar → `removeReaction(eventId)`. Changing emoji: tap different emoji → replaces via upsert.

### i18n

~15 new keys in `familyFeed.*` namespace across all 9 locales:

```
title, showAll, today, yesterday, expenses (N expenses · X zł),
incomes (N incomes · X zł), proposedPurchase, noActivity,
noActivityDesc, reactAdded, reactRemoved, expand, collapse,
purchaseApproved, purchaseMade
```

## Notifications

No new notification type. Existing `shared_expense` push already fires on expense creation. PR events already have their own 4 push types. Reactions generate no push (too noisy).

## Testing

### `family-feed.service.spec.ts`

- `groupEvents()`: 2 expenses same user same day → 1 group; same user different days → 2 groups; PR event → always individual card
- `react()`: upsert creates reaction; calling again with different emoji replaces; `removeReaction()` deletes
- Scoping: events from other accounts not returned

### `family-feed.controller.spec.ts`

- `GET /family-feed` returns 200 with groups array
- `POST /family-feed/:eventId/react` validates emoji allowlist; rejects unknown emoji
- `DELETE /family-feed/:eventId/react` returns 204

## Edge Cases

| Case | Handling |
|---|---|
| Personal account | `recordEvent()` no-ops; widget hidden; GET returns `[]` |
| Single member | Feed shows; cards show own activity only |
| Deleted expense | Event card remains; tapping shows "Expense deleted" |
| Encrypted account | `metadata` stores only `{ amount, currency }` — no merchant/description |
| Mobile sync push | `ExpensesService.create()` is called server-side → event recorded automatically |
| No reactions yet | `reactions: []`, `myReaction: null` |

## Out of Scope

- Comments thread on feed events
- Push notifications for reactions
- Budget/goal/anomaly events in the feed (Phase 2)
- Feed for personal accounts
- Infinite scroll beyond 100 events per load (cursor-based pagination included but not required for v1 — 100 is sufficient for most families)
