# API Reference

Last updated: 2026-09-27

Base URL: `/api/v1`

A handful of routes are served **without** the `/api/v1` prefix because their URL is registered with a third party or handed to people outside the app. The authoritative list is `GLOBAL_PREFIX_EXCLUDED_ROUTES` in `apps/api/src/global-prefix-exclusions.ts`: the Stripe, Telegram, WhatsApp and Slack webhooks (`/webhooks/stripe`, `/telegram/webhook`, `/whatsapp/webhook`, `/slack/events`, `/slack/interactivity`), the Slack install flow (`/slack/install`, `/slack/oauth/callback`), and two guest-page subtrees covered by wildcards — `/s/...` (receipt-split guest links) and `/sl/...` (shopping-list guest links).

Guard vocabulary used below: **JWT** = `JwtAuthGuard`; **account context** = `AccountContextGuard` (needs `X-Account-Id`); **viewer-blocked** = `ViewerBlockGuard` (403 for the `viewer` role); **Pro** = `SubscriptionTierGuard` + `@RequireTier('pro')` (403 with `code: "TIER_REQUIRED"`); **AI-metered** = `AiUsageGuard` + `@TrackAiUsage(feature, cost)` (counts against the monthly AI quota).

All endpoints except authentication require a valid JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Account Context

Most endpoints (expenses, budgets, categories, wallet, analytics, insights, sync) require an account context. Pass the account ID in a header:
```
X-Account-Id: <account-uuid>
```

The `AccountContextGuard` middleware validates that the authenticated user is a member of the specified account and sets `accountId` and `accountRole` on the request.

**Account roles:**
| Role | Permissions |
|------|-------------|
| `owner` | Full access, manage members and invitations |
| `editor` | Create, read, update expenses/budgets/categories |
| `viewer` | Read-only access |

---

## Authentication

### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

Optional fields: `currencyCode`, `timezone`, `language`, `referralCode` (`^[A-Z0-9]{4,10}$`) and `acquisition` (`{ src?, loc?, lang?, plan?, referrerRaw? }` — first-touch attribution captured by the web/landing, see `docs/wiki/features/acquisition-tracking.md`). A default personal account is created with the user.

**Response** `201 Created`
```json
{
  "accessToken": "",
  "refreshToken": "",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "currencyCode": "USD",
    "defaultAccountId": "uuid",
    "isVerified": false,
    "themeMode": "system",
    "accentColor": null,
    "paymentMethod": null,
    "paymentHandle": null
  },
  "accounts": []
}
```

A new user is unverified: both tokens are empty strings and `accounts` is empty until the 6-digit code e-mailed at registration is confirmed via **Verify Email** below, which returns the real tokens.

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "currencyCode": "USD",
    "defaultAccountId": "uuid",
    "isVerified": true,
    "themeMode": "system",
    "accentColor": null,
    "paymentMethod": null,
    "paymentHandle": null
  },
  "accounts": [ { "id": "uuid", "name": "Personal", "type": "personal", "myRole": "owner" } ]
}
```

An unverified user gets `200` with empty tokens and `isVerified: false` (the app routes them to verification). A deactivated account, a wrong password, and a Google-only account (no password — "Use Google sign-in for this account") are `401`. The access token lives for `JWT_EXPIRES_IN` (default `7d`); the refresh token for 30 days.

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Sliding session**: every refresh returns a **fresh** refresh token alongside the new access token, and the clients persist it, so a user active at least once per refresh-token lifetime (30 days) is never forced to log in again. Tokens are stateless JWTs with no revocation list — the previous refresh token stays valid until its own expiry. Also stamps the user's last-active time. `401` for an invalid token or an inactive user.

### Forgot Password

Request a password reset code. Always returns 200 regardless of whether the email exists (prevents email enumeration).

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response** `200 OK`
```json
{
  "message": "If this email is registered, a reset code has been sent"
}
```

**Rate limit:** 3 requests per email per 15 minutes. Returns `429 Too Many Requests` if exceeded.

### Reset Password

Verify the 6-digit code and set a new password.

```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass1"
}
```

**Response** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

**Errors:**
- `400 Bad Request` — Invalid or expired code
- `429 Too Many Requests` — Max 5 verification attempts per email per 15 minutes

**Password requirements:** Minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number.

### Verify Email

```http
POST /auth/verify-email
Content-Type: application/json

{ "email": "user@example.com", "code": "123456" }
```

Confirms the 6-digit code sent at registration and returns a full session so the user proceeds without logging in again.

**Response** `200 OK` — `{ "message": "Email verified successfully", "accessToken": "...", "refreshToken": "...", "user": { ... }, "accounts": [ ... ] }` (same `user` block as Login). `400` for an invalid or expired code.

### Resend Verification Code

```http
POST /auth/resend-verification
Content-Type: application/json

{ "email": "user@example.com" }
```

**Response** `200 OK` — always `{ "message": "If this email is unverified, a new code has been sent" }` (no e-mail enumeration).

### Google Sign-In

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "<Google ID token>",
  "language": "pl",
  "currencyCode": "PLN",
  "referralCode": "ABCD12",
  "acquisition": { "src": "landing", "lang": "pl" }
}
```

Public. The client obtains a Google **ID token** (mobile and web via `expo-auth-session`) and the server verifies it (`GoogleTokenVerifier`, audiences from `GOOGLE_OAUTH_CLIENT_IDS`, `email_verified` required). Resolution: by `googleId` → auto-link by verified e-mail (a deactivated account is rejected, not linked) → otherwise a new verified, passwordless user plus default account. Only `idToken` is required. Details: `docs/wiki/auth.md`.

**Response** `200 OK` — same shape as Login.

### Change Email

Both steps are JWT-guarded.

```http
POST /auth/change-email/request
Authorization: Bearer <token>
Content-Type: application/json

{ "newEmail": "new@example.com", "currentPassword": "securePassword123" }
```

Sends a 6-digit code to the new address. **Response** `200 OK` — `{ "message": "Verification code sent to new email address" }`. Rejected for a Google-only account (no password).

```http
POST /auth/change-email/confirm
Authorization: Bearer <token>
Content-Type: application/json

{ "code": "123456" }
```

**Response** `200 OK` — `{ "message": "Email changed successfully", "accessToken": "...", "refreshToken": "..." }` (tokens are re-issued because the e-mail is in the JWT payload).

### Restore Credentials (Android session restore)

A WebAuthn credential that lets a signed-in session survive an Android device transfer (Google Play requirement). Registration is JWT-guarded; the sign-in ceremony is public because the restored device has no token yet. `503` when the relying party is not configured. Details: `docs/wiki/features/restore-credentials.md`.

```http
GET /auth/restore/register/options
Authorization: Bearer <token>
```
Returns WebAuthn `PublicKeyCredentialCreationOptionsJSON` (from `@simplewebauthn/server`).

```http
POST /auth/restore/register
Authorization: Bearer <token>
Content-Type: application/json

{ "response": { /* RegistrationResponseJSON */ } }
```
**Response** `200 OK` — `{ "ok": true }`. `401` if no registration is pending or verification fails.

```http
DELETE /auth/restore
Authorization: Bearer <token>
```
Deletes the caller's restore credential (sign-out cleanup; works even when the relying party is not configured).

```http
GET /auth/restore/options
```
Public, throttled 20/min per IP. Returns `PublicKeyCredentialRequestOptionsJSON`.

```http
POST /auth/restore
Content-Type: application/json

{ "response": { /* AuthenticationResponseJSON */ } }
```
Public, throttled 10/min per IP. **Response** `200 OK` — same shape as Login. `401` for an unknown/expired challenge, an unknown credential, a failed assertion, or a deactivated/unverified user.

---

## Users

### Get Current User

```http
GET /users/me
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "currencyCode": "USD",
  "timezone": "UTC",
  "aiResponseMode": "balanced",
  "aiModel": "balanced",
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ],
  "isAdmin": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

`paymentMethods` is the ordered list (by `sortOrder`) a friend's [Receipt Splitting](#receipt-splitting) guest link offers as payment options; empty when the user hasn't set any up. See **Replace Payment Methods** below for how it's written.

### Update Profile

```http
PATCH /users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Smith",
  "currencyCode": "EUR",
  "timezone": "Europe/London",
  "language": "en",
  "themeMode": "dark",
  "accentColor": "#FF8A00",
  "contributeCommunityPrices": true,
  "inflationCountry": "PL"
}
```

All fields optional: `name`, `currencyCode`, `timezone`, `language`, `contributeCommunityPrices`, `themeMode`, `accentColor` (`null` resets it), `paymentMethod`/`paymentHandle` (legacy single pair — prefer **Replace Payment Methods**), `inflationCountry` (country for [Real Salary](#real-salary), `null` = guess from the timezone). Notification toggles are **not** here — they live on `PATCH /users/me/notification-preferences` (see [Alerts](#alerts)).

**Response** `200 OK`

### Update AI Response Mode

```http
PATCH /users/me/ai-response-mode
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "balanced"
}
```

**Mode values**: `simple`, `balanced`, `expert`

**Response** `200 OK`
```json
{ "success": true, "mode": "balanced" }
```

### Update AI Model

```http
PATCH /users/me/ai-model
Authorization: Bearer <token>
Content-Type: application/json

{
  "model": "fast"
}
```

**Model values**: `fast`, `balanced`, `quality`

| Value | OpenAI Model | Max Tokens | Cost Multiplier |
|-------|-------------|-----------|-----------------|
| `fast` | `gpt-4o-mini` | 1500 | ×0.75 |
| `balanced` | `gpt-4o` | 2000 | ×1.0 |
| `quality` | `gpt-4.1` | 3000 | ×1.5 |

**Response** `200 OK`
```json
{ "success": true, "model": "fast" }
```

### Replace Payment Methods

```http
PUT /users/me/payment-methods
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ]
}
```

Replaces the caller's entire payment-method list in one atomic call — at most 5 entries, one per `method` (`blik`, `revolut`, `paypal`, `cash`, `other`; a duplicate method in the array is rejected with `400`), each `handle` validated against the same handle format used by the trip-wallet payment settings. An empty array is valid and clears the list. Also clears the legacy `paymentMethod`/`paymentHandle` pair on the user in the same transaction, so a value set before this endpoint existed can never resurface once the list has been saved (even saved empty).

This is what a [Receipt Splitting](#receipt-splitting) guest link resolves first, at the moment the guest opens it, when deciding which pay button(s) to show — so changing it here also fixes links already sent out.

**Response** `200 OK`
```json
{
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ]
}
```

### Update Push Token

```http
PATCH /users/me/push-token
Authorization: Bearer <token>
Content-Type: application/json

{ "pushToken": "ExponentPushToken[...]" }
```

`null` clears it. **Response** `200 OK` — `{ "success": true }`.

### Record Acquisition Source

```http
PATCH /users/me/acquisition
Authorization: Bearer <token>
Content-Type: application/json

{ "src": "referral", "loc": "hero", "lang": "pl", "plan": "pro", "referrerRaw": "https://..." }
```

First-touch attribution for a user who arrived before signing up (all fields optional). **Response** `204 No Content`. See `docs/wiki/features/acquisition-tracking.md`.

### Search Users

```http
GET /users/search?q=anna
Authorization: Bearer <token>
```

Finds active users (never the caller) by name or e-mail substring, case-insensitive, for inviting them to an account. Fewer than 2 characters returns `[]`. Throttled 20/min.

**Response** `200 OK` — up to 20 `{ "id", "name", "email" }` rows. See `docs/wiki/features/invite-by-search.md`.

### Voice Digest Settings

The weekly voice digest — a short spoken summary of the week sent to a linked bot (Telegram, WhatsApp or Slack). User-level: **no** `X-Account-Id` needed. Details: `docs/wiki/features/voice-digest.md`.

```http
GET /users/me/voice-digest
Authorization: Bearer <token>
```

**Response** `200 OK` — `VoiceDigestSettings` (`packages/shared-types/src/dto/voice-digest.ts`):
```json
{
  "enabled": true,
  "day": 0,
  "hour": 19,
  "channel": "telegram",
  "availableChannels": ["telegram", "slack"],
  "whatsappAvailable": false
}
```

`day` is 0 = Sunday … 6 = Saturday and `hour` 0–23, both in the user's own timezone. `availableChannels` lists only the bots the user has linked; `channel` is `null` when the stored one is no longer linked. `whatsappAvailable` is `false` until WhatsApp is linked **and** `WHATSAPP_DIGEST_TEMPLATE` is configured.

```http
PATCH /users/me/voice-digest
Authorization: Bearer <token>
Content-Type: application/json

{ "enabled": true, "day": 5, "hour": 18, "channel": "slack" }
```

All fields optional. `400` when `channel` is not linked, when WhatsApp is chosen before its template is configured, or when enabling with no deliverable channel (with no `channel` given, the first deliverable linked one is picked). **Response** `200 OK` — the updated settings.

### Delete Account

```http
DELETE /users/me
Authorization: Bearer <token>
```

Deactivates the caller's user. **Response** `200 OK` — `{ "success": true }`.

---

## Accounts

### Create Account

```http
POST /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Family Budget",
  "type": "shared",
  "currencyCode": "USD",
  "icon": "family"
}
```

**Type values**: `personal`, `business`, `shared`

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Family Budget",
  "type": "shared",
  "currencyCode": "USD",
  "ownerId": "user-uuid",
  "icon": "family",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### List Accounts

```http
GET /accounts
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Personal",
    "type": "personal",
    "currencyCode": "USD",
    "ownerId": "user-uuid",
    "role": "owner",
    "memberCount": 1
  }
]
```

### Get Account

```http
GET /accounts/:id
Authorization: Bearer <token>
```

### Update Account

```http
PATCH /accounts/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "icon": "wallet",
  "monthAnchorDay": 10
}
```

**Owner-only.** `monthAnchorDay` (1..31, or explicit `null` to reset) shifts the account's "financial month" for budget periods — e.g. `10` makes a budget's monthly period run the 10th to the 9th instead of the 1st to the last day. `null`/omitted means the calendar month. Setting it is retroactive: it re-buckets budget history for past periods too without changing any expense/income data. Anchor days above what a given month has (e.g. 31 in February) clamp to that month's last day. As of Wave 1 this only affects budgets (`GET /budgets/:id/progress`, `GET /budgets/:id/history`) — analytics, reports, and other month-based views still use the calendar month.

### Delete Account

```http
DELETE /accounts/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

### Create Invitation

```http
POST /accounts/:id/invitations
Authorization: Bearer <token>
Content-Type: application/json

{
  "invitedEmail": "friend@example.com",
  "role": "editor"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "inviteCode": "ABC123XYZ",
  "role": "editor",
  "status": "pending",
  "expiresAt": "2024-01-22T10:30:00Z"
}
```

### List Invitations

```http
GET /accounts/:id/invitations
Authorization: Bearer <token>
```

### Cancel Invitation

```http
DELETE /accounts/:id/invitations/:invitationId
Authorization: Bearer <token>
```

### Accept Invitation

```http
POST /accounts/invitations/accept
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### Decline Invitation

```http
POST /accounts/invitations/decline
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### List Members

```http
GET /accounts/:id/members
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "member-uuid",
    "userId": "user-uuid",
    "role": "owner",
    "joinedAt": "2024-01-01T00:00:00Z",
    "user": {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
]
```

### Update Member Role

```http
PATCH /accounts/:id/members/:memberId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "viewer"
}
```

### Remove Member

```http
DELETE /accounts/:id/members/:memberId
Authorization: Bearer <token>
```

### Leave Account

```http
POST /accounts/:id/leave
Authorization: Bearer <token>
```

### My Pending Invitations

```http
GET /accounts/invitations/mine
Authorization: Bearer <token>
```

Pending, unexpired invitations addressed to the caller's e-mail (returns `[]` if the user row is missing — never every pending invitation).

### Respond to Invitation

```http
PATCH /accounts/invitations/:id/respond
Authorization: Bearer <token>
Content-Type: application/json

{ "action": "accept" }
```

`action` is `accept` or `decline`. The invitation must be addressed to the caller (checked before anything else) and not expired.

### Update My Payment Info (trip wallet)

```http
PATCH /accounts/:id/members/me/payment-info
Authorization: Bearer <token>
Content-Type: application/json

{ "paymentMethod": "blik", "paymentHandle": "+48 600 100 200" }
```

The caller's own per-account payment details used by trip settle-up. `paymentMethod`: `blik`, `revolut`, `paypal`, `cash`, `other`; `paymentHandle` matches `^[A-Za-z0-9+ ._-]{1,50}$`.

### Archive Trip

```http
PATCH /accounts/:id/archive-trip
Authorization: Bearer <token>
Content-Type: application/json

{ "force": false }
```

Owner only (`403` otherwise). Archives a `trip` account, making it read-only. `400` while settle-up transactions are still unconfirmed unless `force: true`. See `docs/wiki/features/trip-wallet.md`.

### Trip Settle-Up

JWT + account context. The account id is always taken from the guard-validated `X-Account-Id`, never from the `:id` path segment.

```http
GET /accounts/:id/settle-up
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — `SettleUpResponse` (`packages/shared-types/src/dto/expense.ts`):
```json
{
  "balances": [ { "userId": "uuid", "userName": "Anna", "netAmount": -42.50 } ],
  "suggestedTransfers": [ { "fromUserId": "uuid-a", "toUserId": "uuid-b", "amount": 42.50 } ],
  "currencyCode": "EUR",
  "fxApproximate": false,
  "pendingTransactions": []
}
```

`netAmount` is in the account currency — positive = is owed, negative = owes.

```http
POST /accounts/:id/settle-up/pay
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "fromUserId": "uuid-a", "toUserId": "uuid-b", "amount": 42.50 }
```

Blocked by `TripArchivedGuard` once the trip is archived (allowed while `settling`). **Response** — `{ "transactionId", "paymentLink", "manualInstructions", "paymentHandle" }` (`paymentLink` is a Revolut/PayPal deep link when the receiver has one).

```http
PATCH /accounts/:id/settle-up/:txnId/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Only the receiving member can confirm. Deliberately not archive-guarded, so an in-flight payment on a force-archived trip can still be confirmed.

---

## Expenses

All expense endpoints require `X-Account-Id` header.

### List Expenses

