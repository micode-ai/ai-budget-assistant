# Getting started

The AI Budget API lets your app read and write a user's expenses — with the user's permission, through OAuth 2.0. This guide takes you from registering an app to keeping a synchronised copy of the expenses. The reference below documents every endpoint, field and error.

- API base URL: `https://api.ai-budget.pl/public/v1`
- Authorize URL: `https://app.ai-budget.pl/authorize`
- Token URL: `https://api.ai-budget.pl/oauth/token`
- JSON fields are `snake_case`. Amounts are decimal **strings** (`"42.50"`), dates are `YYYY-MM-DD`, timestamps are ISO-8601 in UTC.

## 1. Register an app

In the AI Budget app open **Settings → Developers** and create an app. Give it a name, a homepage and one or more **redirect URIs**. A redirect URI must use `https://`; for development `http://localhost[:port]` and `http://127.0.0.1[:port]` are allowed too. The URI you send later must match a registered one **exactly**, character for character.

Choose the client type:

- **Confidential** — your backend can keep a secret. You receive a `client_id` and a `client_secret`. The secret is shown only once: store it securely, and never put it in a browser or mobile app.
- **Public** — a single-page or mobile app. Only a `client_id`; PKCE alone protects the flow.

One developer can register up to 10 apps.

## 2. Send the user to the authorize URL

Every authorization request uses PKCE with `S256` (no other method is accepted). Generate a random `code_verifier`, send its SHA-256 as `code_challenge`, and keep the verifier until the user comes back. Also generate a random `state` and check it on return.

| Parameter | Value |
| --- | --- |
| `response_type` | `code` |
| `client_id` | your client id |
| `redirect_uri` | one of your registered redirect URIs, exactly |
| `scope` | space-separated: `expenses:read`, `expenses:write`, `receipts:read`, `categories:read`, `incomes:read`, `incomes:write`, `budgets:read`, `budgets:write`, `analytics:read` |
| `state` | a random value you check on return |
| `code_challenge` | base64url SHA-256 of the `code_verifier` (43 characters) |
| `code_challenge_method` | `S256` |

JavaScript for the browser (it redirects and uses `sessionStorage`; the PKCE part alone also runs in Node.js 20+):

```js
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const codeChallenge = base64url(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
);
const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
sessionStorage.setItem('aba_pkce', JSON.stringify({ codeVerifier, state }));

const url = new URL('https://app.ai-budget.pl/authorize');
url.search = new URLSearchParams({
  response_type: 'code',
  client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
  redirect_uri: 'https://example.com/oauth/callback',
  scope: 'expenses:read expenses:write receipts:read categories:read',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
}).toString();
window.location.assign(url);
```

The resulting URL looks like this:

```text
https://app.ai-budget.pl/authorize?response_type=code&client_id=aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg&redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fcallback&scope=expenses%3Aread+expenses%3Awrite+receipts%3Aread+categories%3Aread&state=af0ifjsldkj&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

The user signs in, chooses **one or more** accounts and approves the scopes. Then the browser returns to your redirect URI:

- approved: `https://example.com/oauth/callback?code=...&state=...`
- declined: `https://example.com/oauth/callback?error=access_denied&state=...`

Check that `state` is the one you sent before you use the code.

**One connection, one or more accounts.** The user ticks which accounts your app gets; the connection covers exactly those. Only an **owner** or an **editor** of an account can connect it. If the user who connected the app later loses edit rights to one account (becomes a viewer or leaves it), calls addressed to that account answer `403 grant_inactive` while the other accounts keep working; the account becomes usable again when someone with edit rights connects the app again.

## 3. Exchange the code for tokens

The code is valid for **10 minutes** and works **once** — a failed exchange burns it too. Send the same `redirect_uri` and the `code_verifier`:

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=authorization_code \
  -d code="$CODE" \
  -d redirect_uri=https://example.com/oauth/callback \
  -d code_verifier="$CODE_VERIFIER"
