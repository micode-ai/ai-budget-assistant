# Receipt price-check alert rollout (ABA-373)

The receipt price-check feature compares each scanned receipt line against the
median of what the user previously paid for that product **at that same
store**, and surfaces lines costing measurably more so the user can check the
receipt while still at the register.

There are two surfaces, and this runbook is about only one of them:

- **Inline findings** — returned in every `POST /ai/scan-receipt` response,
  rendered on the mobile scan-confirmation screen and by all three chat bots
  (Telegram/WhatsApp/Slack). **Live and unconditional.** Nothing here gates
  them.
- **Persisted alert** — one `anomaly_alerts` row of type `'price_overcharge'`
  per receipt, surfaced on the Alerts screen and in the analytics "found"
  total. Gated behind the `RECEIPT_CHECK_ALERTS_ENABLED` env var, **default
  off**. This runbook is about turning that write on.

`AnomalyService.detectPriceOvercharge` (`apps/api/src/modules/anomaly/anomaly.service.ts`)
runs on every qualifying expense regardless of the flag. When the flag is off
it still computes findings and logs what it would have written — only the
`anomalyAlert.create` call is skipped. That's what makes it possible to
validate the engine against real production traffic before flipping the flag.

## Precondition — do not flip the flag before this is true

**A mobile build containing the `price_overcharge` alert card must already be
rolled out to users before this flag is turned on in production.**

Before that card shipped (mobile plan Tasks 1 and 4), `apps/mobile/app/alerts/index.tsx`'s
`renderBody` had no case for `price_overcharge` and fell through to its
`default:` branch, which rendered the literal string `price_overcharge` with
an empty body. The real card exists now, but **mobile version tails are
effectively permanent** — some installs out there predate any given build
forever. Nothing in the API enforces this precondition; flipping the env var
does not check what app version any user is running. That is exactly why it
is written down here instead of relied on to fail loudly.

In practice: confirm the mobile release containing the alert card has been in
the Play Store / App Store for long enough that the bulk of the active
install base has auto-updated (weeks, not days) before proceeding.

## How to verify readiness before flipping

Because the detector logs every finding it would have written while the flag
is off, you can confirm the engine is producing real findings for real users
without touching the write path at all.

The disabled-path log line, verbatim from `detectPriceOvercharge`:

```
[PriceCheck] ${findings.length} line(s) above the usual price, total ${totalAmount} ${expense.currencyCode} — alert write disabled
```

Grep the API container's logs for it (stable substring, survives the
interpolated numbers):

```bash
docker logs --tail 5000 budget-api-prod 2>&1 | grep -F "alert write disabled"
```

A healthy sample line looks like:

```
[Nest] 1  - 07/25/2026, 9:14:02 AM     LOG [AnomalyService] [PriceCheck] 2 line(s) above the usual price, total 8.40 PLN — alert write disabled
```

If you're seeing a steady trickle of these across different accounts and
currencies (not just your own test receipts), the engine is finding real
things for real users and the write path is ready to turn on — pending the
mobile precondition above.

## Flip it

Once the precondition is satisfied and the logs confirm real findings:

```bash
# on the VPS, in /opt/ai-budget
# add RECEIPT_CHECK_ALERTS_ENABLED=true to .env.production, then:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

> **`docker restart` does NOT reload `env_file`.** This is an established trap
> in this project (see the "Adding env vars" note in `CLAUDE.md` → Production).
> A plain `docker restart budget-api-prod` after editing `.env.production` will
> silently keep the old value — the container looks like it restarted fine,
> but the flag never took effect. Always use the `up -d --force-recreate`
> form above.

After the recreate, confirm the new alerts are actually landing —
`GET /alerts` on an account that scans a receipt with a real finding should
return a `price_overcharge` row instead of only the disabled-path log line.

## Rollback

If something looks wrong after flipping (bad findings, unexpected volume,
anything else):

```bash
# in .env.production, set:
RECEIPT_CHECK_ALERTS_ENABLED=false
# then:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

This immediately stops new `price_overcharge` rows from being written — the
detector goes back to logging the disabled-path line instead. **Rows already
written stay.** They are not deleted or hidden by the rollback; they remain
visible on the Alerts screen and count toward the analytics "found" total
until the user dismisses them, same as any other alert — normal
`DELETE /alerts/:id` (`ViewerBlockGuard`-gated, per-account) removes one.
There is no bulk-undo for a bad rollout; if a wave of bad rows needs cleaning
up, that's a manual DB cleanup, not something this flag does for you.