```http
GET /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Filter from date |
| `endDate` | ISO 8601 | Filter to date |
| `categoryId` | UUID | Filter by category |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 29.99,
      "discountAmount": null,
      "currencyCode": "USD",
      "description": "Lunch at restaurant",
      "date": "2024-01-15",
      "time": "12:30",
      "locationLat": 40.7128,
      "locationLng": -74.0060,
      "locationName": "Whole Foods, 123 Main St",
      "notes": "Business lunch",
      "receiptUrl": null,
      "isRecurring": false,
      "source": "manual",
      "syncVersion": 1,
      "createdAt": "2024-01-15T12:35:00Z",
      "category": {
        "id": "uuid",
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF6B6B"
      }
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Create Expense

```http
POST /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "categoryId": "uuid",
  "amount": 29.99,
  "discountAmount": 5.00,
  "currencyCode": "USD",
  "description": "Lunch at restaurant",
  "date": "2024-01-15",
  "time": "12:30",
  "location": { "lat": 40.7128, "lng": -74.0060, "name": "Whole Foods, 123 Main St" },
  "notes": "Business lunch",
  "isRecurring": false,
  "source": "manual",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Note:** `tagIds` is optional. Tags will be associated with the expense automatically.

**Receipt fingerprint:** `receiptFingerprint` (optional, 64-char lowercase SHA-256 hex, returned by [Scan Receipt](#scan-receipt)) is stored so a later upload of the same file is flagged before OCR — see [Receipt Duplicate Check](#receipt-duplicate-check).

**Location:** `location` is an optional `{ lat, lng, name? }` object (persisted as the flat `locationLat`/`locationLng`/`locationName` columns returned by read endpoints). On `PATCH /expenses/:id`, send `"location": null` to clear it. It is set automatically from a scanned receipt's store address (see [Scan Receipt](#scan-receipt)) or, when the user opts in, from the device's GPS at creation time.

**Response** `201 Created`

### Get Single Expense

```http
GET /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Update Expense

```http
PATCH /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 35.50,
  "description": "Lunch at Italian restaurant"
}
```

### Delete Expense

```http
DELETE /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Bulk Update Expenses

Bulk update or soft-delete multiple expenses in one call. Powers the mobile multi-select bulk delete / recategorize / tag actions.

```http
PATCH /expenses/bulk
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "ids": ["uuid-1", "uuid-2"],
  "categoryId": "uuid",
  "tagIds": ["tag-uuid-1"],
  "isDeleted": false
}
```

**Guards:** `JwtAuthGuard` + `AccountContextGuard` + `ViewerBlockGuard` (write action — viewers blocked).

**Body** (`BulkUpdateExpensesDto`)
| Field | Type | Description |
|-------|------|-------------|
| `ids` | string[] | Required. 1–500 expense identifiers. |
| `categoryId` | string \| null | Optional. Reassign category; `null` clears it. |
| `tagIds` | string[] | Optional. Tags to append to each expense. |
| `isDeleted` | boolean | Optional. When `true`, soft-deletes the expenses (overrides `categoryId`/`tagIds`). |

**Behaviour:** Validates that the ids belong to the account. When `isDeleted: true`, the matched expenses are soft-deleted; otherwise the supplied `categoryId` and/or `tagIds` are applied (tags are appended, not replaced).

**Note:** `ids` and `tagIds` may be **server PKs or the mobile's local `clientId`s** (offline-first). The service resolves both via `OR: [{ id }, { clientId }]`, so synced and unsynced rows are matched alike.

**Response** `200 OK`
```json
{ "updated": 2 }
```

### Expense Items

#### List Items

```http
GET /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "description": "Organic Apples",
    "quantity": 2.0,
    "unitPrice": 3.99,
    "totalPrice": 7.98,
    "sortOrder": 0
  }
]
```

#### Create Item

```http
POST /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Almond Milk",
  "quantity": 1,
  "unitPrice": 4.49,
  "totalPrice": 4.49,
  "lineDiscount": 0.50,
  "sortOrder": 1
}
```

`lineDiscount` (optional, ≥ 0, also accepted on update) is the discount printed against that line; receipt splitting scales shares by it.

#### Update Item

```http
PATCH /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 2,
  "totalPrice": 8.98
}
```

#### Delete Item

```http
DELETE /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Receipt Image

#### Get Receipt Image

```http
GET /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response:**
```json
{
  "imageBase64": "/9j/4AAQ...",
  "mimeType": "image/jpeg"
}
```

`mimeType` is `image/jpeg` for photos or `application/pdf` for PDF receipts (e.g. from Telegram).

#### Save Receipt Image

```http
PUT /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

#### Delete Receipt Image

```http
DELETE /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Stop Recurring

```http
PATCH /expenses/:id/stop-recurring
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked. Sets `isRecurring: false` on the expense so the daily recurring-expense cron stops cloning the series; history is kept.

### Move Expense to Another Account

```http
POST /expenses/:id/move
Authorization: Bearer <token>
X-Account-Id: <source-account-uuid>
Content-Type: application/json

{ "targetAccountId": "uuid" }
```

Viewer-blocked and archive-guarded on the source; the caller must be a non-viewer member of the target. The category is remapped by case-insensitive name into the target (else cleared); tags, project links and category splits are dropped; a `clientId` clash in the target is resolved with a fresh UUID. End-to-end encrypted expenses are rejected with `400`.

**Response** `200 OK` — `{ "id": "uuid", "accountId": "target-uuid", "categoryId": "uuid-or-null" }`.

### Merge Two Expenses

```http
POST /expenses/merge
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "keepId": "uuid",
  "mergeId": "uuid",
  "fieldChoices": { "merchant": true, "notes": false, "categoryId": true, "projectId": false, "tagIds": true, "receiptImage": true }
}
```

Viewer-blocked. Folds `mergeId` into `keepId` (e.g. an auto-captured bank notification and the scanned receipt of the same charge). Each `fieldChoices` flag set to `true` takes that field from the merged row; the survivor keeps its own amount and currency. Line items move to the survivor when it has none.

**Response** `200 OK` — `{ "keptId": "uuid", "mergedId": "uuid" }`.

---

## Incomes

All income endpoints require `X-Account-Id` header.

### List Incomes

```http
GET /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Filter from date |
| `endDate` | ISO 8601 | Filter to date |
| `categoryId` | UUID | Filter by category |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 5000.00,
      "currencyCode": "USD",
      "description": "Freelance payment",
      "date": "2024-01-15",
      "notes": "January invoice",
      "syncVersion": 1,
      "createdAt": "2024-01-15T10:00:00Z",
      "category": {
        "id": "uuid",
        "name": "Freelance",
        "color": "#4CAF50"
      }
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

### Create Income

```http
POST /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "amount": 5000.00,
  "currencyCode": "USD",
  "description": "Freelance payment",
  "notes": "January invoice",
  "categoryId": "uuid",
  "date": "2024-01-15T00:00:00Z"
}
```

**Response** `201 Created`

### Get Single Income

```http
GET /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Update Income

```http
PATCH /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 5500.00,
  "description": "Freelance payment (updated)"
}
```

### Delete Income

```http
DELETE /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Bulk Update Incomes

```http
PATCH /incomes/bulk
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "ids": ["uuid-1", "uuid-2"], "categoryId": "uuid" }
```

Viewer-blocked. 1–500 ids (server PKs or `clientId`s), scoped to the account; used to apply the reviewed result of `POST /ai/categorize-uncategorized-income`.

**Response** `200 OK` — `{ "updated": 2 }`.

---

## Budgets

All budget endpoints require `X-Account-Id` header.

### List Budgets

```http
GET /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Monthly Food Budget",
      "amount": 500.00,
      "currencyCode": "USD",
      "period": "monthly",
      "startDate": "2024-01-01",
      "endDate": null,
      "categoryId": "uuid",
      "alertThreshold": 80,
      "isActive": true,
      "syncVersion": 1,
      "category": {
        "id": "uuid",
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF6B6B"
      }
    }
  ]
}
```

### Create Budget

```http
POST /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "name": "Monthly Food Budget",
  "amount": 500.00,
  "currencyCode": "USD",
  "period": "monthly",
  "startDate": "2024-01-01",
  "categoryId": "uuid",
  "alertThreshold": 80
}
```

**Period Values**: `daily`, `weekly`, `monthly`, `yearly`, `custom`

**Response** `201 Created`

### Get Budget Progress

```http
GET /budgets/:id/progress
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "budget": {
    "id": "uuid",
    "name": "Monthly Food Budget",
    "amount": 500.00,
    "period": "monthly"
  },
  "spent": 325.50,
  "remaining": 174.50,
  "percentage": 65.1,
  "daysRemaining": 15,
  "dailyBurnRate": 21.70,
  "dailyAllowance": 11.63,
  "projectedTotal": 651.50,
  "estimatedExhaustionDate": "2024-01-23",
  "onTrack": true
}
```

### Update Budget

```http
PATCH /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 600.00,
  "alertThreshold": 75
}
```

### Delete Budget

```http
DELETE /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Get Budget

```http
GET /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Get Budget History

```http
GET /budgets/:id/history?periods=6
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Past periods of a budget, oldest first. `periods` defaults to 6, clamped to 1–12; monthly periods follow the account's financial-month anchor day. A `custom` budget returns `[]`.

**Response** `200 OK`
```json
[
  { "periodStart": "2026-08-01", "periodEnd": "2026-08-31", "limit": 2000, "actual": 2140.50, "isOverBudget": true }
]
```

---

## Categories

All category endpoints require `X-Account-Id` header.

### List Categories

```http
GET /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Food & Dining",
      "icon": "utensils",
      "color": "#FF6B6B",
      "type": "expense",
      "isSystem": true,
      "parentId": null,
      "syncVersion": 1
    }
  ]
}
```

### Create Category

```http
POST /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Coffee Shops",
  "icon": "coffee",
  "color": "#8B4513",
  "type": "expense",
  "parentId": "food-category-uuid"
}
```

**Type Values**: `expense`, `income`

An optional `clientId` (the device's local id) makes the create **idempotent**: a resend with the same `clientId` returns the row created the first time. Update and delete resolve `:id` as either the server PK or that `clientId`.

### Update Category

```http
PATCH /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Coffee & Tea",
  "color": "#654321",
  "coicopDivision": "CP01"
}
```

`coicopDivision` (`TOTAL`, `CP01` … `CP13`) sets the price group the category is weighed under in [Real Salary](#real-salary); changing it invalidates that account's real-salary cache.

### Delete Category

`DELETE /categories/:id`

Soft-deletes a category. Requires `editor` role or higher.

```http
DELETE /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response:** 200 OK with the updated category object.

**Error Responses:**
- `404 Not Found` — Category not found
- `409 Conflict` — Category has related records:

```json
{
  "statusCode": 409,
  "message": "Category has related records",
  "details": {
    "expenses": 5,
    "incomes": 0,
    "budgets": 1,
    "budgetCategories": 0,
    "splits": 0,
    "children": 0
  }
}
```

**Notes:**
- Both system and custom categories can be deleted
- System categories have `accountId: null` on the server — deletion hides them for all accounts
- Deletion is blocked if any related active (non-deleted) records exist

---

## Tags

All tag endpoints require `X-Account-Id` header.

### List Tags

```http
GET /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "business-trip",
      "color": "#3498DB",
      "icon": "briefcase",
      "usageCount": 12,
      "syncVersion": 1,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### Create Tag

```http
POST /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "business-trip",
  "color": "#3498DB",
  "icon": "briefcase"
}
```

**Response** `201 Created`

### Update Tag

```http
PATCH /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "work-trip",
  "color": "#2980B9"
}
```

### Delete Tag

```http
DELETE /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Tag to Expense

```http
POST /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `201 Created`

### Remove Tag from Expense

```http
DELETE /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

There is no REST route for tagging an **income**: `TagsService.addToIncome`/`removeFromIncome` exist, but no controller exposes them.

---

## Projects

All project endpoints require `X-Account-Id` header.

### List Projects

```http
GET /projects?archived=false
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `archived` | boolean | Filter by archived status |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Kitchen Renovation",
      "description": "Complete kitchen remodel",
      "color": "#E74C3C",
      "icon": "home",
      "startDate": "2026-01-01",
      "endDate": "2026-03-31",
      "budget": 5000.00,
      "currencyCode": "USD",
      "isArchived": false,
      "syncVersion": 1,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

### Get Project

```http
GET /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
Returns project with associated expenses and incomes.

### Create Project

```http
POST /projects
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "name": "Kitchen Renovation",
  "description": "Complete kitchen remodel",
  "color": "#E74C3C",
  "icon": "home",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "budget": 5000.00,
  "currencyCode": "USD"
}
```

**Response** `201 Created`

### Update Project

```http
PATCH /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Kitchen Renovation Phase 2",
  "budget": 7500.00,
  "isArchived": false
}
```

### Delete Project

```http
DELETE /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Expense to Project

```http
POST /projects/:id/expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "expenseId": "expense-uuid"
}
```

**Response** `201 Created`

### Remove Expense from Project

```http
DELETE /projects/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Income to Project

```http
POST /projects/:id/incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "incomeId": "income-uuid"
}
```

**Response** `201 Created`

### Remove Income from Project

```http
DELETE /projects/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Get Project Analytics

```http
GET /projects/:id/analytics
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Kitchen Renovation",
  "totalExpenses": 3200.00,
  "totalIncome": 0,
  "netAmount": -3200.00,
  "expenseCount": 8,
  "incomeCount": 0,
  "budgetRemaining": 1800.00,
  "expensesByCategory": [
    {
      "categoryId": "uuid",
      "categoryName": "Materials",
      "amount": 2100.00,
      "count": 5
    }
  ],
  "timeline": [
    {
      "date": "2026-01-15",
      "expenses": 450.00,
      "income": 0
    }
  ]
}
```

---

## Expense Category Splits

Splits allow distributing a single expense across multiple categories.

### Set Splits for Expense

```http
POST /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "splits": [
    {
      "categoryId": "food-uuid",
      "amount": 30.00,
      "percentage": 60,
      "notes": "Groceries"
    },
    {
      "categoryId": "household-uuid",
      "amount": 20.00,
      "percentage": 40,
      "notes": "Cleaning supplies"
    }
  ]
}
```

**Validation**: 2-10 splits per expense.

**Response** `200 OK`
```json
{
  "splits": [
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "food-uuid",
      "amount": 30.00,
      "percentage": 60,
      "notes": "Groceries",
      "category": {
        "id": "food-uuid",
        "name": "Food & Dining"
      }
    },
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "household-uuid",
      "amount": 20.00,
      "percentage": 40,
      "notes": "Cleaning supplies",
      "category": {
        "id": "household-uuid",
        "name": "Household"
      }
    }
  ]
}
```

### Remove Splits from Expense

```http
DELETE /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Note:** When an expense has splits, analytics aggregate by split categories instead of the single expense category.

---

## Wallet

All wallet endpoints require `X-Account-Id` header.

### Set Balance

```http
POST /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "currencyCode": "USD",
  "initialAmount": 5000.00
}
```

### List Balances

```http
GET /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "currencyCode": "USD",
    "initialAmount": 5000.00,
    "syncVersion": 1
  },
  {
    "id": "uuid",
    "currencyCode": "EUR",
    "initialAmount": 2000.00,
    "syncVersion": 1
  }
]
```

### Get Wallet Summary

```http
GET /wallet/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Returns one entry per currency the account **holds money in** — every currency
with a `wallet_balances` row, plus every currency that has movements (income,
expense, exchange, transfer) but no row yet. A derived currency reports
`initialAmount: 0`, so its `currentBalance` is exactly what the transactions add
up to, and the row is created in the background so the next read finds it.

A currency whose row was removed via `DELETE /wallet/:currencyCode` stays out of
the response even if it still has movements — removing a currency is a deliberate
"hide it", and that has to survive the next transaction in it. Set a balance for
it again to bring it back.

### Get Summaries for All My Accounts

```http
GET /wallet/summaries
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Wallet balances for **every** account the caller is a member of, in one round trip — the transfer form needs the other account's balance too. Keeps the class-level account-context guard but deliberately ignores `X-Account-Id`, enumerating memberships from the user; each row is built by the same `buildWalletBalanceRow` as `GET /wallet/summary`, so both screens quote the same balance. See `docs/wiki/features/account-transfers.md`.

**Response** `200 OK` — `{ "accounts": [ { "accountId": "uuid", "balances": [ /* as in Get Wallet Summary */ ] } ] }`.

### Balance History (daily)

```http
GET /wallet/balance-history?days=30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Daily per-currency balance snapshots over the last N days. `days` defaults to `30` and is capped at `90`.

> **Note:** kept for already-released app versions. The current mobile client uses the monthly endpoint below.

**Response** `200 OK`
```json
{
  "points": [
    { "date": "2026-06-01", "balances": { "USD": 5000.00, "EUR": 2000.00 } },
    { "date": "2026-06-02", "balances": { "USD": 4950.00, "EUR": 2000.00 } }
  ],
  "currencies": ["USD", "EUR"]
}
```

### Balance History (monthly)

```http
GET /wallet/balance-history/monthly?months=6
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Net per-currency balance change for each calendar month (income +, expense −, exchange ±, transfers ±). `months` defaults to `6`, clamped to `1`–`12`. Every month in the range is returned, including months with no activity.

**Response** `200 OK`
```json
{
  "months": [
    { "month": "2026-01", "deltas": { "USD": 320.00, "EUR": -50.00 } },
    { "month": "2026-02", "deltas": { "USD": -120.50, "EUR": 0 } }
  ],
  "currencies": ["USD", "EUR"]
}
```

### Remove Balance

```http
DELETE /wallet/:currencyCode
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Hides the currency from the wallet. This is a soft delete, and it is permanent
until the caller sets a balance for that currency again: a currency with a
removed row is **not** re-derived from its movements, unlike one that never had a
row at all (see **Get Wallet Summary**).

**Response** `204 No Content`

---

## Merchant Category Rules

Learned `merchant → category` mappings. A rule is created/updated automatically whenever an expense that has a merchant gets a category assigned; future bank and Wise imports auto-apply the matching category. All endpoints require JWT + `X-Account-Id` header.

### List Rules

```http
GET /merchant-rules
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "merchantNormalized": "amazon",
    "categoryId": "uuid",
    "categoryName": "Shopping",
    "categoryIcon": "cart",
    "createdAt": "2026-06-15T10:00:00.000Z",
    "updatedAt": "2026-06-15T10:00:00.000Z"
  }
]
```

### Delete Rule

```http
DELETE /merchant-rules/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Stops auto-assigning that category. **Viewer role blocked** (403).

**Response** `200 OK`

### Preview Re-apply Rule