```

A public client sends no secret, only `client_id`:

```js
const { codeVerifier } = JSON.parse(sessionStorage.getItem('aba_pkce'));
const res = await fetch('https://api.ai-budget.pl/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: new URLSearchParams(location.search).get('code'),
    redirect_uri: 'https://example.com/oauth/callback',
    code_verifier: codeVerifier,
    client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
  }),
});
let tokens = await res.json();
```

Response:

```json
{
  "access_token": "aba_at_Hq7Wm2Ks9Lp4Nx1Vb6Cz3Rt8Yu5Ie0Oa2Sd7Fg4Jk9L",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "aba_rt_Pz4Xc8Vb2Nm6Lk0Jh3Gf7Ds1Aq5We9Rt2Yu6Io0Pa",
  "scope": "expenses:read expenses:write receipts:read categories:read",
  "account_ids": ["7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a"],
  "account_id": "7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a"
}
```

`account_ids` lists every account of the connection, in connection order. `account_id` appears **only** when the connection has exactly one account (kept for older integrations); read `account_ids`.

The **access token** lives **1 hour**. The **refresh token** is valid for **90 days**, and every refresh gives you a new one with a fresh 90 days. Store both securely, server-side where you can.

## 4. Call the API

Send the access token in the `Authorization` header:

```bash
curl "https://api.ai-budget.pl/public/v1/expenses?limit=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```js
const res = await fetch('https://api.ai-budget.pl/public/v1/expenses?limit=50', {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
const page = await res.json();
```

`GET /public/v1/account` tells you which account a call is about. With several accounts, say which one with the `X-Account-Id` header (see section 5). Lists are paginated with an opaque cursor: pass `next_cursor` back as `cursor`, with the same filters, while `has_more` is `true`.

## 5. Several accounts in one connection

The token response always carries `account_ids`. Ask for the details with `GET /public/v1/accounts`; it needs only a valid token, no `X-Account-Id` and no scope, and it always answers:

```json
{ "data": [{ "id": "...", "name": "Family", "type": "shared", "base_currency": "PLN", "access": "read_write", "active": true, "reason": null }] }
```

- `type` tells a company account (`business`) from a private one (`personal`, `shared`, `trip`, `investment`).
- `access` is `read_write` when the connection may write to the account, otherwise `read` (no `expenses:write` scope, or an end-to-end encrypted account with text encryption).
- `active: false` means requests addressed to this account are refused; `reason` says why: `role` (the user is no longer an owner or editor), `encrypted` (the account is now fully end-to-end encrypted) or `archived` (an archived trip: still active, read-only). With `role` because the user is no longer a member at all, `name`, `type` and `base_currency` are `null`.

**Choosing the account.** Send the id in the `X-Account-Id` header on every other call. With exactly **one** granted account the header is optional. With **more than one** it is required, and a call without it answers `400 account_required`, `GET /public/v1/account` included. The rule counts the accounts the user granted, not the usable ones: a connection of two accounts of which one is inactive still needs the header. An id that is not part of the connection answers `403 account_not_granted`; an account whose owner or editor right is gone answers `403 grant_inactive`; a newly encrypted one `403 account_encrypted`. The other accounts of the connection are not affected.

**Always send `X-Account-Id`, even with one account, and treat `account_ids` in every token response as authoritative.** Re-consent can **replace** the set: a connection that had one account can move to a different one, and a header-less request would then silently land in the new account. After every code exchange and refresh, re-read `account_ids` and keep your own account-to-data mapping in step with it.

**One call, one account.** There is no merged endpoint across accounts: to read several accounts, call once per account. Scopes and rate limits belong to the whole connection (one bucket for all its accounts), but `Idempotency-Key` values and the `/expenses/changes` cursors are scoped per account: the same key or cursor means something different on each one, so keep them per account.

**Changing the set.** When the user connects your app again, the consent screen pre-ticks the accounts already connected, and what they approve **replaces** the set. An account they untick is cut off on the next request, and the tokens keep working for the rest. A refresh answers `invalid_grant` only when **no** account of the connection is usable any more.

## 6. Refresh the access token

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=refresh_token \
  -d refresh_token="$REFRESH_TOKEN"
```

**Refresh tokens rotate.** Every refresh returns a **new** refresh token, and the one you sent stops working. Always store the new one, replacing the old one, before you do anything else.

Presenting a refresh token that was already used is treated as theft: the whole connection is revoked and the user has to connect your app again. This also happens when **two workers refresh at the same time** with the same token — one wins, the other reuses a spent token. Refresh from **one place only** (one process, a lock, or a single in-flight request):

```js
let refreshing = null;

function refreshTokens() {
  refreshing ??= (async () => {
    const res = await fetch('https://api.ai-budget.pl/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
      }),
    });
    if (!res.ok) throw new Error('reconnect');
    tokens = await res.json();
    await saveTokens(tokens);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function api(path, init = {}) {
  const call = () =>
    fetch(`https://api.ai-budget.pl${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${tokens.access_token}` },
    });
  let res = await call();
  if (res.status === 401) {
    await refreshTokens();
    res = await call();
  }
  return res;
}
```

To disconnect, send either token to `POST https://api.ai-budget.pl/oauth/revoke`; the whole connection is revoked. The user can also disconnect your app at any time in **Settings → Connected apps**.

