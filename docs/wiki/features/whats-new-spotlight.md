# "What's New" spotlight

*Hub: [mobile-app](../mobile-app.md)*

## What this is

A one-time, dismissible nudge for features that already shipped and have no other announcement path.
Static, client-only: no migration, no endpoint.

## Entry points

- `apps/mobile/src/features/whatsNew/whatsNewEntries.ts` — the ordered, append-only array
- `apps/mobile/src/features/whatsNew/resolveWhatsNewOutcome.ts` — the pure decision
- `apps/mobile/src/hooks/useWhatsNewSpotlight.ts`
- `apps/mobile/src/stores/whatsNewStore.ts` — MMKV, holds only `lastSeenId`
- `apps/mobile/src/components/whatsNew/WhatsNewSpotlight.tsx`
- `apps/mobile/app/whats-new.tsx` — the browsable history

## Key concepts

**Show at most one, and never a digest.** Only the single newest entry surfaces, regardless of how
many versions a returning user skipped. Simplicity was chosen explicitly over "everything you
missed", to keep the mechanism structurally incapable of becoming noisy.

**Every entry carries a `route` or a `helpSectionId`** — never neither — so "Tell me more" always
goes somewhere. An optional `tier` drives an informational chip only: it does **not** gate
navigation, because the destination screen already gates itself.

**A bottom sheet, never a blocking centre-screen modal**, mounted unconditionally beside the update
prompt.

## Invariants

**An entry's `id` is permanent once shipped**, in two senses: the persisted last-seen pointer
references it, and so does its copy.

**Copy lives in the nine locale files**, at `whatsNew.entries.<id>.title` / `.body` — not as fields
on the entry. It was plain English at first, on a recorded rationale citing blog and help markdown as
precedent for staying outside the i18n system — which was backwards, since those are exactly the two
long-form surfaces this repo does translate into all nine. The effect was localized chrome wrapped
around English copy, in the one section whose whole job is telling people about features they would
otherwise never find, in an app whose primary market is Poland.

**A missing key renders the key string to the user.** i18next falls back to the key, not to English,
so a test asserts every entry has non-empty copy in all nine bundles and that no bundle carries copy
for an id the array no longer has — verified to fail on a deliberately broken key rather than
passing vacuously.

**`lastSeenId: null` is genuinely ambiguous** between a brand-new install and an existing user
meeting the mechanism for the first time after an update. It is disambiguated by reading the
first-run flag: a user who has not yet onboarded silently seeds the pointer to the newest entry and
sees **no** nudge, because a "look at this new feature" prompt before the first transaction is noise
stacked on unfinished onboarding.

**Evaluated at most once per app session**, via a ref — the same guard shape as first-run
onboarding.

**Browsing the history never calls `markSeen`.** Only the one-time spotlight does.

**A future headline feature appends one entry plus its copy in all nine locales as part of its own
PR**, at the same review weight as its i18n, help and schema updates.

## Known gaps

- Entries are curated by hand; nothing checks that a shipped feature got one.
- The spotlight competes for the same attention as the store-rating prompt and the invite nudge,
  which fire on different paths deliberately — but nothing coordinates the three.

## History

ABA-470 (the mechanism) · ABA-530 (copy moved into the nine locale files). Contract:
`docs/contracts/whats-new-spotlight.md`.
