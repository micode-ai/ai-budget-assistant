# Gamification — achievements, streaks, tracking-gap reminder

*Hub: [api](../api.md) · related: [referral-program](referral-program.md),
[debt-reminders](debt-reminders.md)*

## What this is

Achievements (first expense, expense-count milestones, budget adherence, streaks, net-positive
month, referrals) and a daily tracking streak per user per account, plus a push that nudges a user
who has stopped logging. Shown on the home `GamificationCard` widget.

## Entry points

- `apps/api/src/modules/gamification/achievement-definitions.ts` — `ACHIEVEMENT_DEFINITIONS`, the
  list of achievements and their thresholds
- `gamification.service.ts` — `checkAchievements`, `getProfile`, `getDefinitions`
- `streak.service.ts` — `updateStreak`, `getStreak`
- `gamification.controller.ts` — `GET /gamification/profile`, `POST /gamification/check`,
  `GET /gamification/definitions` (`JwtAuthGuard` + `AccountContextGuard`)
- `tracking-gap-reminder.cron.ts` — `TrackingGapReminderCron`, `@Cron('0 10 * * *')`
- `apps/mobile/src/stores/gamificationStore.ts`,
  `apps/mobile/src/components/home/widgets/GamificationCard.tsx`

Migration: `20260627000000_add_tracking_gap_notification` (`User.notifyTrackingGap`).

## Key concepts

**`checkAchievements` runs after every write that could move it.** Expense, income and budget
creation fire it fire-and-forget. It first calls `updateStreak` with the user's timezone, then
gathers counts and the current month's sums, then walks every definition in one switch.

**Streak day math.** `updateStreak` computes "today" in `user.timezone` (`toLocaleDateString` with
`timeZone`). Same day → no change; the day after `lastActivityDate` → extend; anything else → reset
to 1. `UserStreak` is unique on `[userId, accountId, streakType]` with type `daily_tracking`.

**Progress only ratchets up.** An existing row is `update`d when it newly completes or its progress
rises; a missing row is `upsert`ed. Nothing ever lowers progress or un-completes an achievement.

**Referral achievements are user-global.** Their rows are stored under the user's
`defaultAccountId` (`achievementAccountId` for the `social` category), not the account the check ran
in — otherwise the same referrals would unlock the achievement once per account.

**Tracking-gap reminder (ABA-292).** Daily at 10:00 UTC the cron streams active users with a push
token and `notifyTrackingGap` on, takes the most recent `daily_tracking` `lastActivityDate` across
all their accounts, and sends a `tracking_gap_reminder` push when the gap is a positive multiple of
3 days (day 3, 6, 9 …; never day 4, 5, 7, 8). The preference is exposed as `trackingGap` on
`GET/PATCH /users/me/notification-preferences` and also gated inside `sendToUser`.

## Invariants

**A user with no `UserStreak` row is never nudged.** A new user who has never logged anything has
nothing to "return to", and a reminder there reads as spam.

**Every third day, not every day.** Daily nudges after a lapse are what makes users disable push
entirely; the `% 3` cadence is deliberate.

**Streaks are computed in the user's timezone.** One wall-clock instant can mean "continue" for one
user and "break" for another — `streak.service.spec.ts` pins exactly that case.

## Known gaps

- `budget_3months_no_exceed` is a documented simplification (see the comment in `checkAchievements`):
  it does not really check three months. `gamification.service.spec.ts` asserts the current
  behaviour explicitly so that a fix is a visible test change.
- Creating a budget runs `checkAchievements`, and so `updateStreak` — a budget-only day extends the
  "tracking" streak.
- `gamification.controller.ts` and `tracking-gap-reminder.cron.ts` have no tests.

## Testing

`gamification.service.spec.ts` drives `checkAchievements` against an in-memory `Map`-backed
`userAchievement` double that mirrors the real `findUnique`/`update`/`upsert` semantics, so one
scenario exercises every definition at once instead of per-call argument mocking. It pins the
`update`-vs-`upsert` split, the no-write case when already complete, and the referral redirect to
`defaultAccountId`. `streak.service.spec.ts` covers same-day, consecutive-day and broken-streak math
plus the timezone case.

## History

ABA-292 (tracking-gap reminder) · ABA-426 (the test suite) · ABA-457 (the cron paginated).
