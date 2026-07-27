# Receipt-split guest-link rollout

The receipt-split feature lets the payer of a shared bill split it among
people who don't have the app. Each participant gets a public, unauthenticated
link (`GET /s/:token`, served by `GuestController` in
`apps/api/src/modules/receipt-split/`) showing only their own share and a
payment deep-link; the payer sees a per-person status list
(`sent → opened → claimed → settled`) and confirms once the money actually
arrives, which settles the debt through the same path a manual repayment
takes.

Both guest routes (`GET /s/:token`, `POST /s/:token/paid`) are excluded from
the API's `/api/v1` prefix in `main.ts`, alongside the Stripe/Telegram/
WhatsApp/Slack webhooks.

There is exactly one piece of this feature that does **not** deploy with the
code: the pretty apex URL needs an nginx block on the VPS.

## The gap: `ai-budget.pl/s/:token` needs a dedicated nginx block

`ReceiptSplitService` builds every guest link from:

```ts
const GUEST_LINK_BASE = process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';
```

`https://api.ai-budget.pl` already serves `/s/:token` today (the shared-nginx
`api.ai-budget.pl` block proxies everything to `budget-api-prod`) — so links
work out of the box, unconfigured. But an `api.` host in a message about
money is not what we want the payer's friends to see.

The pretty form is `https://ai-budget.pl/s/:token` — the same apex host that
already serves the static mobile-web SPA (`ai-budget-web-prod`, see
`docs/ops/web-deploy.md`). Getting there needs a `location /s/` block added
to the **existing** apex `server { server_name ai-budget.pl; }` block in
`/opt/shared-nginx/conf.d/ai-budget.conf`, placed ahead of that block's
existing `location / { proxy_pass $upstream_budget_web; }` catch-all so `/s/`
requests reach the API container instead of the SPA.

**This config lives only on the VPS — it is not part of this repo and does
not deploy with a normal `git push` / CI run.**

### The exact block to add

Insert into the existing `ai-budget.pl` `server { listen 443 ssl; … }` block
in `/opt/shared-nginx/conf.d/ai-budget.conf` (back the file up first), before
its `location /` block:

```nginx
    # Receipt-split guest links (ABA) — proxy to the API so the pretty apex
    # URL resolves instead of falling through to the SPA's location /.
    # GET /s/:token and POST /s/:token/paid are excluded from the API's
    # /api/v1 prefix (see main.ts), so no path rewrite is needed here.
    location /s/ {
        set $upstream_budget_api http://budget-api-prod:3000;
        proxy_pass $upstream_budget_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

This mirrors the `location /` block already documented for the same server
in `docs/ops/web-deploy.md` (`set $upstream_budget_web http://ai-budget-web-prod:80;`)
— same `resolver 127.0.0.11 valid=30s;` at the server level already covers
this new `location` too, so it does not need to be redeclared. `budget-api-prod`
listens on `3000` inside the shared `budget-network` (see
`docker-compose.prod.yml`, same container the `api.ai-budget.pl` block already
proxies to).

After editing:

```bash
docker exec shared-nginx nginx -t && docker exec shared-nginx nginx -s reload
```

nginx's location matching is longest-prefix-first for plain prefixes, so `/s/`
would technically win over `/` regardless of where it sits in the file — it is
placed before `location /` anyway, to match this file's existing convention
and keep intent obvious to the next person editing it.

### `APP_PUBLIC_URL` — do not set it before the block exists

`APP_PUBLIC_URL` is already documented in `.env.example`:

```
# Public base URL used to build the receipt-split guest link (GET /s/:token).
# Leave unset in production — it defaults to https://api.ai-budget.pl, which
# already serves the route. Setting it to the pretty apex form
# (https://ai-budget.pl) requires a dedicated nginx block that does not exist
# yet — every guest link would 404 until that block is added.
APP_PUBLIC_URL=
```

