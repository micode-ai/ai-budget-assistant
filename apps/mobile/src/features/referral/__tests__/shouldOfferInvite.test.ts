import {
  shouldOfferInvite,
  MIN_SETTLED,
  MIN_DAYS_BETWEEN_OFFERS,
  MAX_DISMISSALS,
} from '../shouldOfferInvite';
import { resolveLastShownAt, resolveDismissals } from '@/stores/invitePromptStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);

const base = {
  settledCount: MIN_SETTLED,
  canEdit: true,
  lastShownAt: null as number | null,
  dismissals: 0,
  now: NOW,
};

describe('shouldOfferInvite', () => {
  it('offers once a friend has actually paid', () => {
    expect(shouldOfferInvite(base)).toBe(true);
  });

  it('stays silent until someone has settled', () => {
    // A split that has only been sent proves nothing worked yet.
    expect(shouldOfferInvite({ ...base, settledCount: 0 })).toBe(false);
  });

  it('never pitches a viewer, who cannot act on the split at all', () => {
    expect(shouldOfferInvite({ ...base, canEdit: false })).toBe(false);
  });

  it('goes quiet for good after enough refusals', () => {
    expect(shouldOfferInvite({ ...base, dismissals: MAX_DISMISSALS })).toBe(false);
    expect(shouldOfferInvite({ ...base, dismissals: MAX_DISMISSALS + 5 })).toBe(false);
  });

  it('still offers while refusals are below the limit', () => {
    expect(shouldOfferInvite({ ...base, dismissals: MAX_DISMISSALS - 1 })).toBe(true);
  });

  it('does not ask a frequent bill-splitter on every split', () => {
    expect(
      shouldOfferInvite({ ...base, lastShownAt: NOW - (MIN_DAYS_BETWEEN_OFFERS - 1) * DAY_MS }),
    ).toBe(false);
  });

  it('offers again once the interval has passed', () => {
    expect(
      shouldOfferInvite({ ...base, lastShownAt: NOW - (MIN_DAYS_BETWEEN_OFFERS + 1) * DAY_MS }),
    ).toBe(true);
  });

  it('treats the interval boundary as still quiet', () => {
    expect(
      shouldOfferInvite({ ...base, lastShownAt: NOW - MIN_DAYS_BETWEEN_OFFERS * DAY_MS + 1 }),
    ).toBe(false);
  });
});

describe('invitePromptStore resolvers', () => {
  it('reads a stored timestamp and a missing one', () => {
    expect(resolveLastShownAt(() => '1756857600000')).toBe(1756857600000);
    expect(resolveLastShownAt(() => undefined)).toBeNull();
  });

  it('reads a corrupted timestamp as never-shown rather than NaN', () => {
    expect(resolveLastShownAt(() => 'nope')).toBeNull();
  });

  it('reads dismissals, defaulting to zero on anything unusable', () => {
    expect(resolveDismissals(() => '2')).toBe(2);
    expect(resolveDismissals(() => undefined)).toBe(0);
    expect(resolveDismissals(() => '-3')).toBe(0);
    expect(resolveDismissals(() => 'x')).toBe(0);
  });
});