## 7. Incremental sync

To keep your own copy of the expenses, read the changes feed `GET https://api.ai-budget.pl/public/v1/expenses/changes` instead of re-listing:

- Without `cursor` the feed starts from the beginning: every expense, plus every deletion ever recorded in the account. A client starting without a cursor therefore receives each historical deletion as a `delete`, mostly for ids it never saw.
- Each entry is either `{"type": "upsert", "expense": {...}}` — insert or replace your copy — or `{"type": "delete", "id": "..."}` — remove it. A delete can name an id you never received: deleting an unknown id is a no-op.
- A deleted expense, and an expense turned into a planned one, both arrive as `delete`.
- An expense edited again arrives again, with its latest state, at the end of the feed.
- A change appears in the feed about **10 seconds** after it was made.
- Store `next_cursor` after processing each page — it is present even on an empty page — and continue from it. When `has_more` is `false`, poll again later.

```js
async function sync(db) {
  let cursor = await db.loadCursor();
  for (;;) {
    const url = new URL('https://api.ai-budget.pl/public/v1/expenses/changes');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await api(url.pathname + url.search);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    for (const change of page.changes) {
      if (change.type === 'upsert') await db.put(change.expense);
      else await db.remove(change.id);
    }
    cursor = page.next_cursor;
    await db.saveCursor(cursor);
    if (!page.has_more) break;
  }
}
```

Known limitations:

- An expense moved to another account is not reported as deleted in the account it left.
- Renaming a tag or a project does not re-emit the expenses that carry it. If names matter to you, do a full resync now and then (sync again without a cursor).

## 8. Create, edit and delete expenses

Creating an expense requires an `Idempotency-Key` header: a UUID you generate for this expense.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/expenses \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24" \
  -H "Content-Type: application/json" \
  -d '{"amount":"42.50","currency":"PLN","date":"2026-10-31","merchant":"Biedronka","category_id":"8a6e0f52-1c3b-4d7e-a9f8-2b4c6d8e0f13"}'
```

- `201` — created. If the request times out, **retry with the same key**: a repeat returns the expense already created, with `200`, and the repeated body is ignored. Send retries one after another, not in parallel.
- `409 idempotency_key_conflict` — the key is already used by another record (one your app did not create, or an expense deleted since). Generate a new UUID.
- Amounts are decimal strings with at most two decimal places. A JSON number is refused.
- `400 validation_failed` means the request itself is malformed: an unknown field, a wrong type or format, a missing required field. `details.fields` lists the problems.
- `422 validation_failed` means the request is well-formed but refers to something that cannot be used: a `category_id`, `tag_ids` or `project_id` that is not in the connected account, or — on edit — `amount`, `currency` or `date` of an expense that is a share of a shared group expense (`source: "group"`), which the group owns.

`PATCH /public/v1/expenses/{id}` changes only the fields you send; `null` clears a field where allowed. `DELETE /public/v1/expenses/{id}` deletes the expense; it then arrives as `delete` in the changes feed. Take valid `category_id` values from `GET /public/v1/categories`.

## 9. Incomes

Incomes work like expenses (section 8), under `/public/v1/incomes`: `GET` (list), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`, and the changes feed `GET /incomes/changes` (the same rules as section 7). Scopes: `incomes:read`, `incomes:write`.

