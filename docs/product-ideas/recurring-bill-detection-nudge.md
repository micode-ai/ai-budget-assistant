---
id: recurring-bill-detection-nudge
title: 'Nudge to mark a big one-off charge as recurring, so budget projections stop overreacting to rent'
status: building
priority: P2
created_at: 2026-09-11
jira_ticket:
orchestration_run: 79260519-d0df-4fe0-bff8-ed20043d082c
---

# Nudge to mark a big one-off charge as recurring, so budget projections stop overreacting to rent

## User story
As a user who pays rent (or another large monthly bill) as a single manual expense, I want the app to recognize that pattern and offer to mark it recurring, so my budget's "projected to exceed" warning stops being alarmed by the same bill every single month.

## Value hypothesis
ABA-523 fixed the budget-projection math itself (it now excludes the single largest day's spend when computing the daily burn rate), but the CLAUDE.md entry for that fix says plainly: "nothing marks a manually-entered monthly charge as recurring, so the projection is *less wrong* rather than *right* ... Wiring a nudge to mark such a charge recurring would make this genuinely accurate; it is new functionality, not a fix." The app already has every piece needed to build this — the anomaly engine's `recurring_suggestion` detector already finds 3+ same-amount charges at a ~30-day cadence and fires a `possible_merge`-style alert for other cases — it just never offers the one action that would help budgeting: "treat this as recurring, so we stop budgeting around it as if it might repeat again this week." Doing this closes the loop between three features that already exist (anomaly detection, the `isRecurring`/`recurringId` fields, and the ABA-523 projection fix) instead of adding a fourth.

## Sketch
- Reuse the existing recurring-cadence heuristic (same amount + merchant, monthly-ish gaps) that already powers `recurring_suggestion` anomaly alerts and Safe-to-Spend's income-cadence detector — apply it to *expenses* the user enters manually (source `'manual'`), not just ones already caught by the anomaly cron.
- On the expense detail screen, when a newly-saved expense matches that pattern for the first time, show a small inline prompt: "You've paid ~4,374 zł to 'Mieszkanie' 3 months in a row around this date. Mark as recurring?" — one tap sets `isRecurring: true` + `recurringId`, same fields the manual Repeat toggle already writes.
- Once marked recurring, the budget projection can (optionally, as a v2) treat the known recurring amount as a fixed "already accounted for" obligation rather than folding it into the excluded-largest-day heuristic — but v1 ships value just by getting more real bills flagged `isRecurring`, which the existing recurring-expense cron and detail-screen banner already know how to handle.
- Dismissing the prompt should not ask again for the same merchant+amount pair for a while (mirrors the existing shopping-list/notification dedup-ledger pattern already used elsewhere in the app).

## Open questions
- Should this run as a lightweight client-side check on save (cheap, using local SQLite history), or server-side alongside the existing anomaly cron (consistent with other detectors, but not real-time)?
- What's the right confidence bar — 2 prior occurrences, or 3 like the existing anomaly detector requires?
- Should accepting the nudge retroactively tag the prior occurrences with the same `recurringId`, or only the new one going forward?

## Cost estimate
2–3 days: reuse of existing cadence-detection logic, one new inline prompt component, and a small dedup store to avoid re-asking.
