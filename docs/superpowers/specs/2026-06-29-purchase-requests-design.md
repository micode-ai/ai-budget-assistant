# Purchase Requests — Design Spec

**Date:** 2026-06-29
**Status:** Approved
**ABA task:** TBD

## Overview

A family collaboration feature that lets any account member propose a purchase for group approval before it enters the budget. The requester creates a request with title, amount, and optional photo; other members vote via the app or directly through Telegram/WhatsApp bots; approved requests become planned expenses that convert to real expenses with a single tap.

## Goals

- **Transparency (Pain A):** shared visibility into who wants to spend what and why
- **Automation (Pain C):** reduces back-and-forth messages, decisions happen inside the tool
- **Insights (Pain D):** planned expenses give a forward-looking view of upcoming spending

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Who can create | Any member (owner/editor/viewer) | Inclusive — kids / partner should be able to propose without elevated role |
| Approval rule | Configurable per account by owner | Families differ (unanimous couple vs. majority-of-5) |
| Post-approval state | Planned expense (isPlanned) | One-tap conversion; visible in budget forecasting |
| Architecture | Standalone module | No expense model pollution; clean isolation |
| Notifications | Push + Telegram/WhatsApp bots | Voting without opening the app |
| Storage | Server-only, no offline | Consistency required across members; no optimistic voting |
| UI location | Settings hub (interim) → Family Feed (future) | Family Feed doesn't exist yet |

## Data Model

### New tables

```prisma
model PurchaseRequest {
  id                String                @id @default(cuid())
  accountId         String
  createdByUserId   String
  title             String
  description       String?
  amount            Float
  currency          String
  categoryId        String?
  merchant          String?
  imageUrl          String?
  status            PurchaseRequestStatus @default(PENDING)
  approvalRule      ApprovalRule
  plannedExpenseId  String?               @unique
  expiresAt         DateTime?
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  account           Account               @relation(fields: [accountId], references: [id])
  createdBy         User                  @relation(fields: [createdByUserId], references: [id])
  votes             PurchaseRequestVote[]
  plannedExpense    Expense?              @relation(fields: [plannedExpenseId], references: [id])

  @@index([accountId, status])
  @@map("purchase_requests")
}

model PurchaseRequestVote {
  id          String         @id @default(cuid())
  requestId   String
  userId      String
  vote        VoteChoice
  comment     String?
  createdAt   DateTime       @default(now())

  request     PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  user        User            @relation(fields: [userId], references: [id])

  @@unique([requestId, userId])
  @@map("purchase_request_votes")
}

enum PurchaseRequestStatus {
  PENDING
  APPROVED
  REJECTED
  PURCHASED
  EXPIRED
}

enum ApprovalRule {
  MAJORITY
  UNANIMOUS
  OWNER_ONLY
}

enum VoteChoice {
  APPROVE
  REJECT
  ABSTAIN
}
```

### Modifications to existing tables

```prisma
// Account — stores the default approval rule for new requests
model Account {
  // ...existing fields...
  purchaseApprovalRule  ApprovalRule  @default(MAJORITY)
}

// Expense — planned flag for approved-but-not-yet-purchased items
model Expense {
  // ...existing fields...
  isPlanned  Boolean  @default(false)
  
  @@index([accountId, isPlanned])
}
```

### Migrations

1. `20260630000000_add_purchase_requests` — tables `purchase_requests` + `purchase_request_votes`
2. `20260630000001_add_account_approval_rule` — `Account.purchaseApprovalRule`
3. `20260630000002_add_expense_is_planned` — `Expense.isPlanned`

## Business Logic

### Approval evaluation

`PurchaseRequestsService.evaluateApproval(requestId)` is called after every vote:

```
MAJORITY:
  approveCount / totalMembers > 0.5  → APPROVED
  rejectCount  / totalMembers > 0.5  → REJECTED

UNANIMOUS:
  approveCount === totalMembers       → APPROVED
  rejectCount  >= 1                   → REJECTED

OWNER_ONLY:
  owner votes APPROVE                 → APPROVED
  owner votes REJECT                  → REJECTED
```

- `totalMembers` is the active member count fetched live from the account at the time of each `evaluateApproval()` call. Members added after a request was created are included in the denominator (acceptable for MVP — a late-joining member can tip a majority vote).
- `ABSTAIN` votes are excluded from the denominator in MAJORITY/UNANIMOUS so that non-participating members don't block decisions.
- Voting is an upsert on `[requestId, userId]` — changing one's vote is allowed while status is `PENDING`.

### Convert to planned expense

