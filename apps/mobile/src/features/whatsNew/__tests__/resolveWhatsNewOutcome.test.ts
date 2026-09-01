import { resolveWhatsNewOutcome } from '../resolveWhatsNewOutcome';
import type { WhatsNewEntry } from '../whatsNewEntries';

const entries: WhatsNewEntry[] = [
  { id: 'a', title: 'A', body: 'a', route: '/a' },
  { id: 'b', title: 'B', body: 'b', route: '/b' },
];

describe('resolveWhatsNewOutcome', () => {
  it('is a noop when the gate is not open', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: false, lastSeenId: null, firstRunSeen: true, entries }),
    ).toEqual({ kind: 'noop' });
  });

  it('is a noop when there are no entries', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: true, lastSeenId: null, firstRunSeen: true, entries: [] }),
    ).toEqual({ kind: 'noop' });
  });

  it('seeds silently for a brand-new install still mid onboarding', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: true, lastSeenId: null, firstRunSeen: false, entries }),
    ).toEqual({ kind: 'seed-silently', entryId: 'b' });
  });

  it('shows the newest entry for an existing user meeting the mechanism for the first time', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: true, lastSeenId: null, firstRunSeen: true, entries }),
    ).toEqual({ kind: 'show', entry: entries[1] });
  });

  it('is a noop once the user has already seen the newest entry', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: true, lastSeenId: 'b', firstRunSeen: true, entries }),
    ).toEqual({ kind: 'noop' });
  });

  it('shows the newest entry (never a digest) for a user who is behind by more than one', () => {
    expect(
      resolveWhatsNewOutcome({ gateOpen: true, lastSeenId: 'a', firstRunSeen: true, entries }),
    ).toEqual({ kind: 'show', entry: entries[1] });
  });
});
