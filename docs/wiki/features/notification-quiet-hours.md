# Notification quiet hours

## What this is
A per-user window (default 22:00-08:00 in the user's stored timezone) during which non-urgent pushes are held and delivered when it ends.

## Entry points
- `apps/api/src/modules/notifications/notifications.service.ts` (`holdIfQuiet`, `releaseHeldPushes`)
- `apps/api/src/modules/notifications/quiet-hours.util.ts`, `held-push-release.cron.ts`
- `apps/mobile/src/components/settings/notifications/NotificationsSettings.tsx`

## Key concepts
Typed pushes inside the window are written to `held_pushes` with `releaseAt` = next local `end`; a 10-minute cron sends and deletes due rows. `sendToUser` returns `true` for a held push.

## Invariants
- Deferred, never dropped (incl. exchange-rate hits); a failed release stays queued.
- Untyped pushes (security/system) are never held — pass a `notificationType` only for non-urgent pushes.
- Failure to queue falls through to immediate delivery.

## Known gaps
Bots ignore it; no "held until" UI; accuracy depends on `User.timezone`.

## History
ABA-846.
