# Public API: one connection, several accounts

Status: draft for approval · 2026-11-02 · follows [Public API phase 1](2026-11-01-public-api-design.md) (ABA-707)

## Intent

Phase 1 binds an OAuth connection to exactly one AI Budget account. The first real consumer,
AI Accounting (eksiegowyai.pl), needs to see a user's **company** money and **private** money side by
side and keep them strictly apart. In AI Budget those already live in different accounts (a
`business` account for the JDG or the spółka, a `personal` one, often a `shared` family one).
The product owner wants the choice made once, on the consent screen: the user ticks the accounts to
connect and grants access in one step, not by repeating the connect flow per account.

This is the "multi-account grants" item phase 1 deferred. It is a prerequisite for the AI Accounting
integration (`D:\Work\micode\accounting-ai-agent\docs\superpowers\specs\2026-11-02-ai-budget-integration-design.md`).

## Goals

- The consent screen lets the user pick **one or more** accounts (checkboxes), phone and desktop web.
- One access/refresh token pair covers every account in the connection.
- A third party can list the connected accounts, with each account's **type** (`personal`,
  `business`, `shared`, `trip`, `investment`), name, base currency and what it may do there
  (read-only or read-write). The type is what lets AI Accounting label an account "company" or
  "private" automatically.
- Every existing account-scoped endpoint (expenses, categories, changes feed, receipt) is addressed
  to one specific account of the connection.
- The user sees, in Connected apps, which accounts each app can reach, and can remove one account
  from a connection without disconnecting the app.

## Non-goals

- Cross-account endpoints (one call returning several accounts' expenses merged). The integrator
  calls once per account; merging is their job and keeps company and private data from mixing by
  accident.
- Incomes, budgets, goals: still later phases.
- Any change to scopes. Scopes stay per connection, not per account.

## Anti-goals (failure even if it works)

- A request that does not say which account it means silently landing in some account the user did
  not expect. When a connection has more than one account, an unaddressed account-scoped request is
  an error, never a guess.
- Any path by which the connection reaches an account the user did not tick, or keeps reaching one
  the user has since been demoted in (viewer) or removed from.
- Breaking the phase 1 contract for a single-account connection.

## Constraints carried from phase 1 (unchanged)

- Only accounts where the user is **owner or editor** can be connected; the role is rechecked on
  every request, **per account**.
- Encryption tier ≥ 2 accounts cannot be connected (not selectable, shown disabled with the reason);
  tier 1 accounts are **read-only** with the tier-1 fields nulled.
- Archived trips follow phase 1 behaviour.
- `PUBLIC_API_ENABLED` still gates everything.

## Decided shape

These are the product owner's decisions:

- Multi-select on the consent screen, one grant step.
- Account type is exposed so the consumer can label company vs private.

These are my calls (the builder may revisit them if the code argues otherwise):

1. **Data model.** A grant owns a set of accounts: a join table (grant ↔ account), with the
   phase 1 `OAuthGrant.accountId` migrated into it. Phase 1's partial unique index on an active
   grant per (client, user, account) becomes one active grant per (client, user). Production holds no
   grants yet (the flag went on 2026-11-02 and no app is registered), but the migration must still be
   correct for existing rows.
2. **Addressing.** Account-scoped endpoints take the account in the `X-Account-Id` header (the same
   header the app's own API uses). With exactly one account in the connection the header is optional
   (phase 1 behaviour preserved); with more than one, a missing header is `400 account_required`.
   An account id not in the connection, or one where the role recheck fails, is
   `403 account_not_granted` / `403 grant_inactive` respectively. These go through the existing
   public error envelope and are documented in Swagger and the guide.
3. **Listing.** `GET /public/v1/accounts` (token-only, like `/account`) returns the connection's
   accounts: id, name, type, base currency, `access: read | read_write` (tier-1 accounts and the
   integrator's scopes decide it), and `active` (false when the grantor's role no longer qualifies).
   `GET /public/v1/account` stays for compatibility and describes the account the request
   addresses.
4. **Re-consent** for an app that already has a connection opens the consent screen with the
   currently connected accounts pre-ticked; granting replaces the set. Removing an account there or in
   Connected apps cuts that account off immediately. Tokens stay valid for the remaining accounts.
5. **Rate limits** stay per connection and per client. A multi-account connection is one bucket.
6. **Idempotency keys** are scoped per account as well as per client.
7. **The "new app connected" e-mail** lists the accounts granted. Adding accounts by re-consent
   counts as a new connection event for the once-a-day dedupe.
8. **Consent default.** Nothing is pre-ticked on a first connection, unless the user has exactly one
   eligible account, which is then pre-ticked. The grant button is disabled until at least one account
   is ticked. Each row shows the account name, type and a read-only badge for tier 1.

9. **Co-owners see only their own accounts.** Phase 1 lets every owner/editor of an account see and
   disconnect apps connected to it. With multi-account grants:
   - A co-owner of a shared account sees the connection in their Connected apps, with the grantor's
     name, but only the accounts of that grant they are themselves a member of. The grant's other
     accounts (for example the grantor's personal one) are never named to them.
   - A co-owner's "Disconnect" removes only those accounts from the grant. Only the grantor revokes
     the whole connection.
   - The "new app connected" e-mail to an owner lists only the accounts that owner is a member of.
   - A grant whose last account is removed is revoked.
10. **Token response.** `/oauth/token` always returns `account_ids` (array). `account_id` stays only
    when the connection has exactly one account, for phase 1 compatibility. A refresh fails with
    `invalid_grant` when no account of the connection is active any more. Until then it succeeds,
    and inactive accounts show up in `/accounts`.
11. **Header rule counts granted accounts, not usable ones.**
    - When the grant holds two accounts and one is inactive, the header is still required.
    - When the grant shrinks to one account (removal or re-consent), the header becomes optional
      again.
    - `GET /account` without a header on a multi-account connection is `400 account_required`.
12. **Connection-level vs account-level checks.**
    - Token, client, scopes and rate limits are checked per connection.
    - Role, encryption tier and archive/deleted state are checked per addressed account.
    - `/accounts` always succeeds for a live token and lists every granted account, with
      `active: false` and a reason (`role`, `encrypted`, `archived`) where it applies.
    - Addressing an account that reached tier ≥ 2 after it was connected is `403 account_encrypted`.
      Requests to the other accounts are unaffected.
    - A deleted account drops out of the grant by cascade.
13. **Migration** merges any existing active grants of the same (client, user) into one, keeping the
    union of accounts and scopes and revoking the tokens of the merged-away grants. Production has
    none today.

## What the builder decides

- Exact migration and index names, the shape of the join table and its cascade rules.
- How the guard resolves the addressed account (one query or two), as long as the per-request
  role recheck covers the addressed account.
- The Connected apps UI details for the per-account list and remove, on phone and desktop web (≥1024),
  within the existing settings design language.
- Test layout. The phase 1 e2e spec should gain a two-account flow: grant two accounts, address
  each, fail without the header, demote in one, remove one.

## Documentation

- Swagger and the guides in English, Polish and Russian: the header, the new errors, `/accounts`.
- Wiki `features/public-api.md`: the multi-account model and its invariants.
- User help `45-connected-apps` in all nine locales: picking several accounts, removing one.