```http
GET /merchant-rules/:id/reapply-preview
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

How many existing expenses from this merchant sit in other categories and would move to the rule's category.

**Response** `200 OK`
```json
{
  "ruleId": "uuid",
  "merchantNormalized": "amazon",
  "targetCategoryId": "uuid",
  "targetCategoryName": "Shopping",
  "totalCount": 7,
  "groups": [ { "categoryId": "uuid", "categoryName": "Other", "count": 5 } ]
}
```

### Re-apply Rule

```http
POST /merchant-rules/:id/reapply
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "categoryIds": ["uuid"] }
```

Viewer-blocked. Moves the merchant's expenses from the listed source categories into the rule's category. **Response** `200 OK` — `{ "updated": 5 }`.

---

## Currency Exchange

All currency exchange endpoints require `X-Account-Id` header.

### Create Exchange

```http
POST /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "fromCurrency": "USD",
  "toCurrency": "EUR",
  "fromAmount": 1000.00,
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15",
  "notes": "Monthly exchange"
}
```

### List Exchanges

```http
GET /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Get Exchange Rates

```http
GET /currency-exchanges/rates?base=USD
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "base": "USD",
  "rates": {
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 148.50
  }
}
```

### Get Single Exchange

```http
GET /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Delete Exchange

```http
DELETE /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Update Exchange

```http
PATCH /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "toAmount": 925.00, "exchangeRate": 0.925, "notes": "Corrected" }
```

Viewer-blocked. Any of `fromCurrency`, `toCurrency`, `fromAmount`, `toAmount`, `exchangeRate`, `date`, `notes`.

---

## Exchange Rate Alerts

"Notify me when this currency pair hits my target." A **personal** resource: rows are
keyed by `userId` only, so an alert follows the user across every account they belong to
and is never visible to other members of a shared account.

All three endpoints carry `JwtAuthGuard + AccountContextGuard`, so the mobile client's
usual `X-Account-Id` header is accepted, but the service **ignores it entirely** — same
precedent as `GET /wallet/summaries`. There is no `ViewerBlockGuard`: a viewer may set a
personal rate target exactly as they may set a display currency or theme accent.

### Create Rate Alert

```http
POST /rate-watches
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromCurrency": "EUR",
  "toCurrency": "PLN",
  "targetRate": 4.35,
  "direction": "above"
}
```

`direction` is `above` or `below`; the rate compared is always `1 fromCurrency =
<rate> toCurrency`. Both currencies must be in the supported list
(`USD`, `EUR`, `PLN`, `GBP`, `UAH`, `RUB`, `BYN`) and must differ. `targetRate` is
validated to `[0.000001, 999999]` — the column is `Decimal(12,6)`.

**Response** `201 Created`
```json
{
  "id": "uuid",
  "userId": "user-uuid",
  "fromCurrency": "EUR",
  "toCurrency": "PLN",
  "targetRate": 4.35,
  "direction": "above",
  "isActive": true,
  "createdAt": "2026-09-02T12:00:00Z",
  "triggeredAt": null,
  "triggeredRate": null
}
```

`400 Bad Request` on an unsupported currency, on `fromCurrency === toCurrency`, or when
the user already holds **20** active alerts (`MAX_ACTIVE_WATCHES`, an abuse guard — the
count-then-create is deliberately not atomic).

### List Rate Alerts

```http
GET /rate-watches
Authorization: Bearer <token>
```

Every alert of the authenticated user, newest first — **including already-triggered
ones** (`isActive: false`), which is the only record that an alert fired. Filtering to a
single pair is done client-side.

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "fromCurrency": "EUR",
    "toCurrency": "PLN",
    "targetRate": 4.35,
    "direction": "above",
    "isActive": false,
    "createdAt": "2026-09-02T12:00:00Z",
    "triggeredAt": "2026-09-02T15:00:00Z",
    "triggeredRate": 4.3512
  }
]
```

### Delete Rate Alert

```http
DELETE /rate-watches/:id
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{ "success": true }
```

Deleting is also how an alert is switched off — there is no per-type notification
preference for `rate_watch_hit` (the alert's own existence is the opt-in, same precedent
as `account_invitation` / `split_payment_claimed`). A row belonging to another user
returns `404 Not Found` rather than `403`, so the response never reveals that it exists.

### How the check runs

`ExchangeRateAlertCron` runs hourly (`0 * * * *`), pages active alerts through
`paginateById`, and groups each page by `fromCurrency` before calling the shared
`ExchangeRateService` — so a run costs at most one provider call per distinct
`fromCurrency` actually being watched (at most 7), regardless of how many users or
alerts exist. An unknown `toCurrency` rate is skipped and retried next hour.

An alert is **one-shot**: on a hit the row is flipped to `isActive: false` with
`triggeredAt`/`triggeredRate` **before** the push is sent (so two concurrent runs cannot
double-send), and if the push fails it is rolled back to active so the next run retries —
a one-shot alert has no other surface telling the user it fired, so a lost push must not
be silently final. The push (`rate_watch_hit`, localized in all 9 languages) carries only
`{ fromCurrency, toCurrency }` and deep-links to the mobile Exchange screen with that pair
preselected.

---

## Account Transfers

These endpoints carry `JwtAuthGuard + AccountContextGuard`, so `X-Account-Id` **is**
required, and the account you act as must be a party to the transfer (its source or its
destination). Writes additionally require the caller to be a member of **both** accounts
and not a viewer on the paying side — the rule is "you may create, edit or delete a
transfer only if you could have created it", checked on every write and not just when the
accounts change.

`GET` returns every transfer touching the account, **whoever created it** — the wallet
aggregates transfers by account with no user filter, so a shared account's balance already
counts a transfer made by another member (ABA-473). `userId` on the row is creator
attribution only.

A transfer may be re-homed to accounts that leave the acting account out of both sides —
that is how "this money actually went to House, not Family" is corrected from the Family
screen, and the row simply moves to the two accounts it now belongs to (ABA-472).

### Create Transfer

```http
POST /account-transfers
Authorization: Bearer <token>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "fromAccountId": "source-account-uuid",
  "fromCurrency": "USD",
  "fromAmount": 1000.00,
  "toAccountId": "destination-account-uuid",
  "toCurrency": "EUR",
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15T00:00:00Z",
  "notes": "Monthly transfer to personal",
  "countAsIncome": false
}
```

`countAsIncome: true` additionally creates an `Income` row on the destination account
(clientId `transfer-income-<localId>`), which is then what the destination's balance counts
— an incoming transfer is only added to `transferredIn` when `countAsIncome` is `false`,
so the money is never counted twice.

Create is **idempotent on `localId`**: re-sending a create whose response was lost returns
the existing row instead of a duplicate or a `500` (the mobile write queue relies on this).

**Response** `201 Created`
```json
{
  "id": "uuid",
  "localId": "client-generated-uuid",
  "fromAccountId": "source-account-uuid",
  "fromCurrency": "USD",
  "fromAmount": 1000.00,
  "toAccountId": "destination-account-uuid",
  "toCurrency": "EUR",
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15T00:00:00Z",
  "notes": "Monthly transfer to personal",
  "userId": "user-uuid",
  "createdAt": "2024-01-15T12:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

### List Transfers

```http
GET /account-transfers
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-generated-uuid",
    "fromAccountId": "source-account-uuid",
    "fromCurrency": "USD",
    "fromAmount": 1000.00,
    "toAccountId": "destination-account-uuid",
    "toCurrency": "EUR",
    "toAmount": 920.00,
    "exchangeRate": 0.92,
    "date": "2024-01-15T00:00:00Z",
    "notes": "Monthly transfer to personal",
    "userId": "user-uuid",
    "createdAt": "2024-01-15T12:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
]
```

### Update Transfer

```http
PATCH /account-transfers/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "toAccountId": "other-account-uuid",
  "toCurrency": "PLN",
  "toAmount": 6000.00
}
```

All fields optional: `fromAccountId`, `toAccountId`, `fromCurrency`, `toCurrency`,
`fromAmount`, `toAmount`, `exchangeRate`, `date`, `notes`, `countAsIncome`. Currencies
travel **with** the accounts — re-homing a transfer while keeping the old currency would
store a row that means nothing.

Toggling `countAsIncome` creates or soft-deletes the linked `Income`; changing
`toAccountId` moves that income to the new destination account, or the money would stay on
an account the transfer no longer touches.

`:id` is resolved against the server id **or** the client's `clientId`, since the mobile
client addresses a row by its local id until a wallet pull backfills the server id.

**Response** `200 OK` — the updated transfer.

### Delete Transfer

```http
DELETE /account-transfers/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Soft-deletes the transfer and its linked income (if any).

**Response** `200 OK`
```json
{ "success": true }
```

---

## Insights

Requires `X-Account-Id` header.

### Get Insights

```http
GET /insights
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "anomalies": [
    {
      "categoryId": "uuid",
      "categoryName": "Entertainment",
      "currentAmount": 450.00,
      "averageAmount": 200.00,
      "percentageChange": 125,
      "period": "2024-01"
    }
  ],
  "predictions": [
    {
      "budgetId": "uuid",
      "budgetName": "Monthly Food Budget",
      "estimatedExhaustionDate": "2024-01-25",
      "dailyBurnRate": 21.70,
      "daysRemaining": 15,
      "projectedTotal": 651.50,
      "currencyCode": "USD"
    }
  ]
}
```

### Get Inflation Shield

Forecasts each tracked product's price from receipt history and recommends what to **stock up on now** before it rises, plus how much the shield has **saved so far**. Deterministic (no LLM cost). No tier guard — available on the free plan. Cached in Redis under `shield:{accountId}:{baseCurrency}` with a 1-hour TTL.

```http
GET /insights/inflation-shield
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "baseCurrency": "PLN",
  "items": [
    {
      "canonicalName": "Coffee 500g",
      "monthlyChangePct": 6.4,
      "currentPrice": 24.99,
      "projectedPrice": 27.10,
      "quantity": 3,
      "projectedSaving": 3.17,
      "store": null,
      "currencyOriginal": "PLN",
      "affordableToday": true
    }
  ],
  "basketMonthlyForecastPct": 4.1,
  "totalProjectedSaving": 3.17,
  "savedSoFar": 12.40,
  "hasEnoughData": true,
  "fxApproximate": false,
  "computedAt": "2026-07-16T09:00:00Z"
}
```

`items[].projectedSaving` is a halved linear-ramp estimate `(projectedPrice − currentPrice) / 2 × quantity`, not the full end-of-horizon gap. `store` is `null` in Plan 1 (personal-only; community-boost is deferred). `savedSoFar` is the realized saving credited when a recommended product was actually purchased, FX-summed into `baseCurrency`. `hasEnoughData: false` returns an empty `items` array below the data threshold (≥3 price points per product).

**DTOs** (`packages/shared-types/src/dto/insights.ts`): `InflationShieldResponse`, `ShieldItem`.

### Safe-to-Spend

```http
GET /insights/safe-to-spend
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Free (no tier guard). The home hero number: `max(0, (walletBalance + expectedIncome − obligations − buffer) / daysRemaining)` up to the end of the month or the next inferred income, whichever is sooner. Cached 5 minutes per account and currency.

**Response** `200 OK` — `SafeToSpendResponse` (`packages/shared-types/src/dto/insights.ts`):
```json
{
  "baseCurrency": "PLN",
  "safeToSpendToday": 84.20,
  "projectedAvailable": 1010.40,
  "daysRemaining": 12,
  "horizonDate": "2026-10-10",
  "incomeInferred": true,
  "fxApproximate": false,
  "breakdown": { "walletBalance": 2400, "expectedIncome": 0, "upcomingSubscriptions": 120, "upcomingRecurring": 800, "goalContributions": 469.60, "buffer": 0 },
  "computedAt": "2026-09-27T10:00:00.000Z"
}
```

### Financial Wrapped

```http
GET /insights/wrapped?year=2026
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Free. A year-in-review card deck assembled from existing data; `year` is clamped to `[2000, current year]`. Only cards that have data are included; `hasEnoughData: false` with empty `cards` below 5 tracked rows or on a tier-2 encrypted account. Cached 1 hour.

**Response** `200 OK` — `WrappedResponse`: `{ "year", "baseCurrency", "generatedAt", "hasEnoughData", "fxApproximate", "cards": WrappedCard[] }` where each card is a discriminated union on `type` (`intro`, `total_tracked`, `top_merchant`, `biggest_month`, `top_category`, `category_mix`, `receipts_scanned`, `savings`, `personal_inflation`, `streak`).

### Real Salary

"Is my raise keeping up with what my own money buys": the caller's confirmed salary income (12 months vs the prior 12) against a personal inflation rate from official Eurostat HICP data plus their own receipt price index, weighted by their spend across COICOP divisions. Everything is free except the PDF brief. Details: `docs/wiki/features/real-salary.md`; types: `packages/shared-types/src/dto/real-salary.ts`.

```http
GET /insights/real-salary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — `RealSalaryResponse`:
```json
{
  "status": "ready",
  "baseCurrency": "PLN",
  "country": "PL",
  "countryGuessed": false,
  "dataMonth": "2026-08",
  "nominalChangePct": 6.0,
  "personalInflationPct": 4.8,
  "realChangePct": 1.1,
  "requiredRaisePct": 4.8,
  "breakdown": [ { "division": "CP01", "weight": 0.31, "ratePct": 5.2, "source": "receipts" } ],
  "topDrivers": ["CP01", "CP04"],
  "fxApproximate": false,
  "computedAt": "2026-09-27T10:00:00.000Z"
}
```

`status` other than `ready` (`no_salary_confirmed`, `salary_history_short`, `spend_under_3_months`, `no_inflation_source`, `encrypted`) means the figures are `null`/empty and the client shows the matching setup state.

```http
GET /insights/real-salary/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — `{ "profile": { "salaryKey": "string-or-null", "manualPreviousMonthly": null }, "candidates": [ { "key", "categoryId", "categoryName", "descriptionKey", "currencyCode", "typicalAmount", "occurrences" } ] }` — the saved choice plus detected salary-like income series to pick from.

```http
PUT /insights/real-salary/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "salaryKey": "<candidate key>", "manualPreviousMonthly": 7200 }
```

Viewer-blocked. `manualPreviousMonthly` is last year's monthly pay when the history is too short.

```http
GET /insights/real-salary/categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — `[{ "id", "name", "icon", "coicopDivision" }]`, the account's categories with the COICOP price group each is weighed under (changed with `coicopDivision` on `PATCH /categories/:id`).

```http
POST /insights/real-salary/brief?lang=pl
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Pro.** Returns a one-page PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="real-salary-YYYY-MM-DD.pdf"`). `409` with `{ "message", "status" }` when the figure is not `ready`.

### Fat Finder

```http
POST /insights/fat-finder
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "month": 9, "year": 2026, "language": "en", "forceRegenerate": false }
```

**Pro.** An AI audit of a month's spending; finding types are `subscription`, `recurring_splurge`, `large_one_off`, `category_excess`, `service_overuse`. All fields optional (defaults: current month). Computed and labelled in the caller's `user.currencyCode`, never a row's currency. **Response** — `FatFinderResponse` (`packages/shared-types/src/dto/fat-finder.ts`).

---

## AI Insights

Requires `X-Account-Id` header. Available on all subscription tiers. Uses AI requests from monthly allowance.

### Get AI-Generated Insights

```http
GET /insights/ai-charts?language=en
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | string | Response language code (en, ru, de, es, fr, pl, ua) |

**Response** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "anomaly_spike",
      "title": "Food spending spike",
      "description": "Your food spending increased 45% compared to the 3-month average.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "bar",
        "title": "Food Spending Comparison",
        "data": [
          { "label": "Average", "value": 200, "color": "#4ECDC4" },
          { "label": "This month", "value": 290, "color": "#E74C3C" }
        ]
      },
      "actionSuggestion": "Consider setting a budget for this category.",
      "generatedAt": "2026-02-10T12:00:00Z"
    }
  ],
  "generatedAt": "2026-02-10T12:00:00Z",
  "periodStart": "2026-02-01T00:00:00Z",
  "periodEnd": "2026-02-28T00:00:00Z"
}
```

**Note:** Results are cached for 24 hours.

---

## Spending Story

Requires `X-Account-Id` header. Available on all subscription tiers. Uses AI requests from monthly allowance.

### Generate Spending Story

```http
POST /insights/story
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "period": "month",
  "forceRegenerate": false,
  "language": "en"
}
```

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | `week` or `month` |
| `forceRegenerate` | boolean | Force regeneration (bypasses 24h cache) |
| `language` | string | Response language code |

**Response** `200 OK`
```json
{
  "story": {
    "id": "uuid",
    "accountId": "uuid",
    "periodLabel": "February 2026",
    "periodStart": "2026-02-01T00:00:00Z",
    "periodEnd": "2026-02-28T00:00:00Z",
    "blocks": [
      {
        "type": "hero_metric",
        "order": 1,
        "content": {
          "title": "Total Spent",
          "metrics": [{ "label": "Total", "value": "$1,250.00", "change": -12 }],
          "tone": "positive"
        }
      }
    ],
    "summary": "Great month! You spent 12% less than last month.",
    "generatedAt": "2026-02-10T12:00:00Z"
  },
  "isStale": false
}
```

**Block types:** `hero_metric`, `narrative_text`, `chart`, `comparison`, `callout`, `achievement`

---

## Analytics Drill-Down

Requires `X-Account-Id` header.

### Get Drill-Down Data

```http
POST /analytics/drill-down
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "level": "month",
  "parentId": null,
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "currencyCode": "USD"
}
```

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | string | `year`, `month`, `week`, `day`, `transactions` |
| `parentId` | string | Category or date key for next level |
| `startDate` | ISO 8601 | Period start |
| `endDate` | ISO 8601 | Period end |
| `currencyCode` | string | Currency filter |

**Response** `200 OK`
```json
{
  "chart": {
    "chartType": "bar",
    "title": "Monthly Spending",
    "data": [
      { "label": "Jan", "value": 1200, "id": "2026-01" },
      { "label": "Feb", "value": 980, "id": "2026-02" }
    ],
    "drillDown": {
      "enabled": true,
      "currentLevel": "year",
      "nextLevel": "month"
    }
  },
  "breadcrumb": [
    { "level": "year", "label": "2026" }
  ]
}
```

---

## AI Services

### Transcribe Audio

```http
POST /ai/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data

audio: <audio file>
language: "en" (optional)
```

**Response** `200 OK`
```json
{
  "text": "I spent twenty dollars on lunch today",
  "language": "en",
  "duration": 3.5
}
```

### Parse Expense from Text

```http
POST /ai/parse-expense
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "I spent twenty dollars on lunch today at the Italian place"
}
```

**Response** `200 OK`
```json
{
  "amount": 20.00,
  "currencyCode": "USD",
  "description": "Lunch at Italian place",
  "date": "2024-01-15",
  "suggestedCategory": "Food & Dining",
  "confidence": 0.92
}
```

### Auto-Categorize Expense