- **Validation codes.** A malformed request — a bad query parameter, or a body field that fails validation (unknown field, wrong type, bad enum, `date_from` after `date_to`, an unknown currency) — is `400 validation_failed`. `422 validation_failed` is for reference and state errors: a category of the wrong type or of another account, a `tag_ids` or `project_id` that is not in the account, or an attempt to edit a transfer-linked income.
- **List filters** have the expense list's names: `date_from`, `date_to`, `category_id`, `project_id`, `search`, `limit`, `cursor`. There is no merchant filter and no amount filter. `GET /public/v1/categories?type=income` lists the categories an income write accepts. Unknown query parameters are refused with `400 validation_failed`, as on every list route, `/categories` included.
- **Idempotency.** `POST /incomes` requires `Idempotency-Key`, with the same rules as for expenses: the key is scoped to your app and the account; a repeat answers `200` with the existing record; `409 idempotency_key_conflict` means the key belongs to a record of another origin, to another record's id, or to a deleted record.
- **Read-only fields.** `is_debt`, `is_debt_repayment`, `is_split_receivable` and `is_transfer` are returned but cannot be written.
- **Debt repayments.** The amount and date of a debt repayment can be edited and the repayment can be deleted — either changes the debt's outstanding balance, so do it deliberately.
- **Transfers.** An income that is one side of a transfer between accounts (`is_transfer: true`) cannot be edited or deleted; both answer `422 validation_failed`.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/incomes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 0c9d4e1a-7b2f-4a63-8e15-3f6a9b2c4d70" \
  -H "Content-Type: application/json" \
  -d '{"amount":"4200.00","currency":"PLN","date":"2026-10-31","description":"Salary"}'
```

## 10. Budgets

Budgets live under `/public/v1/budgets`: `GET` (list), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Scopes: `budgets:read`, `budgets:write`.

- `POST /budgets` requires `Idempotency-Key`, with the same rules as for incomes and expenses.
- A budget has no category of its own: category scope exists only through `allocations`, a list of `{category_id, amount}`.
- On `PATCH`, `allocations` **replaces the whole set**: `[]` clears it, omitting the field leaves it unchanged. A repeated `category_id` is `422 validation_failed`.
- `is_active` is read-only.
- `progress` describes the **current period**, in the budget's own currency, and uses the account's financial-month anchor.
- There is no changes feed for budgets: poll the list.

## 11. Analytics

Three read-only reports under `/public/v1/analytics`, scope `analytics:read`: `GET /summary` (income, expenses, net, `transaction_count`), `GET /by-category` (`type=expense|income`) and `GET /monthly`. All take `from` and `to` (`YYYY-MM-DD`, both inclusive) and an optional `currency`.

How it is counted:

- **Currency.** The default is the connecting user's display currency. Every response states its `currency`.
- **Conversion.** Every row is converted with our server's exchange rates. A row whose rate is unknown is excluded from every figure and the response carries `fx_approximate: true` — it is never added unconverted.
- **What is counted.** Planned expenses and the rows that record what friends owe the user back from a split bill are excluded. Debts and transfers are counted, as in the app's Analytics tab. `transaction_count` counts expense and income rows together.
- **Categories.** A receipt split across categories is attributed by its split, so a category total can differ from a whole-row conversion by a cent.
- **Ranges.** `from` and `to` are inclusive. At most 366 days for `summary` and `by-category`, at most 24 months for `monthly`; months are calendar months. A longer range, `from` after `to`, or an unknown currency is `400 validation_failed`.
- **Caching.** Results are cached for 60 seconds.
- **Why totals may differ slightly from the app.** The app converts with its own cached exchange rates and adds an amount without a known rate unconverted; the API excludes it and flags it.

```bash
curl "https://api.ai-budget.pl/public/v1/analytics/summary?from=2026-10-01&to=2026-10-31&currency=PLN" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 12. Errors

