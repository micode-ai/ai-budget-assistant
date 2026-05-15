---
title: 'Uptime Check'
status: running
iterations: 0
---

# Uptime Check

## Trigger
GitHub Actions cron `*/5 * * * *` — fires every 5 minutes around the clock. Also triggerable manually via `workflow_dispatch`.

## Steps
1. `.github/workflows/uptime-check.yml` runs two matrix jobs in parallel:
   - `db` — probes `https://api.ai-budget.pl/api/v1/health` (Postgres liveness)
   - `ai` — probes `https://api.ai-budget.pl/api/v1/health/ai`
2. Each job uses `curl` with `--retry 2 --retry-delay 5` and a 15 s timeout.
3. If the HTTP response is not 200, the job fails and the **Notify Telegram** step fires:
   - Posts a `PROD <LABEL> DOWN` message to the ops Telegram chat with HTTP code, response time, first 500 B of body, and a link to the failing run.

## Failure modes
- **False positive flap** — transient network hiccup on GitHub-hosted runner. Check whether the API was actually down by looking at consecutive run failures.
- **Telegram alert not sent** — `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` secret missing; fix in repo Settings → Secrets.
- **Persistent 503** — API container crashed; follow `api-deploy` failure runbook.
- **AI health fails but DB health passes** — OpenAI or internal AI service issue; check `budget-api-prod` logs for AI-related errors.

## Owner
Automated; Mihail Perevertkin responds to Telegram alerts.

## Where to look first when it breaks
- Telegram ops chat — alert message has the GitHub run URL
- GitHub Actions → "Uptime Check" run log
- `https://api.ai-budget.pl/api/v1/health` — check directly from a browser