```http
POST /ai/categorize
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Uber ride to airport",
  "amount": 45.00
}
```

**Response** `200 OK`
```json
{
  "categoryId": "uuid",
  "categoryName": "Transportation",
  "confidence": 0.95,
  "alternatives": [
    { "categoryId": "uuid", "name": "Travel", "confidence": 0.75 }
  ]
}
```

### Scan Receipt

Accepts a receipt image (camera/gallery) or a PDF file encoded as base64.

```http
POST /ai/scan-receipt
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "<base64-encoded file>",
  "userPrompt": "Split equally between two people",
  "mimeType": "application/pdf"
}
```

**Body Parameters**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `imageBase64` | string | Yes | Base64-encoded image (JPEG/PNG) or PDF file |
| `userPrompt` | string | No | A note for the AI about this receipt (max 300 chars). Treated as a passive annotation, not as an instruction. |
| `mimeType` | string | No | Set to `application/pdf` for PDF files; omit for images |

**PDF processing logic:**
- Text-based PDFs (e.g. digital invoices) — text is extracted and sent to AI as plain text (cheaper)
- Scanned/image PDFs — the full PDF file is sent to AI for visual analysis

**Response** `200 OK`
```json
{
  "amount": 11.32,
  "discountAmount": null,
  "currencyCode": "USD",
  "description": "Whole Foods Market (2 items)",
  "categoryId": "uuid",
  "categorySuggestion": "Groceries",
  "merchant": "Whole Foods Market",
  "date": "2024-01-15",
  "confidence": 0.88,
  "receiptItems": [
    { "description": "Organic Apples", "quantity": 1, "unitPrice": 5.99, "totalPrice": 5.99 },
    { "description": "Almond Milk", "quantity": 1, "unitPrice": 4.49, "totalPrice": 4.49 }
  ],
  "location": { "lat": 40.7484, "lng": -73.9857, "name": "123 Main St, New York" },
  "priceFindings": []
}
```

**`location`** is the store's geocoded position, derived from the address printed on the receipt, or `null` when the address is missing or cannot be resolved. The server extracts the store (point-of-sale) address — ignoring the seller company's registered office — and geocodes it via OpenStreetMap/Nominatim (structured query, results cached). The client attaches this `location` when creating the expense. Geocoding is fail-silent: a lookup failure never blocks receipt scanning.

**`priceFindings`** (ABA-373, receipt price check) — lines on this receipt that cost measurably more than this user's own **median** price for that exact product at that exact store, over the last 12 weeks. **Always present, never omitted; an empty array means there is nothing to report.** Each entry:

```json
{
  "canonicalName": "Mleko Łaciate 3,2% 1L",
  "merchant": "Biedronka",
  "currencyCode": "PLN",
  "paidUnitPrice": 5.49,
  "baselineUnitPrice": 4.29,
  "quantity": 2,
  "changePct": 28.0,
  "overpaidAmount": 2.40,
  "source": "personal",
  "confidence": "high"
}
```

`baselineUnitPrice` is the median of the user's own prior purchases (`source: "personal"`; a `"community"` baseline is reserved for a future crowdsourced fallback and is not used yet). `confidence` is `"low"` when the baseline rests on exactly the minimum of 2 prior purchases, `"high"` on 3 or more — the client renders a "based on only two earlier purchases" caveat on `"low"` findings. `overpaidAmount = (paidUnitPrice − baselineUnitPrice) × quantity`. The comparison is **same product, same store, same currency only** — it is never converted or compared across stores or currencies, and a price rise larger than the configured cap is dropped as "probably a different product" rather than reported (see `RECEIPT_CHECK_MAX_RISE_PCT` in [ARCHITECTURE.md](./ARCHITECTURE.md#receipt-price-check)). This is deterministic arithmetic, not an AI call, and it never implies the user was overcharged or that a discount was withheld — only that the line costs more than usual and is worth a look.

### Geocode Search

Forward-geocode a typed query into candidate places for the expense location picker. Free (not an OpenAI call — no AI-usage cost).

```http
GET /ai/geocode/search?q=Biedronka%20Gdańsk&lat=54.35&lng=18.65
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search text (required; queries shorter than 3 characters return `[]`) |
| `lat` | number | Optional. Caller's latitude — biases results toward the user's position |
| `lng` | number | Optional. Caller's longitude — biases results toward the user's position |

**Response** `200 OK`
```json
{
  "results": [
    { "lat": 54.3597, "lng": 18.5842, "name": "Biedronka, Piecewska, Gdańsk, Polska" },
    { "lat": 54.3190, "lng": 18.5824, "name": "Biedronka, Kazimierza Porębskiego, Gdańsk, Polska" }
  ]
}
```

Up to 5 candidates from OpenStreetMap/Nominatim. A query shorter than 3 characters, or any lookup failure, returns `{ "results": [] }` (fail-silent). Results are cached in Redis (1 h).

**Proximity bias:** when `lat` and `lng` are supplied (and are not `0,0`), the search is biased toward a ~150 km viewbox around that point (`bounded=0`, so far-away matches are still returned when nothing is nearby) and the returned candidates are re-sorted by distance to the origin before being trimmed to 5. The rounded origin is folded into the Redis cache key, so results are cached per location. Without `lat`/`lng` the behaviour is unchanged (backward compatible).

### Suggest Tags

```http
GET /ai/suggest-tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | string | Expense description (required) |
| `merchant` | string | Merchant name (optional) |

**Response** `200 OK`
```json
{
  "tags": [
    {
      "name": "business-lunch",
      "confidence": 0.92,
      "source": "history",
      "existingTagId": "uuid"
    },
    {
      "name": "client-meeting",
      "confidence": 0.78,
      "source": "ai",
      "existingTagId": null
    }
  ]
}
```

**AI cost**: 0.5 units (only when history provides < 3 results)

**Source values**: `history` (from similar past expenses), `ai` (GPT-4 generated)

### Suggest Project

```http
POST /ai/suggest-project
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Paint for kitchen walls",
  "date": "2026-02-10",
  "locationName": "Home Depot"
}
```

**Response** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Kitchen Renovation",
  "confidence": 0.88
}
```

Returns `null` if no suitable project found (confidence < 0.6).

**AI cost**: 0.5 units

### Chat with AI Assistant

Chat with the AI assistant to get financial advice and **execute actions** like creating expenses, budgets, or querying data.

```http
POST /ai/chat
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid" (optional),
  "message": "How much did I spend on food this month?"
}
```

**Response (Query)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "This month you've spent $342.50 on Food & Dining, which is 68% of your $500 budget. You have $157.50 remaining with 15 days left in the month."
}
```

**Response (Action Required - Write)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "I'd like to add expense 20.00 PLN for groceries. Please confirm or cancel this action.",
  "pendingAction": {
    "id": "action-uuid",
    "actionType": "create_expense",
    "data": {
      "amount": 20,
      "currencyCode": "PLN",
      "description": "groceries",
      "categoryName": "Shopping",
      "date": "2026-02-21"
    },
    "displaySummary": "add expense 20.00 PLN for \"groceries\" [Shopping]"
  }
}
```

**Response (Action Executed - Read)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Here are your expenses for last week...",
  "actionResult": {
    "actionType": "get_expenses",
    "success": true,
    "data": {
      "expenses": [...],
      "total": 245.50
    }
  }
}
```

**AI Functions (14):**
- `create_expense` — Create expense (requires confirmation)
- `create_income` — Create income (requires confirmation)
- `create_budget` — Create budget (requires confirmation)
- `create_category` — Create expense/income category (requires confirmation)
- `get_expenses` — Query expenses; supports an optional `descriptionKeyword` for semantic product/line-item search, e.g. "how much did I spend on beer" (executes immediately)
- `get_budget_status` — Query budget status (executes immediately)
- `get_category_breakdown` — Query spending by category (executes immediately)
- `record_debt_repayment` — Record a repayment against a debt (requires confirmation)
- `create_debt` — Create a lent/borrowed debt record (requires confirmation)
- `get_debt_summary` — Query active debts summary (executes immediately)
- `update_goal_balance` — Update a savings goal's current balance (requires confirmation)
- `check_affordability` — Affordability Oracle: deterministic afford/no-afford verdict from the Safe-to-Spend engine (executes immediately, no confirmation)
- `add_to_shopping_list` — Add items to the shopping list (executes immediately, no confirmation)
- `get_inflation_shield` — Query stock-up-now recommendations and realized savings from the Inflation Shield engine (executes immediately, no parameters)

**Language Detection:**
The AI automatically detects the user's language from the conversation history and message content (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in the same language.

---

### Confirm Chat Action

Confirm a pending write action (create_expense, create_income, create_budget, create_category, create_debt, record_debt_repayment, update_goal_balance). Read actions (`get_*`, `check_affordability`) and `add_to_shopping_list` execute immediately and never reach this endpoint.

```http
POST /ai/chat/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid",
  "actionId": "action-uuid"
}
```

**Response** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Expense created successfully: 20.00 PLN for groceries.",
  "actionResult": {
    "actionType": "create_expense",
    "success": true,
    "data": {
      "id": "expense-uuid",
      "amount": 20,
      "currencyCode": "PLN",
      "description": "groceries",
      "category": "Shopping",
      "date": "2026-02-21"
    }
  }
}
```

---

### Reject Chat Action

Reject a pending write action.

```http
POST /ai/chat/reject
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid",
  "actionId": "action-uuid",
  "reason": "Changed my mind" (optional)
}
```

**Response** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Action cancelled. I won't create that expense."
}
```

**Note:** `confirm`/`reject` are scoped to the user who initiated the pending action — only the sender who triggered the `pendingAction` can confirm or reject it, and only within their own account.

---

### List Chat Conversations

Returns the caller's pinned conversations (unbounded — every pinned conversation is included, however old) followed by up to 20 most-recently-updated non-pinned ones; a conversation already returned in the pinned group is not repeated. Both groups are ordered by `updatedAt` descending. Account-scoped: a conversation is visible when `accountId` matches the `X-Account-Id` header **AND** (`isShared` is true **OR** the conversation was created by the caller).

```http
GET /ai/chat/conversations
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "conversation-uuid",
    "title": "Food spending this month",
    "isShared": false,
    "isOwner": true,
    "isPinned": true,
    "createdAt": "2026-05-20T14:00:00Z",
    "updatedAt": "2026-05-20T14:30:00Z"
  }
]
```

---

### Get Conversation Messages

Returns the last 50 messages (user + assistant roles only) for a conversation. Same access predicate as the conversation list.

```http
GET /ai/chat/conversations/:id/messages
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "message-uuid",
    "role": "user",
    "content": "How much did I spend on food this month?",
    "senderUserId": "user-uuid",
    "createdAt": "2026-05-20T14:30:00Z"
  },
  {
    "id": "message-uuid",
    "role": "assistant",
    "content": "This month you've spent $342.50 on Food & Dining.",
    "createdAt": "2026-05-20T14:30:02Z"
  }
]
```

---

### Poll Conversation

Returns messages newer than the `since` timestamp and refreshes the caller's Redis presence marker for the conversation (TTL 45s). Used by the mobile client to live-update a focused shared conversation (polled every ~4s).

```http
GET /ai/chat/conversations/:id/poll?since=2026-05-20T14:30:00Z
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | ISO 8601 | Return only messages created after this timestamp (optional) |

**Response** `200 OK`
```json
{
  "messages": [
    {
      "id": "message-uuid",
      "role": "user",
      "content": "@John can you check this?",
      "senderUserId": "user-uuid",
      "createdAt": "2026-05-20T14:31:00Z"
    }
  ]
}
```

---

### Toggle Conversation Sharing

Marks a conversation as shared (visible to all account members) or private (creator-only). **Creator-only** — any account member may share/unshare a conversation **they created**; the endpoint checks `conversation.userId === caller`, not the account role, so a member cannot change the sharing flag on someone else's conversation, even an account `owner`'s. Returns `403 Forbidden` when the caller is not the creator.

```http
PATCH /ai/chat/conversations/:id/shared
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "isShared": true
}
```

**Response** `200 OK`
```json
{
  "id": "conversation-uuid",
  "isShared": true
}
```

---

### Rename Conversation

Renames a conversation. **Creator-only**, checked in the same order as sharing: the conversation is looked up by `{ id, accountId }` first — a foreign account's conversation id returns `404 Not Found`, never `403`, so existence is never disclosed across an account boundary — *then* `conversation.userId !== caller` returns `403 Forbidden`. The write sets `updatedAt` back to the conversation's own current value: Prisma's `@updatedAt` only auto-bumps a field that is *absent* from the update, so without this a rename would move the conversation to the top of both the conversation list and the pinned ordering. No `ViewerBlockGuard`, matching `/shared`.

```http
PATCH /ai/chat/conversations/:id/title
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "title": "Groceries this week"
}
```

`title` is required, non-empty, max 100 characters.

**Response** `200 OK`
```json
{
  "id": "conversation-uuid",
  "title": "Groceries this week"
}
```

---

### Delete Conversation

Hard-deletes a conversation — no soft-delete flag, no undo. Same predicate and order as rename: `404` if the conversation isn't in the caller's account, `403` if the caller isn't its creator. Its messages and every member's pins on it are removed with it (`ChatMessage.conversation` and `ChatConversationPin.conversation` are both `onDelete: Cascade`). Deleting a conversation one of the chat bots (Telegram/WhatsApp/Slack) still has linked in its own per-user state is safe: `chat()` self-heals an unresolvable `conversationId` by silently starting a new conversation. No `ViewerBlockGuard`, matching `/shared`.

```http
DELETE /ai/chat/conversations/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

### Pin or Unpin Conversation

Pins or unpins a conversation for the **calling user only** — a per-viewer preference, not a property of the conversation itself. Unlike rename, delete and sharing, this is **not creator-gated**: the access check is read visibility — `accountId` matches the header **AND** (`isShared` is true **OR** the conversation was created by the caller) — the same predicate `GET /ai/chat/conversations` uses, rather than `/shared`'s creator-only lookup. This is deliberate: a member who reads a co-owner's shared conversation needs a way to pin it too, and reusing the creator-only lookup here would let a member confirm the existence of — by pinning — a co-member's *private* conversation. Idempotent in both directions: pinning an already-pinned conversation and unpinning one that was never pinned are both no-ops. No `ViewerBlockGuard`.

```http
PUT /ai/chat/conversations/:id/pin
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "pinned": true
}
```

**Response** `200 OK`
```json
{
  "id": "conversation-uuid",
  "isPinned": true
}
```

### Parse Income from Text

```http
POST /ai/parse-income
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "text": "got 5000 zł salary today" }
```

AI-metered (`parse`, 1.0). Income counterpart of Parse Expense — matches against **income-type** categories.

### Extract Text from Image

```http
POST /ai/extract-text
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "imageBase64": "<base64>" }
```

AI-metered (`ocr`, 2.0). Plain OCR — returns `{ "text": "..." }` without receipt parsing.

### Suggest Category

```http
GET /ai/suggest-category?description=Uber%20ride
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Tries the account's own history first, then falls back to the model. **Response** `200 OK` — `{ "categoryId", "categoryName", "confidence", "source": "history" | "ai" }`.

### Receipt Duplicate Check

```http
GET /ai/receipt-duplicate?fingerprint=<sha>
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Stage 1 of the duplicate-receipt warning: has this exact file been scanned and saved before? The client sends only the fingerprint it computed on the device. Deliberately **not** AI-metered. Stage 2 (a different file with the same merchant/amount/currency/date ±1 day) is reported by `POST /ai/scan-receipt` itself. See `docs/wiki/features/receipt-duplicate-warning.md`.

**Response** `200 OK`
```json
{
  "duplicate": {
    "kind": "exact",
    "expenseId": "uuid",
    "clientId": "uuid",
    "merchant": "Lidl",
    "description": null,
    "amount": 84.37,
    "currencyCode": "PLN",
    "date": "2026-09-20"
  }
}
```

`duplicate` is `null` when nothing matches.

### Categorize Uncategorized Expenses / Incomes

```http
POST /ai/categorize-uncategorized
POST /ai/categorize-uncategorized-income
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked, **read-only**: suggests categories for the account's uncategorized rows; the client applies the reviewed result through the category endpoints and `PATCH /expenses/bulk` / `PATCH /incomes/bulk`. Merchant category rules are applied first, before any model call. Outside the monthly AI quota, with its own per-account daily ceiling (`AI_CATEGORIZE_MAX_PER_DAY`, shared by both passes). See `docs/wiki/features/categorize-uncategorized.md`.

**Response** `200 OK` — `CategorizeSuggestionsResponse` (`incomes` instead of `expenses` for the income pass, `packages/shared-types/src/dto/ai.ts`):
```json
{
  "expenses": [ { "id": "uuid", "clientId": "uuid", "merchant": "Orlen", "description": null, "amount": 250, "currencyCode": "PLN", "date": "2026-09-12" } ],
  "groups": [ { "categoryId": "uuid", "proposedName": null, "expenseIds": ["uuid"] } ],
  "unassigned": [],
  "skippedEncrypted": 0,
  "remainingToday": 4,
  "limitReached": false
}
```

A group with `categoryId: null` carries a `proposedName` for a category that does not exist yet.

### Savings Goals

All under JWT + account context. Types: `packages/shared-types/src/dto/goal.ts`.

```http
POST /ai/goals
Content-Type: application/json

{ "name": "Vacation", "targetAmount": 5000, "currencyCode": "EUR", "deadline": "2027-06-01" }
```
Viewer-blocked, AI-metered (`goal_plan`, 2.0). Creates the goal and an AI savings plan. **Response** — `{ "goal": SavingsGoal, "plan": GoalPlan }`.

```http
GET /ai/goals
GET /ai/goals/:id
GET /ai/goals/:id/progress
```
`progress` returns `{ "goal", "percentComplete", "onTrack", "projectedCompletionDate", "monthlyNeeded", "behindByAmount" }`.

```http
PATCH /ai/goals/:id
Content-Type: application/json

{ "currentAmount": 1200 }
```
Viewer-blocked. Any of `name`, `targetAmount`, `deadline`, `currentAmount`, `status`. An increase of `currentAmount` is also recorded as a contribution; reaching `targetAmount` completes the goal.

```http
DELETE /ai/goals/:id
GET /ai/goals/:id/contributions
POST /ai/goals/:id/regenerate-plan
```
`DELETE` is viewer-blocked. `contributions` returns the last 20 contributions, newest first. `regenerate-plan` is viewer-blocked and AI-metered (`goal_plan`, 2.0).

---

## Analytics

All analytics endpoints require `X-Account-Id` header.

### Get Spending Summary

```http
GET /analytics/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Period start (required) |
| `endDate` | ISO 8601 | Period end (required) |

