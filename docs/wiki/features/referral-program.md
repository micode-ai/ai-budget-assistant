# Referral program — the share link and the invite nudge

*Hub: [mobile-app](../mobile-app.md)*

## What this is

The user-facing half of referrals: the message a user sends a friend, and the one moment the app
asks them to send it. How the code is captured on arrival and attributed is on
[acquisition-tracking](acquisition-tracking.md); how a referral qualifies for its bonus is in the
`referrals` API module.

## Entry points

- `apps/mobile/src/features/referral/referralLink.ts` — `buildReferralUrl`, `buildReferralShareMessage`
- `apps/mobile/src/stores/referralStore.ts` — `shareCode`
- `apps/mobile/src/features/referral/shouldOfferInvite.ts` — the pure decision
- `apps/mobile/src/stores/invitePromptStore.ts` — MMKV `invite-prompt`: `lastShownAt`, `dismissals`
- `apps/mobile/src/components/receipt-split/InviteFriendsCard.tsx`
- `apps/mobile/app/expense/split.tsx` — the only call site
- `apps/mobile/src/services/attribution.{ts,web.ts,native.ts}` — `captureReferralCode` /
  `getReferralCode`; `app/(auth)/register.tsx` seeds its field from the latter

## Key concepts

**The link points at the web app**, `https://app.ai-budget.pl/?ref=<code>&src=referral&loc=share`,
because that is the only place a link can pre-fill anything. `src=referral` is a new source rather
than a reused landing `loc`, so it lands in the acquisition columns without splitting the landing
funnel. The message renders through the `referral.shareText` key that already existed in all nine
locales — the old `shareCode` sent a hard-coded English sentence with a bare code and no link.

**The invite nudge fires on a bill split once a friend has actually paid the user back** through a
page we served. At that moment the product has demonstrably worked for both people and the friend
already knows what it is. The home screen would reach more users and mean nothing. `shouldOfferInvite`
requires at least one settled participant, `canEdit`, no offer inside 60 days, and fewer than two
dismissals — after the second it goes quiet permanently.

## Invariants

**The code stays printed in the message, not only inside the link.** A friend who installs from
Play arrives with no query string, so the printed code is their only way to claim the bonus. The URL
sits on its own line after a blank one, because messengers linkify a URL that ends a line.

**Capture requires `src=referral` alongside `ref`.** See
[acquisition-tracking](acquisition-tracking.md#invariants) — a directory's `?ref=peerpush` satisfies
the code shape exactly. `buildReferralUrl` always emits the marker, so the gate costs nothing.

**The referral code is not an acquisition field.** It is stored under its own `referralCode` key and
never folded into `Acquisition`: it is an argument to registration, and mixing it in would put it on
a path toward the `acquisition*` database columns.

**Client-side validation is looser than the server's on purpose** (`[A-Za-z0-9]{4,12}`,
uppercased, versus the server's alphabet without 0/O/1/I/L). The server is the authority; a
stricter client regex would silently drop a code the server would have honoured.

**The nudge is an inline card, never a modal**, and deliberately on a different path from the two
interrupting prompts — the [store-rating prompt](store-rating-prompt.md) fires on receipt-scan and
Wrapped-share. Stacking a second ask on the same success is how both get dismissed.

**`markShown` fires when the card actually renders**, so the 60-day interval starts from a real
sighting. **`markAccepted` resets the dismissal count** — someone who shared has refused nothing. A
corrupt stored timestamp resolves to never-shown, not `NaN` (which compares false against everything
and would silently disable the throttle).

**The card lazily loads the referral code** before it can share, since sharing without it would
send a message with an empty code.

**`ParticipantStatusList` has no opinion about referrals** — it gained an optional `footer` slot
rendered inside its scroll, and the screen decides what goes there.

## Known gaps

- The landing and blog generators do not forward `?ref=` through their CTAs.
- Android installs now carry a Play Install Referrer (ABA-553), but only for acquisition tags; the
  referral code is not threaded through it, so a Play install still relies on the printed code.
- One surface only. A second should be justified by this one's results, not added on the
  assumption that more asking is more inviting.

## History

ABA-486 (a real link in the share message) · ABA-489 (the invite nudge) · ABA-494 (the
`src=referral` capture gate).