Every `/public/v1` error has the same body:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request is invalid.",
    "details": { "fields": { "amount": ["amount must be a decimal string with at most 2 decimal places"] } }
  }
}
```

Branch on `code`; `message` is for people and may change. New codes may be added.

| Code | HTTP | Meaning and what to do |
| --- | --- | --- |
| `invalid_token` | 401 | The access token is missing, invalid, expired or revoked. Refresh once and retry; if the refresh fails with `invalid_grant`, ask the user to connect your app again. |
| `grant_inactive` | 403 | The user who connected the app can no longer edit this account. Someone with edit rights must connect it again. |
| `account_encrypted` | 403 | The account is end-to-end encrypted: writes, `merchant`/`search` filters and receipts are not available (see below). |
| `insufficient_scope` | 403 | The connection lacks a scope this request needs; `details.required` lists it. Ask the user to connect again with that scope. |
| `viewer_read_only` | 403 | The connected user can only view this account. |
| `trip_archived` | 403 | The account is an archived trip; it can no longer be changed. |
| `forbidden` | 403 | Any other refusal. |
| `validation_failed` | 400 / 422 | 400: the request is malformed. 422: it refers to records that are not in the account, or to fields owned by a shared group. See `details.fields`. |
| `invalid_cursor` | 400 | Send `next_cursor` back exactly as you received it. |
| `account_required` | 400 | The connection covers several accounts: send the `X-Account-Id` header with one of the ids from `GET /public/v1/accounts`. |
| `account_not_granted` | 403 | The `X-Account-Id` account is not part of this connection. |
| `bad_request` | 400 | Any other invalid request. |
| `not_found` | 404 | No such record in the connected account, or it was deleted. |
| `method_not_allowed` | 405 | The HTTP method is not supported on this path. |
| `conflict` | 409 | The request conflicts with the current state. |
| `idempotency_key_conflict` | 409 | The `Idempotency-Key` is already used by another record. Use a new UUID. |
| `payload_too_large` | 413 | The request body is too large. |
| `rate_limited` | 429 | Too many requests. Wait `Retry-After` seconds. |
| `internal_error` | 500 | Our fault. Retry later. |
| `unavailable` | 503 | A temporary failure. Retry with backoff. |

`/oauth/token` and `/oauth/revoke` answer in the OAuth format `{"error": "...", "error_description": "..."}` with these codes: `invalid_request`, `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_scope`, `invalid_target`, `slow_down`, `temporarily_unavailable`. `invalid_grant` on a refresh means the connection is gone (revoked by the user, a reused refresh token, or no account of the connection is usable any more because the user lost edit rights to all of them) — ask the user to connect again. `invalid_target` means the `resource` parameter names a resource this server does not serve, or differs from the one the authorization was issued for; omit `resource` for this API.

## 13. Rate limits

- **120 requests per minute per connection** (one user in your app, all the accounts of the connection together).
- **1,200 requests per minute per app**, across all its connections.
- `/oauth/token`: 30 requests per minute per app. A public client is counted only on requests that carry a valid authorization code or refresh token of that client.

Every authenticated and authorised `/public/v1` response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining` (for whichever limit is closer to running out); a `401` or `403` does not. Your app's actual limits are the ones in these headers. Over the limit you get `429 rate_limited` with a `Retry-After` header in seconds — wait that long before the next request.

In front of the API an edge proxy also caps floods. Its `429` is not the JSON above and, for a browser app on a third-party origin, carries no CORS headers, so the browser reports it as a network error. Treat such an unreadable failure like a `429`: back off and retry.

## 14. End-to-end encrypted accounts

Users can encrypt their data end to end in the app, and then even our servers cannot read it:

- An account with **full** encryption cannot be connected at all.
- An account with **text** encryption can be connected **read-only**. `GET /public/v1/account` shows `"encryption": "text"` and `"read_only": true`. Writes answer `403 account_encrypted`.
- On such an account seven fields come back as `null` and are listed in each expense's `encrypted_fields`: `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`.
- Category names on `/categories` are `null` as well, with `"encrypted_fields": ["name"]` on each category.
- The `merchant` and `search` filters answer `403 account_encrypted`, and receipt files are not available.

## 15. Try it in this page

The **Authorize** button above runs the real OAuth flow with PKCE against the user's real data. To use it, add `https://api.ai-budget.pl/public/docs/oauth2-redirect.html` to your app's redirect URIs, then enter your `client_id` (and the secret, for a confidential client).