**Response** `200 OK`
```json
{
  "period": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  },
  "totalExpenses": 2150.75,
  "totalIncome": 5000.00,
  "netSavings": 2849.25,
  "expenseCount": 47,
  "averageExpense": 45.76,
  "categoryBreakdown": [
    {
      "categoryId": "uuid",
      "categoryName": "Food & Dining",
      "amount": 542.30,
      "percentage": 25.2,
      "count": 15
    }
  ],
  "topExpenses": [
    {
      "id": "uuid",
      "description": "Monthly Rent",
      "amount": 1200.00,
      "date": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Get Spending Trends

```http
GET /analytics/trends
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Period start (required) |
| `endDate` | ISO 8601 | Period end (required) |
| `groupBy` | string | `day`, `week`, `month` (default: week) |

**Response** `200 OK`
```json
{
  "trends": [
    {
      "period": "2024-01-01",
      "total": 450.25,
      "count": 12
    }
  ],
  "comparison": {
    "previousPeriod": 1850.00,
    "currentPeriod": 2150.75,
    "change": 300.75,
    "changePercentage": 16.3
  },
  "monthlyAverage": 2000.38
}
```

### Get Tag Breakdown

```http
GET /analytics/by-tag?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Period start (required) |
| `endDate` | ISO 8601 | Period end (required) |

**Response** `200 OK` — a bare array, sorted by `amount` descending:
```json
[
  {
    "tagId": "uuid",
    "tagName": "business-trip",
    "color": "#3498DB",
    "amount": 1250.00,
    "count": 8,
    "percentage": 35.2
  }
]
```

On a fully end-to-end encrypted (tier-2) account the response is `{ "encryptionRestricted": true, "data": [] }` instead.

### Get Project Breakdown

```http
GET /analytics/by-project
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

No query parameters — totals cover each project's whole lifetime.

**Response** `200 OK` — a bare array (or `{ "encryptionRestricted": true, "data": [] }` on a tier-2 account):
```json
[
  {
    "projectId": "uuid",
    "projectName": "Kitchen Renovation",
    "color": "#E67E22",
    "totalExpenses": 3200.00,
    "totalIncome": 0,
    "expenseCount": 8,
    "budget": 5000.00,
    "isArchived": false
  }
]
```

### Get Item Breakdown

```http
GET /analytics/items?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Top 50 receipt line items in the period by spend, grouped by description.

**Response** `200 OK`
```json
[
  { "description": "Milk 2%", "totalSpent": 42.60, "count": 12, "avgPrice": 3.55 }
]
```

### Get Aggregated Summary (all accounts)

```http
GET /analytics/aggregated?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Summary across **every** account the caller is a member of (tier-2 encrypted accounts excluded), not just the one in `X-Account-Id`.

**Response** `200 OK`
```json
{
  "period": { "start": "2026-09-01T00:00:00.000Z", "end": "2026-09-30T00:00:00.000Z" },
  "totalIncome": 5200,
  "totalExpenses": 3100,
  "netSavings": 2100,
  "expensesByCategory": [],
  "topExpenses": [],
  "trends": { "vsLastPeriod": 0, "vsAverage": 0 },
  "accountCount": 3
}
```

### Get Savings Detail (discounts / deposits)

```http
GET /analytics/savings-detail?kind=discount&startDate=2026-01-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Backs the tappable "Discount savings" / "Deposits paid" rows on the Analytics tab — the same `Expense.discountAmount` / `Expense.depositAmount` columns the chat tools `get_discount_total` / `get_deposit_total` read. `kind` is required (`discount` or `deposit`, else `400`); `startDate` defaults to all time, `endDate` to today. Amounts are converted to the caller's `user.currencyCode`; a row with no exchange rate is excluded from `total` and flagged. Details: `docs/wiki/features/deposit-and-discount-totals.md`.

**Response** `200 OK` — `SavingsSummaryResponse` (`packages/shared-types/src/dto/analytics.ts`):
```json
{
  "kind": "discount",
  "encryptionRestricted": false,
  "total": 184.20,
  "receiptCount": 37,
  "byMerchant": [ { "merchant": "Biedronka", "amount": 96.10, "receiptCount": 21 } ],
  "recent": [ { "date": "2026-09-26", "merchant": "Lidl", "amount": 4.50, "expenseId": "uuid" } ],
  "totalsByCurrency": { "PLN": 184.20 },
  "baseCurrency": "PLN",
  "fxConverted": false,
  "fxApproximate": false
}
```

---

## Import

Bulk-create transactions from a Wise CSV statement. Both endpoints require `X-Account-Id`.

### Preview a Wise CSV upload

```http
POST /import/wise/preview
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<wise-statement.csv>
```

Max file size: 5 MB. Parses with `papaparse`, strips BOM, classifies each row as `expense` / `income` / `fx`, pairs FX conversion rows by shared `Payment Reference + Date + opposite sign`, folds `Total fees` into the absolute amount, and dedups by checking the `externalRef = 'wise:<TransferWise ID>'` against existing `Expense`/`Income`/`CurrencyExchange` rows in the account.

**Response** `200 OK`
```json
{
  "totalRows": 124,
  "importable": 118,
  "skipped": 6,
  "rows": [
    {
      "idx": 0,
      "kind": "expense",
      "date": "2024-10-19",
      "amount": 22.19,
      "currencyCode": "EUR",
      "description": "Reserved.com Gdansk",
      "merchant": "Reserved.com Gdansk",
      "externalRef": "wise:5478821093",
      "suggestedCategoryName": null,
      "alreadyImported": false
    },
    {
      "idx": 7,
      "kind": "fx",
      "date": "2024-10-15",
      "amount": 120.00,
      "currencyCode": "USD",
      "description": "Currency exchange",
      "externalRef": "wise:5478811010+5478811011",
      "alreadyImported": false,
      "fxFromCurrency": "USD",
      "fxFromAmount": 120.00,
      "fxToCurrency": "EUR",
      "fxToAmount": 109.50,
      "fxRate": 0.9125
    }
  ]
}
```

### Commit selected rows

```http
POST /import/wise/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* WiseImportRow[] — only rows the user kept */ ]
}
```

Wraps every insert in one `prisma.$transaction`. Rows with `alreadyImported: true` are dropped server-side. Each created record gets `source: 'import'` (on `Expense`) and the `externalRef`. Duplicate-key violations (`P2002`) are swallowed per row.

**Response** `200 OK`
```json
{
  "createdExpenses": 96,
  "createdIncomes": 19,
  "createdExchanges": 3
}
```

---

## Bank Import

Bulk-create transactions from a bank statement (CSV or PDF). All endpoints require `X-Account-Id` and are guarded by `JwtAuthGuard + AccountContextGuard`.

Supported banks: `mbank`, `pko`, `ing`, `millennium`, `pekao`, `erste` (PDF), `alior` (PDF), plus a `universal` column-mapping fallback. CSV encoding (UTF-8 / Windows-1250) is auto-detected. PDF statements (detected by the `%PDF` header) skip CSV header/mapping/fingerprint handling and have their text extracted before parsing.

### Preview a Bank Statement Upload

```http
POST /import/bank/preview?bankId=mbank&mappingId=<uuid>&encoding=auto
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<statement.csv | statement.pdf>
```

Max file size: 5 MB. The parser is chosen in this order: `mappingId` → `bankId` → saved header-fingerprint → auto-detect. FX rows (same date, opposite sign, different currency) are paired into a single `fx` row. Each row gets a deterministic `externalRef` (`bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(normalizedDesc).slice(0,8)>`). Two dedup layers run: (1) exact `externalRef` match (re-import of the same file); (2) content match on `(date, signedAmountCents, currency)` against all account Expense/Income regardless of source. Matched rows are returned with `alreadyImported: true` (auto-unchecked in the UI).

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bankId` | string | Force a specific bank parser (optional) |
| `mappingId` | string | Apply a saved column mapping (optional) |
| `encoding` | string | `auto`, `utf-8`, or `windows-1250` (optional) |

**Body Fields (multipart)**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | The statement file (CSV or PDF) |
| `mapping` | string | Inline `ColumnMapping` JSON for the universal parser (optional) |
| `delimiter` | string | CSV delimiter override (optional) |
| `amountFormat` | string | `polish` or `standard` (optional) |
| `dateFormat` | string | `auto`, `DD.MM.YYYY`, `DD-MM-YYYY`, or `YYYY-MM-DD` (optional) |

**Response** `200 OK`
```json
{
  "status": "parsed",
  "detectedBankId": "mbank",
  "totalRows": 124,
  "importable": 118,
  "skipped": 6,
  "parseErrors": 0,
  "headerFingerprint": "a1b2c3d4",
  "rows": [
    {
      "idx": 0,
      "kind": "expense",
      "date": "2024-10-19",
      "amount": 22.19,
      "currencyCode": "PLN",
      "description": "Biedronka Gdansk",
      "merchant": "Biedronka",
      "externalRef": "bank:mbank:2024-10-19:-2219:9f8a2b1c",
      "suggestedCategoryName": "Groceries",
      "alreadyImported": false
    }
  ]
}
```

### Commit Selected Rows

```http
POST /import/bank/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* ImportRow[] — only rows the user kept */ ],
  "bankId": "mbank",
  "headerFingerprint": "a1b2c3d4",
  "saveMapping": { "name": "My mBank export" }
}
```

Writes every insert in one `prisma.$transaction` with `source: 'import'` and the deterministic `externalRef`. Rows with `alreadyImported: true` are dropped server-side; duplicate-key violations are counted as `skippedDuplicates`. An `ImportBatch` is created in the same transaction so the import can be rolled back later (see **Import Batches**). The optional `saveMapping` persists the column mapping (keyed by `headerFingerprint`) for auto-application on future imports.

**Response** `200 OK`
```json
{
  "createdExpenses": 96,
  "createdIncomes": 19,
  "createdExchanges": 3,
  "skippedDuplicates": 6,
  "parseErrors": 0,
  "savedMappingId": "mapping-uuid",
  "batchId": "batch-uuid"
}
```

### List Saved Mappings

```http
GET /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Returns the account's saved column mappings (one per `headerFingerprint`).

### Create a Saved Mapping

```http
POST /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "My bank export",
  "headerFingerprint": "a1b2c3d4",
  "bankId": "universal",
  "mapping": { "date": "Data", "amount": "Kwota", "description": "Opis" },
  "delimiter": ";",
  "encoding": "windows-1250",
  "amountFormat": "polish",
  "dateFormat": "DD.MM.YYYY"
}
```

**Response** `201 Created` — the saved mapping.

### Delete a Saved Mapping

```http
DELETE /import/bank/mappings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Request a New Bank

Forwards a bank-support request (name, optional notes, optional example statement) to the **ops Telegram chat** — never to the requesting user.

```http
POST /import/bank/request-bank
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<example-statement.csv | example-statement.pdf>   (optional)
bankName=Revolut
notes=CSV export from the mobile app
```

Max file size: 5 MB.

**Response** `200 OK`
```json
{ "ok": true }
```

### Grant AI Import Consent

```http
POST /import/bank/ai-consent
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked, throttled 20/min. Records the account's one-time consent to send statement fragments to the AI provider when no bank parser recognises a file. Preview never grants it: the flow is preview → `needs_ai_consent` → user accepts → this call → preview again. See `docs/wiki/features/ai-statement-import.md`.

---

## Import Batches

Tracks committed imports (Wise + bank) so they can be rolled back. All endpoints require `X-Account-Id` and are guarded by `JwtAuthGuard + AccountContextGuard`.

### List Import Batches

Returns the last 20 import batches for the account. `canRollback` is `true` when the batch is still `committed` and within the 30-day rollback window.

```http
GET /import/batches
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "batches": [
    {
      "id": "batch-uuid",
      "source": "bank",
      "importedAt": "2026-05-20T14:00:00Z",
      "rowCount": 118,
      "status": "committed",
      "canRollback": true
    }
  ]
}
```

### Roll Back an Import Batch

Soft-deletes (`isDeleted: true`) every transaction created by the batch and clears their `externalRef` so the same file can be re-imported cleanly, then marks the batch `rolled_back`.

```http
DELETE /import/batches/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{ "rolledBack": 118 }
```

**Errors:**
- `404 Not Found` — Batch not found in this account
- `403 Forbidden` — Already rolled back, or the 30-day rollback window has expired

---

## WhatsApp

The WhatsApp bot runs on the Meta Business Cloud API. The webhook endpoints are **excluded from the `/api/v1` prefix** — their full path is `/whatsapp/webhook` (no version prefix). They are not JWT-guarded; inbound events are verified by HMAC signature instead.

### Webhook Verification (Handshake)

Meta sends a GET handshake when the webhook is registered. The endpoint echoes back the `hub.challenge` only when `hub.mode=subscribe` and `hub.verify_token` matches the configured `WHATSAPP_VERIFY_TOKEN`.

```http
GET /whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
```

**Response** `200 OK` — plain-text `hub.challenge` value (or `403 Forbidden` on mismatch).

### Inbound Webhook Event

Receives WhatsApp message events. The request body is verified with an HMAC-SHA256 signature (`X-Hub-Signature-256` header) computed over the raw request body using `WHATSAPP_APP_SECRET`. On a valid signature the endpoint ACKs `200` immediately and dispatches the update asynchronously (Meta retries on any non-200).

```http
POST /whatsapp/webhook
X-Hub-Signature-256: sha256=<hmac>
Content-Type: application/json

{ /* Meta WhatsApp webhook payload */ }
```

**Response** `200 OK` (empty) on success, `401 Unauthorized` on an invalid/missing signature.

### Generate WhatsApp Link Code

JWT-guarded (also requires `X-Account-Id`). Generates a 6-hex linking code the user sends to the bot via a `wa.me` deep link to connect their WhatsApp number.

```http
POST /users/me/whatsapp-link-code
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "code": "a1b2c3",
  "expiresAt": "2026-05-20T14:10:00Z",
  "waPhoneNumber": "+15551234567"
}
```

### Get WhatsApp Link Status

```http
GET /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "linked": true,
  "waPhoneNumber": "+15559876543",
  "waProfileName": "John Doe",
  "linkedAt": "2026-05-19T10:00:00Z"
}
```

Returns `{ "linked": false }` when no WhatsApp number is linked.

### Unlink WhatsApp

```http
DELETE /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{ "success": true }
```

## Telegram and Slack Bots

Both bots mirror the WhatsApp section above: an unauthenticated webhook verified by a secret, plus JWT-guarded linking endpoints under `/users/me`. Bot details: `docs/wiki/telegram-bot.md`, `docs/wiki/slack-bot.md`.

### Telegram Webhook

```http
POST /telegram/webhook
X-Telegram-Bot-Api-Secret-Token: <secret>
```

Excluded from `/api/v1`. `403` when the secret header does not match; otherwise the update is handled and `200` returned.

### Telegram Linking

```http
POST /users/me/telegram-link-code      (JWT + X-Account-Id)
GET /users/me/telegram-link            (JWT)
DELETE /users/me/telegram-link         (JWT)
```

`POST` returns `{ "code", "expiresAt", "botUsername" }` — the user sends `/link <code>` to the bot; the link is bound to the account in `X-Account-Id`. `GET` returns `{ "linked": true, "telegramUsername", "linkedAt" }` or `{ "linked": false }`. `DELETE` returns `{ "success": true }`.

### Slack Events and Interactivity

```http
POST /slack/events
POST /slack/interactivity
X-Slack-Signature: v0=<hmac>
X-Slack-Request-Timestamp: <unix>
```

Excluded from `/api/v1`. Verified with the `v0=` HMAC scheme over the raw body using `SLACK_SIGNING_SECRET` (`401` on failure); `url_verification` echoes the challenge. `interactivity` is form-encoded (button presses).

### Slack Install (multi-workspace OAuth)

```http
GET /slack/install
GET /slack/oauth/callback?code=...&state=...
```

Excluded from `/api/v1`, public. `install` stores a one-time state in Redis (10 min) and redirects to Slack's authorize URL (`503` page when OAuth is not configured); `callback` validates the state, exchanges the code and stores the encrypted installation, rendering an HTML result page.

### Slack Linking

```http
POST /users/me/slack-link-code         (JWT + X-Account-Id)
GET /users/me/slack-link               (JWT)
DELETE /users/me/slack-link            (JWT)
```

`POST` returns `{ "code", "expiresAt" }`; `GET` returns `{ "linked": true, "slackProfileName", "linkedAt" }` or `{ "linked": false }`.

---

## Synchronization

All sync endpoints require `X-Account-Id` header.

### Push Changes

```http
POST /sync/push
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "changes": [
    {
      "entityType": "expense",
      "operation": "create",
      "clientId": "client-uuid",
      "data": {
        "categoryId": "uuid",
        "amount": 29.99,
        "description": "Coffee",
        "date": "2024-01-15T10:00:00Z"
      },
      "clientVersion": 1
    },
    {
      "entityType": "expense",
      "operation": "update",
      "serverId": "server-uuid",
      "data": {
        "amount": 35.00
      },
      "clientVersion": 2
    },
    {
      "entityType": "expense",
      "operation": "delete",
      "serverId": "server-uuid",
      "clientVersion": 3
    }
  ]
}
```

**Response** `200 OK`
```json
{
  "processed": [
    {
      "clientId": "client-uuid",
      "serverId": "new-server-uuid",
      "serverVersion": 1,
      "status": "created"
    }
  ],
  "conflicts": [
    {
      "serverId": "server-uuid",
      "clientVersion": 2,
      "serverVersion": 4,
      "serverData": { },
      "resolution": "server_wins"
    }
  ],
  "serverTime": "2024-01-15T10:30:00Z"
}
```

### Pull Changes

```http
GET /sync/pull
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | ISO 8601 | Last sync timestamp |

**Response** `200 OK`
```json
{
  "expenses": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "operation": "upsert",
      "data": { },
      "syncVersion": 2,
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "categories": [],
  "budgets": [],
  "deletedIds": {
    "expenses": ["uuid1", "uuid2"],
    "categories": [],
    "budgets": ["uuid3"]
  },
  "serverTime": "2024-01-15T10:30:00Z"
}
```

---

## Gamification

All gamification endpoints require `X-Account-Id` header.

### Get Gamification Profile

```http
GET /gamification/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "totalXp": 85,
  "level": 1,
  "levelProgress": 85,
  "currentStreak": 3,
  "longestStreak": 5,
  "achievements": [
    {
      "id": "uuid",
      "achievementId": "first_expense",
      "progress": 100,
      "isCompleted": true,
      "unlockedAt": "2026-02-10T12:00:00Z"
    }
  ],
  "recentBadges": [
    {
      "id": "uuid",
      "achievementId": "first_expense",
      "progress": 100,
      "isCompleted": true,
      "unlockedAt": "2026-02-10T12:00:00Z"
    }
  ]
}
```

