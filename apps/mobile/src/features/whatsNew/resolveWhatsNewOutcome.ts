import type { WhatsNewEntry } from './whatsNewEntries';

export type WhatsNewOutcome =
  | { kind: 'noop' }
  /** Brand-new install, still mid onboarding — catch up with no nudge. */
  | { kind: 'seed-silently'; entryId: string }
  | { kind: 'show'; entry: WhatsNewEntry };

export interface WhatsNewOutcomeInputs {
  /** The shared "app is fully ready" gate — see useColdStartGate. */
  gateOpen: boolean;
  /** Device-local: the most recent entry id this install has already seen. */
  lastSeenId: string | null;
  /** `firstRunStore.seen` — true once this account has real data or finished onboarding. */
  firstRunSeen: boolean;
  entries: WhatsNewEntry[];
}

/**
 * Pure decision for the "What's New" spotlight, mirroring
 * `shouldShowFirstRun`'s split between a pure predicate and the hook that
 * wraps it — see docs/contracts/whats-new-spotlight.md.
 *
 * The single most-recent entry is the only thing ever shown, never a digest
 * of everything missed since the user's last version.
 */
export function resolveWhatsNewOutcome({
  gateOpen,
  lastSeenId,
  firstRunSeen,
  entries,
}: WhatsNewOutcomeInputs): WhatsNewOutcome {
  if (!gateOpen) return { kind: 'noop' };

  const latest = entries[entries.length - 1];
  if (!latest) return { kind: 'noop' };

  if (lastSeenId === null) {
    if (!firstRunSeen) return { kind: 'seed-silently', entryId: latest.id };
    // An existing, already-onboarded user meeting this mechanism for the
    // first time — exactly the target audience. Fall through to 'show'.
  } else if (lastSeenId === latest.id) {
    return { kind: 'noop' }; // already caught up
  }

  return { kind: 'show', entry: latest };
}
