# Invite Existing User by Search — Design Spec

## Problem

Inviting someone into a shared account (including a Group Trip Wallet trip) currently only works by email or by sharing an invite code/link. If the invitee already has the app installed, this is needlessly slow: they have to receive an email (or be handed a code), open it, then manually enter the code in `account/join.tsx`. There is also no in-app surface at all for a pending invitation — a registered user has no way to discover or act on an invitation except by digging up the code.

## Goal

Let an account owner search for an already-registered user by name/email and invite them directly. The invitee gets a push notification and can accept or decline from a new "My Invitations" section on the existing Alerts screen — no code, no email required.

## Data Model

`AccountInvitation` gets one new nullable field:

- `invitedUserId String?` — FK to `User`, set only when the invitation was created via search (as opposed to the existing `invitedEmail`-only flow).

"My Invitations" (the invitee's view) is any `AccountInvitation` with `status = 'pending'` where `invitedUserId = currentUserId` OR `invitedEmail = currentUser.email`. This deliberately folds in *existing* email-based invitations too, when the typed email happens to match a registered user — same underlying mechanism (a registered person has a pending invite), not a separate feature.

## API Changes

- **`GET /users/search?q=<term>`** (`JwtAuthGuard` only, not account-scoped): case-insensitive substring match on name/email across all users, excludes the requester, capped at 20 results. Requires `q` to be at least 2 characters (shorter queries return an empty list without hitting the DB — avoids a near-full-table scan on every keystroke). Returns `{id, name, email}[]` only — the same fields a fellow account member already sees about you. Rate-limited via the existing `RedisThrottlerStorage` to prevent bulk scraping.
- **`CreateInvitationDto`** gains an optional `invitedUserId` (mutually exclusive with `email`). When set: `AccountsService.createInvitation` validates the user isn't already a member (same check already done for the email path), creates the `AccountInvitation` with `invitedUserId`, and sends a **push** (not an email) via `NotificationsService.sendToUser(invitedUserId, 'account_invitation', {...})`. Still requires the caller to be `owner` (same `validateAccess` as today).
- **`GET /accounts/invitations/mine`**: the current user's pending invitations (matched as above), joined with inviter name + account name + role offered, for display. No pagination in v1 — a user is expected to have at most a handful of pending invitations at once.
- **`PATCH /accounts/invitations/:id/respond`** with `{ action: 'accept' | 'decline' }`: verifies the invitation actually belongs to the responding user (`invitedUserId === userId` OR `invitedEmail === user.email`) before doing anything — otherwise an invitation id could be guessed and hijacked. Accept reuses the existing `acceptInvitation` membership-creation logic; decline sets `status = 'declined'`.
- New `NotificationType = 'account_invitation'`. Always sent, no preference toggle (unlike most notification types) — this is a direct, one-off action request, not a recurring background alert, so gating it behind a settings toggle risks a user never seeing an invitation at all. Deep-links to `/alerts`.

## Mobile: "My Invitations" on the Alerts Screen

`app/alerts/index.tsx` gains a tab/segment control: **Alerts** (existing, per-account anomaly alerts) | **Invitations** (new, per-user, not account-scoped). The bell icon's unread badge becomes the sum of unread anomaly alerts + pending invitations. The `account_invitation` push deep-link opens `/alerts` with a param that selects the Invitations tab directly (same pattern as the existing `chat_mention` deep-link selecting the chat tab).

New `invitationStore.ts` (server-only, in-memory — mirrors `purchaseRequestStore`'s convention, since responding needs cross-device consistency). New `InvitationCard` component: shows account name, inviter name, offered role, and **Accept**/**Decline** buttons — a new interaction pattern for this screen (today's alert cards are tap-to-navigate or dismiss-only). Accept calls `respondToInvitation(id, 'accept')`, reloads the account list, and removes the card; decline calls `respondToInvitation(id, 'decline')` and removes the card, with no notification back to the inviter (mirrors `cancelInvitation` today).

## Mobile: Search UI in `account/invite.tsx`

The existing two-mode toggle (Link / Email) gets a third mode: **Find user**. A debounced (~300ms) search input calls `GET /users/search`; results render as tappable rows (name + email). Tapping a result reveals the existing role picker (editor/viewer) below it, then a submit button creates the invitation via `invitedUserId`. On success, the screen shows a confirmation state without an invite code (there is nothing to share — the invitation already reached the person via push).

If the selected user turns out to already be a member, the server rejects with a clear error (`ConflictException`, same as today's email path) rather than the client pre-filtering search results against account membership — keeps the search endpoint a simple, reusable, account-agnostic primitive.

## Security Notes

- `GET /users/search` is rate-limited and returns only name/email — no additional PII.
- Creating a search-based invitation still requires `owner` role on the target account.
- Responding to an invitation is only permitted when it is actually addressed to the responder (`invitedUserId` or `invitedEmail` match) — closes an IDOR-shaped hole where an invitation id could otherwise be guessed and accepted/declined by an unrelated user.

## Out of Scope

- Notifying the inviter when an invitation is declined.
- Any change to the existing email/link invite flow's behavior for invitees who do *not* have an account yet.
- Per-type notification preference toggle for `account_invitation` (deliberately always-on, per design discussion above).