### Check Achievements

Evaluates all achievement rules, updates streak, and returns newly unlocked badges.

```http
POST /gamification/check
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "newAchievements": ["first_expense", "streak_3"],
  "updatedProgress": [
    { "achievementId": "expenses_10", "progress": 30 }
  ],
  "streak": {
    "currentStreak": 3,
    "longestStreak": 5
  },
  "totalXp": 85,
  "level": 1
}
```

**Note:** Achievement checks are also triggered automatically (fire-and-forget) when creating expenses, incomes, or budgets.

### Get Achievement Definitions

Returns all available achievement definitions. No authentication required.

```http
GET /gamification/definitions
```

**Response** `200 OK`
```json
[
  {
    "id": "first_expense",
    "i18nKey": "firstExpense",
    "category": "milestone",
    "icon": "🌟",
    "rarity": "common",
    "threshold": 1,
    "xpReward": 10
  }
]
```

**Achievement categories:** `budget`, `tracking`, `streak`, `milestone`, `savings`

**Rarity levels:** `common`, `rare`, `epic`, `legendary`

**XP system:** 100 XP per level. Achievement XP ranges from 10 (common) to 500 (legendary).

---

## Investments

Investment portfolio tracking with real-time prices from Twelve Data API. Requires `X-Account-Id` header. Requires an **investment** type account (`type: 'investment'`).

### Search Assets

```http
GET /investments/assets/search?q=AAPL
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (symbol or company name) |

**Response** `200 OK`
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc",
    "type": "stock",
    "exchange": "NASDAQ",
    "currency": "USD"
  },
  {
    "symbol": "AAPL.MX",
    "name": "Apple Inc",
    "type": "stock",
    "exchange": "BMV",
    "currency": "MXN"
  }
]
```

### List Holdings

```http
GET /investments/holdings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-uuid",
    "accountId": "account-uuid",
    "assetId": "asset-uuid",
    "asset": {
      "id": "asset-uuid",
      "symbol": "AAPL",
      "name": "Apple Inc",
      "type": "stock",
      "exchange": "NASDAQ",
      "currentPrice": 178.50,
      "priceCurrency": "USD",
      "lastPriceUpdate": "2026-02-14T16:00:00Z"
    },
    "quantity": 10,
    "averageCostBasis": 165.25,
    "totalInvested": 1652.50,
    "notes": "Long-term hold",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Create Holding

```http
POST /investments/holdings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "assetSymbol": "AAPL",
  "assetName": "Apple Inc",
  "assetType": "stock",
  "assetExchange": "NASDAQ",
  "assetCurrency": "USD",
  "notes": "Long-term hold"
}
```

**Asset Type Values**: `stock`, `crypto`, `etf`, `bond`, `commodity`

**Response** `201 Created`
```json
{
  "id": "uuid",
  "localId": "client-uuid",
  "assetId": "asset-uuid",
  "asset": {
    "symbol": "AAPL",
    "name": "Apple Inc",
    "type": "stock",
    "currentPrice": 178.50
  },
  "quantity": 0,
  "averageCostBasis": 0,
  "totalInvested": 0,
  "syncVersion": 1
}
```

### Delete Holding

```http
DELETE /investments/holdings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Note:** Deleting a holding also deletes all associated transactions.

### List Transactions

```http
GET /investments/transactions?holdingId=uuid
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `holdingId` | UUID | Filter by holding (optional) |

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-uuid",
    "holdingId": "holding-uuid",
    "type": "buy",
    "quantity": 10,
    "pricePerUnit": 165.25,
    "totalAmount": 1652.50,
    "fee": 0,
    "date": "2026-01-15",
    "notes": "Initial purchase",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Create Transaction

```http
POST /investments/transactions
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "holdingId": "holding-uuid",
  "type": "buy",
  "quantity": 10,
  "pricePerUnit": 165.25,
  "fee": 0,
  "date": "2026-01-15",
  "notes": "Initial purchase"
}
```

**Transaction Type Values**: `buy`, `sell`

**Response** `201 Created`

**Note:** Creating a transaction automatically updates the holding's `quantity`, `averageCostBasis`, and `totalInvested` fields.

### Update Transaction

```http
PATCH /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 15,
  "pricePerUnit": 164.00,
  "notes": "Adjusted purchase"
}
```

**Response** `200 OK`

### Delete Transaction

```http
DELETE /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Get Portfolio Summary

Returns aggregated portfolio metrics with current market values.

```http
GET /investments/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "totalValue": 5325.00,
  "totalInvested": 4980.00,
  "totalPnL": 345.00,
  "totalPnLPercent": 6.93,
  "dayChange": 52.50,
  "dayChangePercent": 0.99,
  "holdings": [
    {
      "holdingId": "uuid",
      "assetId": "asset-uuid",
      "symbol": "AAPL",
      "name": "Apple Inc",
      "assetType": "stock",
      "quantity": 10,
      "averageCostBasis": 165.25,
      "currentPrice": 178.50,
      "marketValue": 1785.00,
      "totalInvested": 1652.50,
      "pnl": 132.50,
      "pnlPercent": 8.02,
      "dayChange": 15.00,
      "dayChangePercent": 0.85,
      "allocationPercent": 33.52
    }
  ]
}
```

### Get Portfolio Analytics

Returns historical performance data with optional benchmark comparison.

```http
POST /investments/analytics
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "period": "month",
  "benchmark": "SPY"
}
```

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | `week`, `month`, `quarter`, `year`, `all` |
| `benchmark` | string | Benchmark symbol (optional): `SPY`, `QQQ`, `DIA`, `IWM` |

**Response** `200 OK`
```json
{
  "dates": ["2026-01-15", "2026-01-16", "2026-01-17"],
  "values": [4980.00, 5050.00, 5325.00],
  "investedValues": [4980.00, 4980.00, 4980.00],
  "benchmarkValues": [0, 0.45, 1.23],
  "benchmarkName": "SPY"
}
```

**Performance Calculation:**
```
Return % = ((End Value - Start Value) / Start Value) × 100
```

**Benchmark Values:** Normalized percentages relative to the first day (benchmarkValues[0] = 0, subsequent values = cumulative % change).

### Get Asset Price History

```http
GET /investments/holdings/:id/price-history?days=30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `days` | number | Number of days (default: 30) |

**Response** `200 OK`
```json
[
  {
    "date": "2026-01-15",
    "openPrice": 175.50,
    "closePrice": 178.50,
    "highPrice": 179.20,
    "lowPrice": 174.80,
    "volume": 45230000
  }
]
```

### Refresh Prices

Manually trigger price refresh for all holdings in the portfolio.

```http
POST /investments/refresh-prices
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "refreshed": 5,
  "failed": 0,
  "message": "Prices updated successfully"
}
```

**Note:** Prices are automatically updated every 15 minutes for active portfolios. Use this endpoint to force an immediate refresh.

### AI Portfolio Insights

Get AI-generated insights for investment portfolio analysis. Available on all subscription tiers. Uses AI requests from monthly allowance.

```http
GET /investments/insights?language=en
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| language | string | Language code (en, ru, ua, de, es, fr, pl, be) |

**Response** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "concentration_risk",
      "title": "High Concentration in AAPL",
      "description": "Apple Inc represents 45% of your portfolio, which exceeds the recommended 25% threshold for single-asset concentration.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "donut",
        "title": "Portfolio Allocation",
        "data": [
          { "label": "AAPL", "value": 45, "color": "#FF6B6B" },
          { "label": "GOOGL", "value": 30 },
          { "label": "Others", "value": 25 }
        ]
      },
      "actionSuggestion": "Consider diversifying by reducing AAPL position to below 25% of portfolio value.",
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "generatedAt": "2024-01-15T10:30:00Z",
  "portfolioSnapshotAt": "2024-01-15T10:30:00Z"
}
```

**Insight Types:**
| Type | Description | Severity Triggers |
|------|-------------|-------------------|
| `concentration_risk` | Single asset dominates portfolio | Critical: >40%, Warning: >25% |
| `sector_imbalance` | Portfolio heavily weighted to one asset type | Critical: >70%, Warning: >50% |
| `underperformer` | Asset significantly lagging benchmark | Critical: <-30%, Warning: <-15% |
| `overperformer` | Asset significantly beating benchmark | Info: >+20% |
| `benchmark_deviation` | Portfolio straying from benchmark | Critical: >25%, Warning: >15% |
| `diversification_gap` | Missing asset types | Critical: <2 types, Warning: <3 types |
| `cost_basis_alert` | High unrealized gains/losses | Critical: >50% or <-30% |
| `fee_impact` | Transaction fees eating returns | Critical: >5%, Warning: >2% |

**Notes:**
- Insights are cached for 24 hours
- Costs 2.5 AI credits per request
- Available on all subscription tiers

---

## Reports

All report endpoints require JWT authentication and the `X-Account-Id` header.

### Generate Report

```http
POST /reports/generate
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "format": "pdf",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "categoryIds": ["category-uuid-1", "category-uuid-2"],
  "tagIds": ["tag-uuid-1"],
  "projectIds": ["project-uuid-1"],
  "currencyCode": "USD",
  "includeExpenses": true,
  "includeIncomes": true
}
```

**Format values**: `csv`, `pdf`, `excel`

**Response** `201 Created`
```json
{
  "reportId": "uuid",
  "status": "completed",
  "downloadUrl": "/reports/uuid/download",
  "fileName": "report-2025-01-01-2025-01-31.pdf",
  "fileSize": 102400
}
```

**Notes:**
- All formats (CSV, PDF, Excel) are available on all subscription tiers
- Accounts with `encryptionTier >= 2` will receive a `403 Forbidden` response
- `categoryIds`, `tagIds`, `projectIds`, `currencyCode`, `includeExpenses`, and `includeIncomes` are all optional filters

### List Reports

```http
GET /reports
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "reports": [
    {
      "id": "uuid",
      "format": "pdf",
      "status": "completed",
      "fileName": "report-2025-01-01-2025-01-31.pdf",
      "fileSize": 102400,
      "createdAt": "2025-02-01T08:00:00Z",
      "expiresAt": "2025-02-08T08:00:00Z"
    }
  ]
}
```

**Notes:**
- Returns the last 20 reports
- Reports expire after 7 days

### Download Report

```http
GET /reports/:id/download
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — Binary file

The response `Content-Type` depends on the report format:
| Format | Content-Type |
|--------|-------------|
| `csv` | `text/csv` |
| `pdf` | `application/pdf` |
| `excel` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

The response includes a `Content-Disposition: attachment; filename="<fileName>"` header.

### Monthly Digest

```http
GET /reports/monthly-digest?month=2025-01
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "digest": {
    "periodLabel": "January 2025",
    "totalIncome": 5000.00,
    "totalExpenses": 3200.00,
    "savingsRate": 36.0,
    "topCategories": [
      {
        "categoryId": "uuid",
        "name": "Groceries",
        "amount": 850.00,
        "percentage": 26.56
      },
      {
        "categoryId": "uuid",
        "name": "Rent",
        "amount": 1200.00,
        "percentage": 37.50
      }
    ],
    "incomeChange": 5.2,
    "expenseChange": -3.1
  },
  "generatedAt": "2025-02-01T08:00:00Z"
}
```

**Notes:**
- Available on all subscription tiers
- Results are cached for 7 days

### Get Report Preferences

```http
GET /reports/preferences
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "weeklyEmailEnabled": false,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

### Update Report Preferences

```http
PATCH /reports/preferences
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "weeklyEmailEnabled": true,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

**Response** `200 OK`
```json
{
  "weeklyEmailEnabled": true,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

**Notes:**
- `weeklyEmailDay` accepts values `0` (Sunday) through `6` (Saturday)
- `weeklyEmailEnabled` is available on all subscription tiers
- `monthlyDigestEnabled` is available on all subscription tiers

### Delete Report

```http
DELETE /reports/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Send Weekly Report Now

```http
POST /reports/trigger-weekly
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Runs the weekly e-mail report for the caller immediately. **Response** `200 OK` — `{ "success": true }`.

---

## Backups

All backup endpoints require JWT authentication and the `X-Account-Id` header.

### Export Backup

```http
POST /backups/export
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — JSON backup file containing all account data.
```json
{
  "version": "1.0",
  "exportedAt": "2025-02-15T12:00:00Z",
  "accountId": "account-uuid",
  "encrypted": false,
  "entityCounts": {
    "expenses": 245,
    "incomes": 24,
    "budgets": 5,
    "categories": 18,
    "tags": 12,
    "projects": 3,
    "wallets": 2,
    "transfers": 8,
    "currencyExchanges": 4
  },
  "data": {
    "expenses": [],
    "incomes": [],
    "budgets": [],
    "categories": [],
    "tags": [],
    "projects": [],
    "wallets": [],
    "transfers": [],
    "currencyExchanges": []
  }
}
```

**Notes:**
- Available on all subscription tiers
- The `data` arrays contain the full records for each entity type

### Restore Backup

```http
POST /backups/restore
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "data": "{\"version\":\"1.0\",\"exportedAt\":\"2025-02-15T12:00:00Z\",...}",
  "overwrite": false
}
```

**Response** `200 OK`
```json
{
  "restoredCounts": {
    "expenses": 245,
    "incomes": 24,
    "budgets": 5,
    "categories": 18,
    "tags": 12,
    "projects": 3,
    "wallets": 2,
    "transfers": 8,
    "currencyExchanges": 4
  },
  "errors": []
}
```

**Notes:**
- `data` is the JSON string of a previously exported backup
- When `overwrite` is `true`, existing account data is replaced entirely; when `false`, backup data is merged with existing records
- The `errors` array contains any entity-level errors encountered during restoration

### Backup History

```http
GET /backups/history
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "version": "1.0",
    "entityCounts": {
      "expenses": 245,
      "incomes": 24,
      "budgets": 5,
      "categories": 18,
      "tags": 12,
      "projects": 3,
      "wallets": 2,
      "transfers": 8,
      "currencyExchanges": 4
    },
    "encrypted": false,
    "fileSize": 524288,
    "createdAt": "2025-02-15T12:00:00Z"
  }
]
```

## Subscriptions and Billing

Our own Stripe billing (tiers Free / Pro / Business). Every route below is JWT-guarded except `redirect` and the webhook. Pricing and tier rules: `docs/wiki/features/subscription-pricing.md`, `docs/wiki/subscriptions.md`.

### List Plans

```http
GET /subscriptions/plans
Authorization: Bearer <token>
```

Prices in the caller's `user.currencyCode`. **Response** — `PlansResponse`: `{ "currency", "symbol", "plans": [ { "tier": "pro", "name", "monthly": { "amount", "display", "priceEnvKey" }, "yearly": { ... }, "monthlyEquivalent", "features": [] } ] }`.

### Get Current Subscription

```http
GET /subscriptions/current
Authorization: Bearer <token>
```

**Response** — `{ "id", "tier", "status", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "trialStart", "trialEnd" }`. The row is created on first read.

### Get Usage

```http
GET /subscriptions/usage
Authorization: Bearer <token>
```

**Response** — `{ "tier", "aiRequestsUsed", "aiRequestsLimit", "resetAt", "percentUsed", "isTrialing", "bonusAiRequests" }`.

### Create Checkout Session

```http
POST /subscriptions/checkout
Authorization: Bearer <token>
Content-Type: application/json

{ "priceId": "price_...", "successUrl": "https://api.ai-budget.pl/api/v1/subscriptions/redirect?target=budget://subscription/success", "cancelUrl": "https://api.ai-budget.pl/api/v1/subscriptions/redirect?target=budget://subscription/cancel" }
```

**Response** — `{ "sessionId", "url" }`.

### Create Billing Portal Session

```http
POST /subscriptions/portal
Authorization: Bearer <token>
Content-Type: application/json

{ "returnUrl": "https://..." }
```

**Response** — `{ "url" }`.

### Checkout Redirect

```http
GET /subscriptions/redirect?target=budget://subscription/success
```

Public. Stripe requires `https://` return URLs, so this redirects to the app deep link. Only `budget://subscription/success`, `budget://subscription/cancel` and `budget://subscription` are honoured; anything else redirects to `budget://subscription`.

### Stripe Webhook

```http
POST /webhooks/stripe
Stripe-Signature: t=...,v1=...
```

Excluded from `/api/v1`. Verified against the raw body (`400` on a missing or bad signature). Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_succeeded` and `invoice.payment_failed`; other events are a no-op. **Response** — `{ "received": true }`.

---

## Subscription Manager

The user's own recurring charges (Netflix, gym, …) — **not** our Stripe billing. JWT + account context. See `docs/wiki/features/subscription-manager.md`.

```http
GET /user-subscriptions
POST /user-subscriptions
PATCH /user-subscriptions/:id
DELETE /user-subscriptions/:id
```

Writes are viewer-blocked; `DELETE` returns `204`. Create body:
```json
{
  "name": "Netflix",
  "amount": 43.00,
  "currencyCode": "PLN",
  "billingCycle": "monthly",
  "nextRenewalDate": "2026-10-05",
  "categoryId": "uuid",
  "notes": "Family plan",
  "detectedFrom": "anomaly"
}
```

`billingCycle`: `weekly`, `monthly`, `quarterly`, `yearly`. `PATCH` accepts the same fields plus `isActive`; `categoryId: null` clears the category. A daily cron books each renewal as an expense and advances `nextRenewalDate` in one transaction.

---

## Usage Details

#### Get Usage Details

```
GET /subscriptions/usage/details?month=3&year=2026
```

Returns detailed AI usage breakdown for a specific month.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `month` | number | No | Month (1-12), defaults to current |
| `year` | number | No | Year, defaults to current |

**Response:**
```json
{
  "month": 3,
  "year": 2026,
  "totalCost": 24.5,
  "totalRequests": 15,
  "summary": [
    { "feature": "chat", "count": 8, "totalCost": 8.0 },
    { "feature": "story", "count": 2, "totalCost": 6.0 }
  ],
  "logs": [
    { "id": "uuid", "feature": "chat", "cost": 1.0, "date": "2026-03-15T10:30:00Z" }
  ]
}
```

---

## Referrals

All referral endpoints require JWT authentication. No `X-Account-Id` header needed.

### Get My Referral Code

```http
GET /referrals/my-code
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "code": "AB3XK7"
}
```

Generates a unique 6-character code on first call, returns existing code on subsequent calls.

### Get Referral Stats

```http
GET /referrals/stats
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "referralCode": "AB3XK7",
  "totalReferrals": 3,
  "qualifiedReferrals": 1,
  "pendingReferrals": 2,
  "bonusAiRequests": 30,
  "nextMilestone": {
    "count": 5,
    "reward": "free_pro_month"
  }
}
```

`nextMilestone` is `null` when all milestones are reached.

Milestones:
- 5 qualified referrals → `free_pro_month` (Stripe promo code sent via email)
- 10 qualified referrals → `ambassador_badge`

### Get Referral List

```http
GET /referrals/list
Authorization: Bearer <access_token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "referredName": "Jane Doe",
    "status": "qualified",
    "createdAt": "2026-03-28T10:00:00.000Z",
    "qualifiedAt": "2026-04-04T03:00:00.000Z"
  }
]
```

**Referral statuses:**
| Status | Description |
|---|---|
| `pending` | Registered, waiting 7 days + activity confirmation |
| `qualified` | Active user confirmed, +30 AI requests granted to referrer |
| `expired` | 30 days passed without qualification |

### Referral Code at Registration

Referral codes are applied during user registration via the optional `referralCode` field:

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "Jane Doe",
  "referralCode": "AB3XK7"
}
```

