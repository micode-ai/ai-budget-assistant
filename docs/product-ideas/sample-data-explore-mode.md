---
id: sample-data-explore-mode
title: 'Let new users explore the app with sample data before entering their own'
status: building
priority: P2
created_at: 2026-11-08
jira_ticket:
orchestration_run: 6383c7ef-ae6a-41ef-bc1a-fae2e780b205
---

# Let new users explore the app with sample data before entering their own

## User story
As a new user, I want to see the dashboard, analytics and AI chat filled with realistic sample data, so that I understand what the app will do for me before I spend time entering my own transactions.

## Value hypothesis
Most of the product's value (safe-to-spend, health score, analytics, inflation shield, wrapped) only appears after weeks of data. A brand-new user sees an empty dashboard and the get-started screen. Seeing the finished product in 30 seconds should lift first-week activation. No demo or sample-data mode exists in the app or the backlog.

## Sketch
- A "Try with sample data" button on `get-started`, which creates a clearly labelled demo account (`isDemo`) with about 3 months of generated transactions, two budgets and a goal.
- A persistent banner "You are viewing sample data. Start fresh" which deletes the demo account and returns to onboarding.
- Demo account excluded from admin metrics, DAU and referral qualification.
- Never syncs to other devices and never sends push notifications.

## Open questions
- Server-side or local-only (SQLite) demo? Local-only avoids polluting production data.
- How should AI chat behave for a demo account, given the cost?
- Does it interfere with first-run routing, which counts SQLite rows?

## Cost estimate
About 1 week for the local-only variant; the exclusion rules add a few days if the demo is server-side.
