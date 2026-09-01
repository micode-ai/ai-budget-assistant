import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { useWhatsNewStore } from '@/stores/whatsNewStore';
import { WHATS_NEW_ENTRIES, type WhatsNewEntry } from '@/features/whatsNew/whatsNewEntries';
import { resolveWhatsNewOutcome } from '@/features/whatsNew/resolveWhatsNewOutcome';

/**
 * Drives the one-time "What's New" spotlight — see
 * docs/contracts/whats-new-spotlight.md. The decision itself lives in the
 * pure `resolveWhatsNewOutcome`; this hook only wires it to the stores and
 * to navigation.
 *
 * One of the cross-cutting hooks composed by RootNavigator (ABA-354
 * convention): a discovery mechanism for a future feature extends
 * `WHATS_NEW_ENTRIES`, not this hook.
 *
 * Evaluated **at most once per app session** via `checked`, exactly like
 * `useFirstRunOnboarding` — an account switch or any other re-render must
 * not re-arm this and replay the sheet mid-session.
 */
export function useWhatsNewSpotlight(gateOpen: boolean): {
  activeEntry: WhatsNewEntry | null;
  dismiss: () => void;
  viewDetails: () => void;
} {
  const lastSeenId = useWhatsNewStore((s) => s.lastSeenId);
  const markSeen = useWhatsNewStore((s) => s.markSeen);
  const firstRunSeen = useFirstRunStore((s) => s.seen);
  const [activeEntry, setActiveEntry] = useState<WhatsNewEntry | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    if (!gateOpen) return;
    checked.current = true;

    const outcome = resolveWhatsNewOutcome({
      gateOpen,
      lastSeenId,
      firstRunSeen,
      entries: WHATS_NEW_ENTRIES,
    });

    if (outcome.kind === 'seed-silently') {
      markSeen(outcome.entryId);
    } else if (outcome.kind === 'show') {
      setActiveEntry(outcome.entry);
    }
  }, [gateOpen, lastSeenId, firstRunSeen, markSeen]);

  const dismiss = useCallback(() => {
    if (activeEntry) markSeen(activeEntry.id);
    setActiveEntry(null);
  }, [activeEntry, markSeen]);

  const viewDetails = useCallback(() => {
    if (!activeEntry) return;
    markSeen(activeEntry.id);
    const target = activeEntry.route ?? (activeEntry.helpSectionId ? `/help/${activeEntry.helpSectionId}` : null);
    setActiveEntry(null);
    if (target) router.push(target as any);
  }, [activeEntry, markSeen]);

  return { activeEntry, dismiss, viewDetails };
}