When a valid code is provided:
- A referral record is created with status `pending`
- The referred user's trial is extended by 7 days (14 days total)
- The referrer receives a push notification

---

## Alerts

Proactive anomaly alerts generated automatically on expense write events and after import commits. All endpoints require JWT + `X-Account-Id` header.

**Alert types:**
| Type | Description |
|------|-------------|
| `category_spike` | The category's current-calendar-month total (per currency) is ≥30% above the average of the previous ≥2 months |
| `price_increase` | A tracked subscription or `recurringId` series charged **>10%** more than before (same currency) |
| `duplicate_charge` | Same payee (merchant, or description when no merchant) + amount + currency within **±1 calendar day** (same-import-batch pairs excluded) |
| `recurring_suggestion` | 3+ same-amount charges from an untracked merchant on a regular cadence (monthly 25–35 d / weekly 6–8 d) — possible untracked subscription |
| `price_overcharge` | A receipt line costs more than this user's own median price for that product at that store (ABA-373, receipt price check). **Feed-only — never pushed** (`skipPush: true`); written only when `RECEIPT_CHECK_ALERTS_ENABLED=true` (see [ARCHITECTURE.md](./ARCHITECTURE.md#receipt-price-check)) |

**Generation:** Alerts are produced **fire-and-forget** on expense create (manual/voice/OCR and all bots, plus mobile sync) and after bank/Wise import commits. Each alert type uses a deterministic `dedupKey` (`@@unique([accountId, dedupKey])`) so the same event never produces duplicate rows.

**Push notifications:** sent via the `spending_anomaly` notification type, gated by the `anomalyAlerts` user preference (`GET/PATCH /users/me/notification-preferences`), capped at 3 pushes per account per calendar day. `price_overcharge` is the one exception — it is written to the feed but is never pushed, since a notification arriving after the user has left the store has nothing actionable in it.

### List Alerts

Returns the last 50 non-dismissed alerts for the account (newest first) plus the count of unread alerts.

```http
GET /alerts?unread=true
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unread` | boolean | When `true`, returns only alerts where `readAt` is null (optional) |

**Response** `200 OK`
```json
{
  "alerts": [
    {
      "id": "uuid",
      "accountId": "account-uuid",
      "userId": "user-uuid",
      "type": "category_spike",
      "params": {
        "categoryId": "category-uuid",
        "categoryName": "Food & Dining",
        "percent": 78
      },
      "expenseId": "expense-uuid",
      "categoryId": "category-uuid",
      "readAt": null,
      "dismissedAt": null,
      "createdAt": "2026-06-10T14:22:00Z"
    }
  ],
  "unreadCount": 3
}
```

**`params` shape by type:**
| Type | Key fields |
|------|-----------|
| `category_spike` | `categoryId`, `categoryName`, `percent` |
| `price_increase` | `merchant`, `oldAmount`, `newAmount`, `currencyCode`, `percent` |
| `duplicate_charge` | `merchant`, `amount`, `currencyCode`, `otherExpenseId` |
| `recurring_suggestion` | `merchant`, `amount`, `currencyCode`, `cycle` (`monthly` \| `weekly`) |
| `price_overcharge` | `merchant`, `currencyCode`, `totalAmount` (string, sum of this receipt's `findings`), `findings` (`ReceiptCheckFinding[]`, see [Scan Receipt](#scan-receipt)) |

### Price Check Summary

How much the receipt price check has **found** above the user's usual prices since the start of the current calendar year. Powers the Analytics tab's "Found X above your usual prices this year" line. Declared before the `:id` routes on this controller (same route-ordering rule as `bulk`/`read-all` elsewhere in this API).

```http
GET /alerts/price-check-summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "totalsByCurrency": { "PLN": 42.50, "EUR": 6.20 },
  "alertCount": 5,
  "since": "2026-01-01"
}
```

- **`totalsByCurrency`** — sum of `overpaidAmount` across every non-dismissed `price_overcharge` alert created this year, keyed by currency code. **A per-currency map on purpose, not one number**: this feature never converts between currencies anywhere, so a single blended total would require an FX conversion it deliberately doesn't do — adding a PLN total to an EUR total would misrepresent both.
- **`alertCount`** — the number of `price_overcharge` alerts counted (one per receipt; a receipt with several flagged lines still counts as one alert, since its `findings` array holds every line).
- **`since`** — the window start: always `YYYY-01-01` for the current UTC calendar year, never a rolling 365-day window.

Because `price_overcharge` alerts are only ever written when `RECEIPT_CHECK_ALERTS_ENABLED=true` (see [ARCHITECTURE.md](./ARCHITECTURE.md#receipt-price-check)), this endpoint returns `{ "totalsByCurrency": {}, "alertCount": 0, "since": "..." }` wherever that flag is off, even if receipts with findings were scanned — the findings still surface inline on the scan-confirmation screen and in the bot summary line regardless of the flag.

### Mark All Alerts Read

Marks all unread alerts in the account as read. **Viewer role blocked** (403).

```http
PATCH /alerts/read-all
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{ "updated": 3 }
```

### Mark One Alert Read

Marks a single alert as read. **Viewer role blocked** (403).

```http
PATCH /alerts/:id/read
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "readAt": "2026-06-10T15:00:00Z"
}
```

**Errors:**
- `404 Not Found` — Alert not found in this account

### Dismiss Alert

Soft-hides an alert (sets `dismissedAt`). Dismissed alerts are excluded from `GET /alerts`. **Viewer role blocked** (403).

```http
DELETE /alerts/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Errors:**
- `404 Not Found` — Alert not found in this account

### Notification Preferences

The `anomalyAlerts` field is part of the standard notification preferences object:

```http
GET /users/me/notification-preferences
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "budgetAlerts": true,
  "sharedActivity": true,
  "debtReminders": true,
  "recurringExpenses": true,
  "subscriptionRenewals": true,
  "anomalyAlerts": true,
  "trackingGap": true
}
```

```http
PATCH /users/me/notification-preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "anomalyAlerts": false
}
```

**Response** `200 OK` — updated preferences object.

**DTOs** (`packages/shared-types/src/dto/receipt-check.ts`): `ReceiptCheckFinding`, `PriceCheckSummary`.

---

## Price History

Personal Inflation Index — tracks how prices of individual grocery/receipt line items change over time, computed as a Laspeyres index. All endpoints require `Authorization: Bearer <token>` + `X-Account-Id` header. No tier guard — available on the free plan.

### Get Inflation Index

Returns a Laspeyres price index for the account's tracked products over the requested period. Cached in Redis under `ph:{accountId}:{period}` with a 300-second TTL.

```http
GET /price-history?period=3m
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | `3m` \| `6m` \| `12m` | `3m` | Comparison window |

**Response** `200 OK`
```json
{
  "period": "3m",
  "indexValue": 1.087,
  "inflationPercent": 8.7,
  "baseDate": "2026-04-01",
  "currentDate": "2026-07-01",
  "productCount": 24,
  "fxApproximate": false
}
```

### List Products

Returns the list of distinct canonical products tracked for the account, with their latest unit prices per store.

```http
GET /price-history/products
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "products": [
    {
      "canonicalName": "Milk 1L",
      "rawName": "MLEKO 1L ŁACIATE",
      "latestPrice": 3.49,
      "currencyCode": "PLN",
      "latestDate": "2026-06-28",
      "storeCount": 2,
      "storeLatestPrices": [
        { "store": "Biedronka", "price": 3.39, "date": "2026-06-20" },
        { "store": "Żabka",     "price": 3.49, "date": "2026-06-28" }
      ]
    }
  ]
}
```

### Upsert Product Alias

Maps a raw OCR product name to a canonical name (creates or updates the `product_aliases` row). **Viewer role blocked** (403).

```http
PATCH /price-history/products/alias
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rawName": "MLEKO 1L ŁACIATE",
  "canonicalName": "Milk 1L"
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "accountId": "account-uuid",
  "rawName": "MLEKO 1L ŁACIATE",
  "canonicalName": "Milk 1L",
  "createdAt": "2026-07-01T09:00:00Z",
  "updatedAt": "2026-07-01T09:00:00Z"
}
```

### Delete Product Alias

Removes a raw-name → canonical-name mapping from `product_aliases`. **Viewer role blocked** (403).

```http
DELETE /price-history/products/alias/:rawName
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Errors:**
- `404 Not Found` — Alias not found in this account

### Merge Product Variants

Renames all `ExpenseItem` rows and product aliases sharing a source canonical name to a target canonical name, consolidating price history. **Viewer role blocked** (403).

```http
POST /price-history/products/merge
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "sourceCanonicalName": "Milk 1L",
  "targetCanonicalName": "Whole Milk 1L"
}
```

**Response** `200 OK`
```json
{ "mergedItems": 14, "mergedAliases": 3 }
```

**DTOs** (`packages/shared-types/src/dto/price-history.ts`): `PriceHistoryResponse`, `PriceHistoryProduct`, `StoreLatestPrice`, `ProductListItem`, `UpsertAliasDto`, `MergeProductsDto`.

### Get Product Detail

```http
GET /price-history/products/:canonicalName/detail
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Full purchase history of one product, not limited by the inflation-index base/current window.

### Ignore a Product

```http
POST /price-history/products/ignore/:rawName
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked. Stops tracking a raw OCR name (e.g. a bag or a deposit line).

### Delete a Price Point

```http
DELETE /price-history/price-points/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked. Excludes one line item's price from tracking.

### Re-analyse Product Names with AI

```http
POST /price-history/products/backfill-ai
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked. Regenerates canonical names for single-word or missing entries; never overwrites a user alias. See `docs/wiki/features/personal-inflation-index.md`.

### Community Prices (Pro)

```http
GET /price-history/community?product=milk&region=PL-14&period=1w
GET /price-history/community/products?q=mil
GET /price-history/community/map?product=milk&region=PL-14&period=4w
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Pro**, and additionally behind `COMMUNITY_PRICE_READ_ENABLED`, which defaults **off** — the surface is dark in production. `period` is `1w` (default) or `4w`. Crowdsourced, k-anonymised prices from every account's receipt lines; the observation table holds no account, user or coordinates. See `docs/wiki/features/community-prices.md`.

---

## Shopping List

Shared, offline-first shopping lists, plus restock/deal suggestions and a Pro-gated "where's cheapest" basket comparison built on the receipt price-history corpus (ABA-330). All endpoints require JWT + `X-Account-Id` header (`JwtAuthGuard + AccountContextGuard`).

Lists and items are addressed by the **server PK or the mobile's local `clientId`** (resolved via `OR: [{ id }, { clientId }]`), so offline-first clients can act on rows they created before a sync round-trip. Item writes are collaborative — they are **not** `ViewerBlockGuard`-gated (viewers may check/add items); only `DELETE /shopping-list/:id` requires an editor or owner role.

### List Lists

```http
GET /shopping-list
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Returns all non-deleted lists for the account, each with its non-deleted `items`. A default list is lazily materialized when the account has no non-archived list; **archived lists are included** (so a cross-device archive stays distinguishable from a delete).

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "accountId": "account-uuid",
    "clientId": "default-account-uuid",
    "name": "My List",
    "isDefault": true,
    "isArchived": false,
    "sortOrder": 0,
    "createdByUserId": "user-uuid",
    "items": [
      {
        "id": "item-uuid",
        "shoppingListId": "uuid",
        "clientId": "client-item-uuid",
        "canonicalName": "Milk 1L",
        "rawLabel": "Milk",
        "quantity": 1,
        "note": null,
        "isChecked": false,
        "addedByUserId": "user-uuid",
        "sortOrder": 0
      }
    ]
  }
]
```

### Create List

```http
POST /shopping-list
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "clientId": "client-generated-uuid", "name": "Groceries" }
```

Idempotent on `clientId` — a repeated create returns the existing list (offline-retry safe).

**Response** `201 Created` — the created (or existing) list.

### Update List

```http
PATCH /shopping-list/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "name": "Weekly Groceries", "isArchived": false, "sortOrder": 1 }
```

`:id` may be the server PK or the local `clientId`. All body fields are optional.

### Delete List

```http
DELETE /shopping-list/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Soft-deletes the list and its items. **Viewer role blocked** (403, `ViewerBlockGuard`).

### Add Item

```http
POST /shopping-list/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-item-uuid",
  "rawLabel": "Milk",
  "canonicalName": "Milk 1L",
  "quantity": 1,
  "note": "2% only"
}
```

`:id` = list PK or `clientId`. Idempotent on the item `clientId` (revives a soft-deleted row). Collaborative — **not** viewer-blocked.

**Response** `201 Created` — the created item.

### Update Item

```http
PATCH /shopping-list/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "isChecked": true, "quantity": 2, "rawLabel": "Milk", "note": null, "sortOrder": 3 }
```

`:itemId` = item PK or `clientId`. All body fields optional. Collaborative — **not** viewer-blocked.

### Delete Item

```http
DELETE /shopping-list/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Soft-deletes the item. Collaborative — **not** viewer-blocked.

### Clear Checked Items

```http
POST /shopping-list/:id/clear-checked
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Soft-deletes all checked items on the list.

**Response** `200 OK`
```json
{ "cleared": 3 }
```

### Restock Suggestions

```http
GET /shopping-list/suggestions
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Free.** Predicts which products are due for a re-buy from receipt purchase history — `predictRestock` computes the median gap between purchases of each canonical product (needs ≥3 purchases) and returns items whose next buy is due/overdue, excluding products already on a list.

**Response** `200 OK`
```json
[
  {
    "canonicalName": "Milk 1L",
    "lastPurchase": "2026-06-20",
    "medianGapDays": 7,
    "dueInDays": -2,
    "purchaseCount": 9
  }
]
```

### Deals

```http
GET /shopping-list/deals
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Free.** Surfaces recent price drops — `detectDeals` flags a store whose recent unit price for a product is ≥15% below the product's 90-day average (within a 14-day window), excluding products already on a list.

**Response** `200 OK`
```json
[
  {
    "canonicalName": "Coffee 500g",
    "merchant": "Biedronka",
    "price": 18.99,
    "avgPrice": 23.50,
    "dropPct": 19,
    "currency": "PLN"
  }
]
```

### Basket Comparison (Pro)

```http
POST /price-history/basket
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "items": [
    { "canonicalName": "Milk 1L", "quantity": 2 },
    { "canonicalName": "Coffee 500g", "quantity": 1 }
  ],
  "lat": 52.2297,
  "lng": 21.0122
}
```

**Pro-gated** (`SubscriptionTierGuard` + `@RequireTier('pro')`; Business also passes). Prices the basket at every store the account has receipts from — `computeBasket` takes each store's latest unit price per product, gates the "cheapest" badge on coverage (full coverage, else the best store with ≥80% coverage), and flags stale prices. `lat`/`lng` are optional; when supplied (and not `0,0`), each store gets a `distanceKm` and a `nearby` flag via haversine, where the store coordinates come from the most-recent geo-tagged expense per merchant.

**Body Parameters**
| Field | Type | Description |
|-------|------|-------------|
| `items` | array | Required. 1–100 `{ canonicalName, quantity }` entries |
| `lat` | number | Optional. Origin latitude (−90…90) for per-store distance |
| `lng` | number | Optional. Origin longitude (−180…180) for per-store distance |

**Response** `200 OK`
```json
{
  "currency": "PLN",
  "stores": [
    {
      "merchantName": "Biedronka",
      "estimatedTotal": 41.37,
      "coveredItems": 2,
      "totalItems": 2,
      "missingItems": [],
      "hasStale": false,
      "isCheapest": true,
      "distanceKm": 1.3,
      "nearby": true,
      "lat": 52.231,
      "lng": 21.010
    }
  ],
  "perItemCheapest": [
    { "canonicalName": "Milk 1L", "cheapestStore": "Biedronka", "price": 3.39 }
  ],
  "missingEverywhere": []
}
```

**DTOs** (`packages/shared-types/src/dto/shopping-list.ts`, `.../price-history.ts`): `ShoppingList`, `ShoppingListItem`, `CreateShoppingListDto`, `UpdateShoppingListDto`, `CreateShoppingListItemDto`, `UpdateShoppingListItemDto`, `RestockSuggestion`, `DealSuggestion`, `BasketCompareRequestDto`, `BasketCompareResponse`.

### Templates ("my weekly staples")

Reusable item lists that can be poured into any list. JWT + account context; only `DELETE` is viewer-blocked (mirroring lists). Declared before the dynamic `:id` routes. Types: `packages/shared-types/src/dto/shopping-list.ts`.

```http
GET /shopping-list/templates
```
**Response** — `ShoppingListTemplate[]`: `{ "id", "accountId", "name", "sortOrder", "createdByUserId", "items": [ { "id", "templateId", "canonicalName", "rawLabel", "sortOrder" } ] }`.

```http
POST /shopping-list/templates
Content-Type: application/json

{ "name": "Weekly staples", "items": [ { "rawLabel": "Milk", "canonicalName": "milk" }, { "rawLabel": "Bread" } ] }
```
`name` up to 60 characters, 1–200 items.

```http
POST /shopping-list/templates/:templateId/apply
Content-Type: application/json

{ "listId": "uuid" }
```
**Response** — `{ "listId", "listName", "addedLabels": [], "skippedLabels": [] }` (items already on the list are skipped).

```http
PATCH /shopping-list/templates/:templateId
Content-Type: application/json