`POST /purchase-requests/:id/convert` (requires status `APPROVED`):

1. Calls `ExpensesService.create()` with `source: 'manual'`, `isPlanned: true`
2. Copies `amount`, `currency`, `categoryId`, `merchant` from the request
3. Sets `PurchaseRequest.plannedExpenseId = newExpenseId`
4. Status stays `APPROVED` until marked purchased

### Planned → Purchased

On `expense/[id].tsx`, when `isPlanned: true`, a banner **"Planned · Mark as purchased"** appears. Tapping it:
- Sets `Expense.isPlanned = false` via `PATCH /expenses/:id`
- Sets `PurchaseRequest.status = PURCHASED` via a fire-and-forget call

### Approval rule configuration

`Account.purchaseApprovalRule` is set by `PATCH /purchase-requests/settings/approval-rule` (owner only, lives in `PurchaseRequestsController`). New requests snapshot the account's current rule into `PurchaseRequest.approvalRule` at creation time so an in-flight vote isn't affected by a rule change.

### Expiry cron (Phase 2)

`@Cron('0 9 * * *')` in `purchase-request-expiry.cron.ts` — finds `PENDING` requests with `expiresAt <= now`, transitions to `EXPIRED`, sends push to creator. Deferred to Phase 2.

## API

All endpoints: `JwtAuthGuard + AccountContextGuard` (class-level). Module: `PurchaseRequestsModule`.

| Method | Path | Guard | Description |
|---|---|---|---|
| `POST` | `/purchase-requests` | — (any member) | Create request |
| `GET` | `/purchase-requests` | — | List (filter: `status`) |
| `GET` | `/purchase-requests/:id` | — | Detail + votes |
| `POST` | `/purchase-requests/:id/vote` | — (any member) | Cast/change vote |
| `POST` | `/purchase-requests/:id/convert` | ViewerBlockGuard | Convert to planned expense |
| `DELETE` | `/purchase-requests/:id` | creator or owner only | Cancel request |
| `PATCH` | `/purchase-requests/settings/approval-rule` | owner only | Set default rule for account |

> Note: `POST /purchase-requests/:id/vote` is intentionally not behind `ViewerBlockGuard` because viewer-role members must be able to vote — voting is a read-participation action, not a data write.

### DTOs

```typescript
// CreatePurchaseRequestDto
{
  title: string           // required
  amount: number          // required
  currency: string        // required
  description?: string
  categoryId?: string
  merchant?: string
  imageUrl?: string
  expiresAt?: string      // ISO date
}

// VotePurchaseRequestDto
{
  vote: 'APPROVE' | 'REJECT' | 'ABSTAIN'
  comment?: string
}
```

## Shared Types

### `packages/shared-types/src/entities/index.ts`

```typescript
interface PurchaseRequest {
  id: string
  accountId: string
  createdByUserId: string
  title: string
  description?: string
  amount: number
  currency: string
  categoryId?: string
  merchant?: string
  imageUrl?: string
  status: PurchaseRequestStatus
  approvalRule: ApprovalRule
  plannedExpenseId?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
  votes?: PurchaseRequestVote[]
  createdByUserName?: string  // flattened from join
}

interface PurchaseRequestVote {
  id: string
  requestId: string
  userId: string
  userName: string
  vote: VoteChoice
  comment?: string
  createdAt: string
}

type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PURCHASED' | 'EXPIRED'
type ApprovalRule = 'MAJORITY' | 'UNANIMOUS' | 'OWNER_ONLY'
type VoteChoice = 'APPROVE' | 'REJECT' | 'ABSTAIN'
```

## Mobile

### New screens

| Screen | Path | Description |
|---|---|---|
| List | `app/purchase-requests/index.tsx` | 3 tabs: Active / Approved / History |
| Create | `app/purchase-requests/new.tsx` | Form modal |
| Detail | `app/purchase-requests/[id].tsx` | Votes + actions |

**List screen:** Cards show image/category icon, title, amount, author, voting progress bar (X of Y), date. FAB for new request. Header registered in `app/_layout.tsx` with title + back.

**Create screen:** Fields: title (required), amount + currency (required), category picker, merchant, description, photo (`expo-image-picker`), deadline (optional). Standard modal Stack screen.

**Detail screen:**
- Header: photo, title, amount, status badge
- Voting section: member avatars with their vote icon, progress toward threshold
- Action buttons: "Approve" / "Reject" / "Abstain" (hidden after own vote; comment field alongside)
- If `APPROVED`: "Add to purchase plan" button → `/convert`
- If creator or owner: "Cancel request" button

