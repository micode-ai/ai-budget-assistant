---
id: merchant-spending-cap
title: 'Monthly spending cap for a single merchant'
status: building
priority: P3
created_at: 2026-11-26
jira_ticket:
orchestration_run: eac4d832-c4fd-43ad-8977-85f4cae486c5
---

# Monthly spending cap for a single merchant

## User story
As a user who overspends at one specific place (a delivery app, a favourite cafe, one online shop), I want to set a monthly cap for that merchant, so that I get warned before the habit blows the category budget.

## Value hypothesis
Budgets work by category, but the real leak is often one merchant that spans categories or hides inside a large one. The merchant analytics donut shows the problem after the fact, and nothing lets the user act on it. A merchant cap is a precise, easy-to-understand commitment, and the pieces already exist: merchant normalization, budget threshold pushes and the inline budget warning at entry.

## Sketch
- "Set a monthly cap" on a merchant row in the merchant analytics breakdown or the merchants settings screen.
- Progress shows as a thin bar on that merchant's row, and a push fires at 80 and 100 percent, reusing the category threshold push machinery and the quiet-hours deferral.
- The inline warning at expense entry also triggers when the typed merchant matches a capped one.
- Matching reuses the lower-cased trimmed merchant key already used by the category rules.
- Caps live next to budgets but do not change any budget total.

## Open questions
- A new small model or a nullable field on the merchant rule? A separate table keeps it out of encrypted-field handling.
- Split expenses and refunds: does a cap count the full amount or only the share attributed to the merchant?
- Free versus Pro limit on the number of caps.

## Cost estimate
About 1 week including the migration, the push reuse, and a phone plus desktop UI.
