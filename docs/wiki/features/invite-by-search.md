# Inviting an existing user by search

*Hub: [auth](../auth.md)*

## What this is

An account owner can find an already-registered user by name or email and invite them directly —
delivered as a push, accepted in-app — alongside the older link, code and email invitations.

## Entry points

- `GET /users/search?q=` — `users.controller.ts` / `UsersService.search`
- `AccountsService.createInvitation` (with `invitedUserId`), `getMyInvitations`,
  `respondToInvitation`; endpoints `GET /accounts/invitations/mine`,
  `PATCH /accounts/invitations/:id/respond` (`{ action: 'accept' | 'decline' }`)
- `AccountInvitation.invitedUserId` — a plain field, no Prisma relation
- Mobile: `src/stores/invitationStore.ts`; the Invitations tab of `app/alerts/index.tsx`
  (`?tab=invitations`); the "Find user" mode of `app/account/invite.tsx`; the push handler in
  `src/services/notifications.ts`

## Key concepts

**Search** matches name or email case-insensitively, needs at least 2 characters, returns at most
20, excludes the requester and deactivated users, and returns only `{id, name, email}`. It is
throttled to 20 requests a minute per caller.

**"My invitations"** is every pending invitation where `invitedUserId` is me **or** `invitedEmail`
is my email — so an ordinary email invite to a registered address shows up here too.

**Delivery is a push, not an email** — `account_invitation`, which is always sent and has no
per-type preference toggle: it is a one-off request for action, not a recurring alert.

## Invariants

**`respondToInvitation` checks the invitation is addressed to the caller before anything else.**
Without that, a guessed invitation id could be accepted by anyone.

**It enforces `expiresAt` itself.** Search invitations have no cron to expire them, so without the
check here a past-expiry invitation stays acceptable forever.

**`getMyInvitations` returns `[]` when the user row is missing**, before building the `OR`. With a
stale JWT, `me.email` is `undefined`, Prisma silently drops that clause, and the remaining filter
matched every pending invitation in the system.

**The bell badge is `unreadCount + invitations.length`**, and `loadInvitations()` runs beside
`loadAlerts()` in both of `useHomeScreenData`'s load paths (focus and pull-to-refresh), so the badge
is right before the Alerts screen is ever opened. Do not reintroduce a badge that reads only the
alert store.

**Accept and decline are optimistic with rollback**, the `purchaseRequestStore` pattern.

## Known gaps

- Search reveals whether an email is registered to any signed-in user, bounded only by the
  throttle.

## History

ABA-309.
