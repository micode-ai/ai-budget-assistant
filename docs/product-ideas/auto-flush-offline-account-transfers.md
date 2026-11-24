---
id: auto-flush-offline-account-transfers
title: 'Offline account transfers sync as soon as the phone is back online'
status: building
priority: P2
created_at: 2026-11-24
jira_ticket:
orchestration_run: 988d8a36-2cf2-444a-be35-878b73d0f366
---

# Offline account transfers sync as soon as the phone is back online

## User story
As a user who moved money between two of my accounts while offline, I want the transfer to be sent automatically when connectivity returns, so that balances are right on my other devices and for shared members without me reopening the wallet.

## Value hypothesis
Transfers have their own write queue, pumped only when a wallet screen loads. A queued transfer can sit unsent for days while the other account shows a wrong balance, which looks like lost money, the worst failure for a finance app.

## Sketch
- Add a connectivity listener (and a foreground/resume hook) that drains the transfer queue.
- Reuse the existing queue and idempotency keys; only the trigger changes.
- Show the existing pending-sync indicator on queued transfer rows until acked.
- Log failures with `console.warn`, never `console.error`.

## Open questions
- Can this share the trigger the generic `/sync` path already uses?
- What is the retry back-off after repeated server rejections, such as a deleted account?
- Is the creator-attribution gap on the transfer list worth fixing in the same task?

## Cost estimate
About 1–2 days: one trigger hook, tests for drain and no double-send.