{ "name": "Saturday shop" }
```

```http
DELETE /shopping-list/templates/:templateId
```

### Guest Share Link

```http
POST /shopping-list/:id/guest-link
DELETE /shopping-list/:id/guest-link
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Viewer-blocked. `POST` returns `{ "token", "url" }` (idempotent — an existing link is returned); `DELETE` revokes it.

### Shopping-List Guest Page — unauthenticated

```http
GET /sl/:token
POST /sl/:token/items/:itemId/toggle
```

Excluded from `/api/v1` (the `sl/(.*)` wildcard). The page is server-rendered HTML (`Cache-Control: no-store`) showing the list name and its live items — no amounts, no member names; throttled 20/min per IP. `toggle` (30/min) flips one item's checked state — the item id is re-scoped to the token's list — and redirects `303` back to the page (Post/Redirect/Get). An unknown, revoked, archived or deleted list renders the same not-found page.

---

## Receipt Splitting

Lets the payer of a shared bill split it among people who don't have the app. Each participant gets a public, unauthenticated link (`https://ai-budget.pl/s/<token>` once the guest-link nginx block exists on the VPS — see `docs/ops/receipt-split-rollout.md`; `https://api.ai-budget.pl/s/<token>` until then) showing only their own share and a payment deep-link. The payer sees each participant's status (`sent` → `opened` → `claimed` → `settled`) and confirms once the money actually arrives, which settles the underlying debt through the same path a manual repayment takes.

The four endpoints below are payer-facing and require JWT + `X-Account-Id` (`JwtAuthGuard + AccountContextGuard`, class-level) plus `ViewerBlockGuard` + `TripArchivedGuard` on every route, **including the read** — a viewer cannot see the split any more than create one. The two guest endpoints that follow are **unauthenticated** — no `Authorization` header, no `X-Account-Id` — the only such surface in the app.

### Create Split

```http
POST /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "mode": "items",
  "participants": [
    { "name": "Anna", "itemIds": ["item-uuid-1"] },
    { "name": "Marek", "itemIds": ["item-uuid-2", "item-uuid-3"] }
  ]
}
```

`:id` = expense server PK or the mobile's local `clientId`. `mode: "items"` assigns line items to participants (any item left unassigned stays with the payer; a line claimed by several participants is divided between them; an optional per-participant `itemShareBp` map — `{ "<itemId>": 6000 }` = 60%, in basis points — sets an explicit share of a line, the remainder staying with the payer); `mode: "equal"` divides the whole bill evenly among the payer plus every participant (`itemIds` is ignored in this mode). 1–20 participants, each name 1–60 characters, trimmed. **Idempotent**: a second call for an expense that already has a live split returns that existing split instead of minting a second set of tokens/rows. Rejected with `400` for a fully end-to-end encrypted (tier-2) account — the server cannot read encrypted line items to render a guest page.

Writes one `receipt_split_participants` row plus one `isDebt: true, isSplitReceivable: true` Expense per participant (the receivable) alongside the original receipt Expense (the outflow), all in a single transaction.

**Response** `200 OK`
```json
{
  "expenseId": "expense-uuid",
  "ownShare": 42.50,
  "currencyCode": "PLN",
  "participants": [
    {
      "id": "participant-uuid",
      "name": "Anna",
      "amount": 28.90,
      "currencyCode": "PLN",
      "status": "sent",
      "url": "https://api.ai-budget.pl/s/3f9a2b7c1e4d5a6b7c8d9e0f1a2b3c4d?lang=en",
      "flags": [],
      "itemIds": ["item-uuid-1"],
      "itemShareBp": {}
    }
  ],
  "groupUrl": "https://api.ai-budget.pl/s/g/9c1e...?lang=en"
}
```

`flags` are the participant's open disputes (see **Guest Flags an Item** below); `itemIds`/`itemShareBp` are payer-view only and never rendered on a guest page. `groupUrl` is the one QR-code link every participant can scan to pick their own name (`null` for splits created before it existed).

### Get Split

```http
GET /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Returns the live split's current state — same response shape as Create Split. Every `amount`/`ownShare` value is exactly what was computed at creation time; the client never re-derives it.

**404s when the expense has no split** — this is the normal state of every unsplit receipt, not an error condition.

### Confirm Participant Paid

```http
PATCH /expenses/:id/receipt-split/:participantId/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

The payer's own verification step, meaningful once a guest has marked their share `claimed`. Runs the exact same path a manual debt repayment takes (`DebtsService.recordRepayment`), guarded by an atomic `settledAt IS NULL` claim so a double-tap or client retry can never record two repayments. `400` if the split was cancelled, this participant is already settled, or the participant has no linked debt row.

**Response** `200 OK`
```json
{
  "id": "participant-uuid",
  "name": "Anna",
  "amount": 28.90,
  "currencyCode": "PLN",
  "status": "settled",
  "url": "https://api.ai-budget.pl/s/3f9a2b7c1e4d5a6b7c8d9e0f1a2b3c4d?lang=en"
}
```

### Cancel Split

```http
DELETE /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Soft-deletes every participant's linked receivable Expense and expires all of that split's guest links immediately. Unlike a split that merely aged past its 30-day `expiresAt` with debts still outstanding, a cancelled split is fully inert: a later `POST .../receipt-split` on the same expense starts a brand-new split rather than returning the dead one.

**Response** `200 OK`
```json
{ "success": true }
```

### Recent Participants

```http
GET /expenses/receipt-split/recent-participants?limit=8
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Distinct names this account has split with, most recent first (the suggestion chips). `limit` defaults to 8, max 20. **Response** — `{ "names": ["Anna", "Marek"] }`.

### Resolve a Dispute Flag

```http
PATCH /expenses/:id/receipt-split/flags/:flagId/resolve
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Marks one of a guest's open flags (see **Guest Flags an Item**) as dealt with.

### Reassign a Line

```http
PATCH /expenses/:id/receipt-split/items/:itemId/reassign
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "participantIds": ["participant-uuid-1", "participant-uuid-2"] }
```

Reassigns ONE line's claimants among the split's **existing** participants (never adds or removes a person, never touches another line; up to 20 ids, an empty list leaves the line with the payer) and auto-resolves every open flag on that line. `400` once any participant has claimed or settled — cancel and recreate instead. Returns the updated split state.

### Guest Page — unauthenticated

```http
GET /s/:token
```

No `Authorization` header, no `X-Account-Id` — this route is excluded from the `/api/v1` prefix entirely (see `main.ts`). Renders a server-side HTML page (`Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`) showing only that one participant's name, amount, assigned items (if any), the payer's name, and **one payment block per method** the payer has on file — resolved fresh on every request (never cached from link-creation time, so setting or changing this after a link was already sent still updates it): the payer's `paymentMethods` list (see **Replace Payment Methods** above) first, and only when that list is empty, the legacy single `paymentMethod`/`paymentHandle` pair, and only when that pair is also unset, their trip-wallet `AccountMember`-level payment info for the account the bill belongs to. Each resolved method renders as a tappable pay button (`revolut`, `paypal`), a BLIK instructions box, or nothing (`cash`, `other`); no method at all renders a plain "no payment info" line. An unknown token, an expired token, and a cancelled token all render an **identical** "link not found or expired" page — same status code, same body, same length — so neither a guest nor an attacker probing tokens can tell "never existed" apart from "used to exist." The first view stamps the participant `opened`. Page language resolves from `?lang=` (set server-side to the payer's own `user.language` when the link is built), then `Accept-Language`, then English — independent of the app's 9-locale i18n system.

**Throttled** 20 requests / 60s (per IP, `ThrottlerGuard` default tracker).

**Response** `200 OK` — HTML (guest page, or the not-found page if the token doesn't resolve).

### Guest Marks Paid — unauthenticated

```http
POST /s/:token/paid
```

Also excluded from `/api/v1`. The guest's one write action: flips their participant to `claimed` (idempotent — a repeat call is a no-op, never fires the notification twice) and pushes `split_payment_claimed` to the payer, then re-renders the same guest page reflecting the new status.

**Throttled** 10 requests / 60s (per IP).

**Response** `200 OK` — HTML (same guest page).

### Guest Views the Receipt Scan — unauthenticated

```http
GET /s/:token/receipt
```

The payer's receipt image or PDF, so a guest can check their lines against the paper. Throttled 20/min. `Content-Type` is sniffed from the bytes (never the stored MIME type; unrecognised bytes are refused) and sent with `X-Content-Type-Options: nosniff`. Unknown, expired and cancelled tokens — and a valid token whose expense has no scan — all `404`.

### Guest Flags an Item — unauthenticated

```http
POST /s/:token/flag
Content-Type: application/x-www-form-urlencoded

itemId=<item-uuid>&note=I+did+not+have+this
```

Throttled 10/min. Reports one line (or, without `itemId`, the whole share) as wrong; `note` up to 500 characters. `itemId` is clamped to the guest's own lines — anything else degrades to a whole-share report. At most one open flag per participant and line (a repeat updates the note and does not re-notify). Independent of paying. Re-renders the guest page.

### Group QR Link — unauthenticated

```http
GET /s/g/:groupToken
GET /s/g/:groupToken/:seq
```

Throttled 20/min, HTML, `no-store`. The shared QR code of a split opens a names-only picker; choosing a name opens a "Is this you?" confirm step (`:seq` is a position index, meaningful only under the secret `groupToken`) that leads to that participant's own guest page. Same indistinguishable not-found page for unknown, expired and cancelled tokens.

**DTOs** (`packages/shared-types/src/dto/receipt-split.ts`): `SplitParticipantInput`, `CreateSplitDto`, `SplitParticipantStatus`, `SplitParticipantFlag`, `SplitParticipantState`, `SplitStateResponse`, `ReassignSplitItemInput`, `RecentSplitParticipantsResponse`. Feature pages: `docs/wiki/features/receipt-split.md`, `docs/wiki/features/receipt-split-item-shares.md`.

---

## Debts

JWT + account context. Individual debts are ordinary expenses/incomes with `isDebt: true` (lent = expense, borrowed = income); repayments are linked incomes/expenses.

### Get Debt Summary

```http
GET /debts/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — `DebtSummaryResponse` (`packages/shared-types/src/dto/debt.ts`): `{ "lent": DebtSummary[], "borrowed": DebtSummary[], "totals": { "totalLent", "totalBorrowed", "totalLentRemaining", "totalBorrowedRemaining", "currencyCode" } }`.

---

## Purchase Requests

Group purchase approval for shared accounts. JWT + account context. Voting is open to viewers, so `vote` is deliberately **not** viewer-blocked. Details: `docs/wiki/features/purchase-requests.md`.

```http
GET /purchase-requests?status=PENDING
GET /purchase-requests/pending-count
GET /purchase-requests/:id
```

`status`: `PENDING`, `APPROVED`, `REJECTED`, `PURCHASED`, `EXPIRED`.

```http
POST /purchase-requests
Content-Type: application/json

{ "title": "New stroller", "amount": 1200, "currency": "PLN", "description": "...", "categoryId": "uuid", "merchant": "...", "imageUrl": "https://...", "expiresAt": "2026-10-10T00:00:00Z" }
```
Viewer-blocked. The account's approval rule is copied onto the request at creation.

```http
POST /purchase-requests/:id/vote
Content-Type: application/json

{ "vote": "APPROVE", "comment": "Go for it" }
```
`vote`: `APPROVE`, `REJECT`, `ABSTAIN`.

```http
PATCH /purchase-requests/:id
POST /purchase-requests/:id/convert
POST /purchase-requests/:id/mark-purchased
DELETE /purchase-requests/:id
PATCH /purchase-requests/settings/approval-rule
```

`PATCH /:id` (title, amount, currency, description, merchant, imageUrl), `convert` (creates a planned expense — never counted as spend) and `mark-purchased` are viewer-blocked. `DELETE` cancels; only the creator or an account owner may (`403` otherwise). `approval-rule` is viewer-blocked and takes `{ "rule": "MAJORITY" | "UNANIMOUS" | "OWNER_ONLY" }`.

---

## Family Feed

Activity feed and reactions for shared accounts. JWT + account context. See `docs/wiki/features/family-feed.md`.

```http
GET /family-feed?limit=100
```
`limit` clamped to 1–100. **Response** — `FeedGroup[]` (`packages/shared-types/src/entities/family-feed.ts`): grouped expense/income activity per member per day plus purchase-request events, with reactions.

```http
POST /family-feed/:eventId/react
Content-Type: application/json

{ "emoji": "👍" }
```
`emoji` must be one of the allowed set (`ALLOWED_EMOJIS`). `DELETE /family-feed/:eventId/react` removes the caller's reaction (`204`).

---

## Encryption

End-to-end encryption key management. All routes are JWT-guarded; the per-account routes also use account context, and `enable`, `grant-key`, `pending-grants` and `rotate-key` require the `owner` role (`AccountRoleGuard`). Full protocol and request bodies: [ENCRYPTION.md](ENCRYPTION.md).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/encryption/setup` | Create/update the caller's encryption profile |
| `GET` | `/encryption/profile` | Fetch the profile (new-device login) |
| `DELETE` | `/encryption/profile` | Reset the profile |
| `POST` | `/encryption/account/:accountId/enable` | Enable E2EE for an account (owner) |
| `GET` | `/encryption/account/:accountId/key` | Caller's wrapped account key |
| `GET` | `/encryption/account/:accountId/status` | Tier, key version, rotation needed |
| `POST` | `/encryption/account/:accountId/grant-key` | Grant the key to a new member (owner) |
| `GET` | `/encryption/account/:accountId/pending-grants` | Members awaiting a key grant (owner) |
| `POST` | `/encryption/account/:accountId/rotate-key` | Rotate the account key (owner) |
| `GET` | `/encryption/members/:accountId/public-keys` | Members' public X25519 keys |
| `POST` | `/encryption/recovery/setup` | Store the recovery-key hash and wrapped master key |
| `POST` | `/encryption/recovery/recover` | Recover with the recovery key (rate-limited in Redis, 5 per 15 min per e-mail) |

---

## Telemetry

First-party product-usage events from the **web build only**. See `docs/wiki/features/web-telemetry.md`.

```http
POST /telemetry/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "platform": "web",
  "sessionId": "random-session-id",
  "events": [
    { "name": "screen_view", "screen": "/(tabs)/expenses", "ts": 1790000000000 },
    { "name": "action", "screen": "/expense/new", "props": { "flow": "add_expense", "status": "completed" } }
  ]
}
```

JWT, throttled 30/min. `name`: `session_start`, `screen_view`, `action`; `screen` is the route **pattern**, never a resolved path. At most 200 events per request pass the pipe and 40 per batch are kept. **Response** `204 No Content` regardless of how many events survived validation — the client never retries.

---

## App Versions

### Check for Updates

```http
GET /app-versions/check?platform=android&version=1.25.0
```

Public (called before login). **Response** — `{ "latestVersion", "minSupportedVersion", "isUpdateAvailable", "isUpdateRequired", "releaseNotes": { "en": "..." } | null, "storeUrl" }`. The latest row per platform is the most recently published one.

Admin CRUD lives under `/admin/app-versions` (see [Admin](#admin)).

---

## Health

```http
GET /health
GET /health/ai
```

Public. `/health` runs `SELECT 1` and returns `{ "status": "ok", "db": "ok", "uptimeSeconds", "timestamp" }`, or `503` with `status: "degraded"`; it is what the Docker `HEALTHCHECK`, the deploy verify step and `uptime-check.yml` poll. It never touches an application table, so a missing migration does not show up here. `/health/ai` checks the OpenAI key — `{ "status": "ok", "openai": "ok", "timestamp" }`, `503` when unconfigured or when the provider call fails.

---

## Admin

Every route below requires JWT + `AdminGuard` (the caller's e-mail must be listed in `ADMIN_EMAILS`); used by the Next.js admin dashboard. See `docs/wiki/admin-dashboard.md` and `docs/wiki/features/admin-revenue-metrics.md`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/dashboard` | KPI cards, charts, live-activity seed |
| `GET` | `/admin/metrics/investor` | Investor metrics (MRR, churn, cohorts; Redis-cached) |
| `GET` | `/admin/users` | Paginated users (`page`, `limit`, `search`, `tier`, `billing`, `isActive`, `sortBy` = `name`/`email`/`createdAt`/`lastSyncAt`, `order`) |
| `GET` | `/admin/users/:id` | User detail |
| `PATCH` | `/admin/users/:id` | Update a user |
| `PATCH` | `/admin/users/:id/subscription` | Change tier (a comp — no Stripe id) |
| `PATCH` | `/admin/users/:id/ai-limit` | Set a custom monthly AI limit |
| `DELETE` | `/admin/users/:id` | Deactivate or delete |
| `POST` | `/admin/notifications/push` | Push to one user |
| `POST` | `/admin/notifications/email` | E-mail one user |
| `POST` | `/admin/notifications/broadcast` | Push/e-mail to a filtered audience |
| `GET` | `/admin/notifications/history` | Delivery history |
| `POST` | `/admin/notifications/schedule` | Schedule a notification |
| `GET` | `/admin/notifications/scheduled` | List scheduled notifications |
| `DELETE` | `/admin/notifications/scheduled/:id` | Cancel a scheduled notification |
| `GET` | `/admin/analytics/overview` | Analytics overview |
| `GET` | `/admin/analytics/ai-usage` | AI usage and cost trends |
| `GET` | `/admin/analytics/subscriptions` | Subscription stats |
| `GET` | `/admin/analytics/acquisition` | Acquisition breakdown by source |
| `GET` | `/admin/telemetry/funnel?days=30` | Web telemetry funnel (`flows`, `screens`, `lastScreens`) |
| `GET` | `/admin/audit-log` | Admin audit log |
| `GET` / `PATCH` | `/admin/config` | Runtime config |
| `GET` | `/admin/system/health` | System health |
| `GET` | `/admin/referrals/stats` | Referral stats |
| `GET` | `/admin/referrals` | Referral list |
| `GET` / `POST` | `/admin/app-versions` | List / publish app versions (`platform`, `latestVersion`, `minSupportedVersion`, `releaseNotes`, `storeUrl`, `publishedAt`) |
| `PATCH` / `DELETE` | `/admin/app-versions/:id` | Edit / delete a release |

Real-time events are pushed over Socket.io namespace `/admin` (`new_user`, `ai_request`, `error`, `subscription_change`).

## Error Responses

### Error Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "amount",
      "message": "Amount must be a positive number"
    }
  ]
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Invalid or expired token |
| `403` | Forbidden - Insufficient permissions or wrong account role |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Sync version mismatch |
| `422` | Unprocessable Entity - Validation error |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

### Rate Limits

- Authentication endpoints: 10 requests/minute
- AI endpoints: 30 requests/minute
- Other endpoints: 100 requests/minute
