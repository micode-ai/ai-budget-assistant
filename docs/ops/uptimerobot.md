# External uptime monitor (UptimeRobot)

## Why

`.github/workflows/uptime-check.yml` is scheduled every 5 minutes, but GitHub throttles scheduled
workflows: in November 2026 it ran about 4 times a day. During the ABA-751 deploy the API was down
for ~9 hours and the first alert came 3.5 hours in. A shorter outage would not be seen at all.
UptimeRobot (free plan, 5-minute checks from outside our network) is the primary monitor;
`uptime-check.yml` stays as a backup.

## Monitors

| Name | Type | URL | Expectation |
|---|---|---|---|
| AI Budget API | Keyword | `https://api.ai-budget.pl/api/v1/health` | keyword `"status":"ok"` exists — catches a 200 with a failing DB too |
| AI Budget web app | HTTP(s) | `https://app.ai-budget.pl` | 2xx/3xx |
| AI Budget admin | HTTP(s) | `https://admin.ai-budget.pl` | 2xx/3xx |
| AI Budget landing | HTTP(s) | `https://ai-budget.pl` | 2xx/3xx |

Interval 5 minutes (the free-plan minimum). All four share one alert contact.

`/health` runs only `SELECT 1`: it does not prove a table matches the schema (see the
schema-migration rule in `CLAUDE.md`). Sentry remains the signal for that class of failure.

## Alerts

- E-mail to the account owner — on for every monitor (the free-plan default).
- Push to the UptimeRobot mobile app (iOS/Android, free): install it, sign in with the same
  account, and tick **Push** on each monitor.
- **Telegram and Webhook integrations are paid-only** (Solo plan and up, checked 2026-11-13).
  The free plan offers Discord, Google Chat, Pushbullet and Pushover instead. If the plan is ever
  upgraded: Integrations & API → Telegram → open the bot link and press Start in the ops chat.
  Do not wire the ops bot token into a webhook here by hand — that puts a secret in a third-party
  dashboard.
- No delay, no repeat (defaults): one alert when a monitor goes down, one when it comes back.

## Setup steps

1. Sign in at https://dashboard.uptimerobot.com (the account belongs to the owner; no shared
   password is stored in this repo).
2. New monitor → choose the type from the table → paste the URL → name → interval 5 min →
   for the API monitor set keyword `"status":"ok"`, alert when **keyword not exists**.
3. Tick the alert contacts → Create monitor. Repeat for each row.
4. Verify: every monitor shows **Up** within 5 minutes.

## State

Set up 2026-11-13: all four monitors created, 5-minute interval, e-mail alerts. Telegram
not connected (paid-only).

## Status page (optional)

UptimeRobot can publish a public status page from the same monitors; not set up.