The operational consequence, spelled out: if someone sets
`APP_PUBLIC_URL=https://ai-budget.pl` in `.env.production` and force-recreates
the `api` service **before** the nginx block above exists, every guest link
generated from that point on (embedded in already-sent messages, and any new
split created afterward) points at a URL with no route for it on the apex —
the request either 404s or falls through to the SPA's `index.html`, which has
no screen for `/s/*` and shows the guest a blank/broken app instead of their
share. Order of operations matters: add the nginx block and reload first,
verify a live token resolves through the apex, **then** set `APP_PUBLIC_URL`
and recreate `api`.

### `docker restart` does NOT reload `env_file`

Same established trap as everywhere else in this project (see the "Adding env
vars" note in `CLAUDE.md` → Production, and `docs/ops/receipt-price-check-rollout.md`).
After adding `APP_PUBLIC_URL=https://ai-budget.pl` to `.env.production`, a
plain `docker restart budget-api-prod` will NOT pick it up — the container
looks like it restarted fine but keeps serving the old (unset) value. The
correct command, in `/opt/ai-budget` on the VPS:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

## Migrations

This feature carries three migrations, applied in this order (all already
authored in the repo, none yet pushed to `development`'s remote as of this
writing):

1. `20260726120000_add_receipt_split` — creates `receipt_split_participants`
   (id, accountId, expenseId, name, token `@unique`, amount, currencyCode,
   itemIds, debtExpenseId, openedAt/claimedAt/settledAt, expiresAt,
   `ON DELETE CASCADE` FK to `expenses`); adds `expenses.is_split_receivable`
   (`Boolean NOT NULL DEFAULT false`); **also** adds `users.payment_method`
   (`SettleMethod?`) and `users.payment_handle` (`TEXT?`) — reused by the
   guest page to resolve the payer's payment link, falling back to their
   `AccountMember`-level trip-wallet payment info only when either is unset
   at the user level.
2. `20260726130000_add_receipt_split_cancelled_at` — adds
   `receipt_split_participants.cancelled_at`, distinguishing an explicit payer
   cancellation from a split that merely aged past its `expires_at` with
   debts still unsettled.
3. `20260727120000_add_receipt_split_participant_seq` — adds
   `receipt_split_participants.seq` and the hand-written partial unique index
   `receipt_split_live_slot` on `(expense_id, seq) WHERE cancelled_at IS NULL`,
   enforcing at most one **live** split per expense (a concurrent double-create
   collides on it; a re-split after cancellation reuses `seq 0` freely because
   the cancelled rows have dropped out of the index).

Apply with the normal deploy path — `prisma migrate deploy` runs automatically
in `scripts/deploy.sh` on every push to `development`. No manual migration
step is needed beyond the ordinary deploy.

## Rollback

**Nginx (apex `/s/` block):** remove the `location /s/ { … }` block from
`/opt/shared-nginx/conf.d/ai-budget.conf` (a timestamped `*.bak.*` copy should
exist from before the edit — restore it, or delete just the added block) and
reload:

```bash
docker exec shared-nginx nginx -t && docker exec shared-nginx nginx -s reload
```

Guest links immediately stop resolving through the apex; `api.ai-budget.pl/s/:token`
keeps working throughout, since nothing about the API-side route changes.

**`APP_PUBLIC_URL`:** unset it (or delete the line) in `.env.production`, then

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

Every guest link minted **after** this reverts to `https://api.ai-budget.pl/s/:token`.
Links already sent to guests before the rollback keep the host they were built
with (the token itself is unaffected either way — only the base URL changes),
so a guest who received an apex-form link before the rollback keeps a link
that now hits whatever the apex currently does with `/s/` (broken, if the
nginx block was rolled back first as described above). Roll back `APP_PUBLIC_URL`
and the nginx block together, not independently, to avoid stranding
already-sent links in a broken state.

**Feature-level rollback (this migration set):** there is no feature flag for
receipt-split — it ships live once deployed. If the feature itself needs to be
pulled, that is a code revert + a fresh migration to drop
`receipt_split_participants` / `expenses.is_split_receivable` /
`users.payment_method` / `users.payment_handle`, not something this runbook
covers; existing splits and their guest links would need to be considered
(cancelling them server-side before dropping the table is the safer order).
