---
id: pending-sync-status-indicator
title: 'Show "N changes waiting to sync" so offline entries never feel lost'
status: building
priority: P3
created_at: 2026-11-08
jira_ticket:
orchestration_run: fce866c4-52aa-49f3-8d3d-c2d9d66988e1
---

# Show "N changes waiting to sync" so offline entries never feel lost

## User story
As a user who logs expenses offline (on a plane, in a basement shop, on a bad connection), I want to see how many changes are still waiting to upload, so that I know my data is safe and when it has caught up.

## Value hypothesis
The app is offline-first: writes go to SQLite and a `syncQueue`, and a failed push while offline is only a `console.warn`. That is correct engineering but invisible to the user. After a night of poor signal a user cannot tell "saved on this phone only" from "backed up". Trust in a finance app depends on that distinction, and it matters most for people who switch devices or reinstall. Components such as the settings hub and `DataSettings` already read pending counts for other purposes, which suggests the data is available and only a user-facing surface is missing. I did not confirm that a dedicated indicator is absent everywhere.

## Sketch
- A small status chip in the settings hub and the desktop attention panel: "All changes synced" or "3 changes waiting".
- Tapping it opens a short explanation and a "Sync now" action that forces a push and pull.
- A failed entity is shown with its type and a retry, instead of retrying silently forever.
- Hidden on a fully synced account, so it adds no noise for most users.

## Open questions
- Is a visible counter anxiety-inducing for users who are just briefly offline? A threshold, for example only after pending for more than 10 minutes, may be better.
- Does the web build, which has no local queue, need a different treatment or none at all?
- Does an existing surface already show this, making the idea a polish pass rather than a new feature?

## Cost estimate
About 3–4 days: a selector over the existing queue, the chip and detail sheet, and 9-locale strings.