**Planned expense banner:** On `expense/[id].tsx`, when `isPlanned: true` — banner "Planned · Mark as purchased" with a single tap handler.

### Navigation

Interim: entry point via a row in `app/settings/index.tsx` ("Purchase requests" + `cart-outline` icon, `purchaseRequests.settingsTitle` i18n key). Badge shows pending count when > 0.

Future: moves into Family Feed as an activity type.

### Zustand store (`purchaseRequestStore.ts`)

```typescript
interface PurchaseRequestStore {
  requests: PurchaseRequest[]
  isLoading: boolean
  pendingCount: number  // badge for settings hub entry point

  loadRequests: (status?: PurchaseRequestStatus) => Promise<void>
  createRequest: (dto: CreatePurchaseRequestDto) => Promise<void>
  vote: (id: string, vote: VoteChoice, comment?: string) => Promise<void>
  convertToPlanned: (id: string) => Promise<string>  // returns expenseId
  cancelRequest: (id: string) => Promise<void>
  loadPendingCount: () => Promise<void>
}
```

**Not offline-first.** Voting requires server consistency across members. All actions await the server response before updating in-memory state.

### API client (`purchase-requests.api.ts`)

```typescript
getPurchaseRequests(status?: PurchaseRequestStatus): Promise<PurchaseRequest[]>
getPurchaseRequest(id: string): Promise<PurchaseRequest>
createPurchaseRequest(dto: CreatePurchaseRequestDto): Promise<PurchaseRequest>
votePurchaseRequest(id: string, dto: VotePurchaseRequestDto): Promise<PurchaseRequest>
convertPurchaseRequest(id: string): Promise<{ expenseId: string }>
cancelPurchaseRequest(id: string): Promise<void>
updateAccountApprovalRule(rule: ApprovalRule): Promise<void>
```

Added to `src/services/api.ts` barrel.

## Notifications

### New push notification types

| Type | Recipients | Trigger |
|---|---|---|
| `purchase_request_created` | All members except creator | New request created |
| `purchase_request_voted` | Creator | Any member votes |
| `purchase_request_approved` | All members | Request reaches approval threshold |
| `purchase_request_rejected` | Creator | Request is rejected |

### User preference

`User.notifyPurchaseRequests Boolean @default(true)` — added to notification-preferences API and `app/settings/notifications.tsx` toggle.

### Telegram bot

New `PurchaseRequestHandler` in `modules/telegram/`. On `purchase_request_created`, sends to all linked members:

```
🛒 New purchase request from [Name]

Nike Air Max 270 — 450 zł
Category: Clothing
"Need them for running, old ones are worn out"

[✅ Approve]  [❌ Reject]
```

Callback: `pr_approve:{id}` / `pr_reject:{id}`. Handler calls `PurchaseRequestsService.vote()`, replies with confirmation and current vote tally.

### WhatsApp bot

Same flow via `sendButtons` (max 3): "Approve", "Reject", "View". Callback IDs use `--` separator: `pr_approve--{id}` / `pr_reject--{id}`.

## i18n

New `purchaseRequests.*` keys in all 9 locales (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`):

```
title, new, approve, reject, abstain, approved, rejected,
pending, purchased, expired, votes, addToPlan, convertSuccess,
noRequests, createFirst, voteComment, deadline, approvalRule,
settingsTitle, notif_created, notif_voted, notif_approved, notif_rejected,
majority, unanimous, ownerOnly, cancelRequest, markAsPurchased,
plannedBanner
```

## Testing

### Unit tests (`purchase-requests.service.spec.ts`)

- `evaluateApproval()` for all three rules:
  - MAJORITY: 3/5 approve → APPROVED; 1/5 reject then 2 more → REJECTED at 3/5
  - UNANIMOUS: 1 reject immediately → REJECTED; all approve → APPROVED
  - OWNER_ONLY: non-owner vote ignored; owner APPROVE → APPROVED
- Edge cases: single-member account (any vote = resolved); all ABSTAIN (no decision)
- Vote upsert: changing APPROVE → REJECT re-evaluates correctly
- `convert()` throws if status !== APPROVED

### Controller test (`purchase-requests.controller.spec.ts`)

- `POST /purchase-requests/:id/vote` route does not shadow any other route
- Creator can DELETE own request; non-creator non-owner cannot

## Out of scope (Phase 2)

- Expiry cron
- Comments thread on a request (beyond vote comment)
- Family Feed integration
- Request editing after creation
- Push image to WhatsApp/Telegram
