import { canResetClaim, claimResetErrorReason } from '../groupOwnership';
import be from '../../../i18n/locales/be';
import de from '../../../i18n/locales/de';
import en from '../../../i18n/locales/en';
import es from '../../../i18n/locales/es';
import fr from '../../../i18n/locales/fr';
import nl from '../../../i18n/locales/nl';
import pl from '../../../i18n/locales/pl';
import ru from '../../../i18n/locales/ru';
import ua from '../../../i18n/locales/ua';

describe('canResetClaim (ABA-651)', () => {
  const detail = { status: 'active' as const, isOwner: true, myMemberId: 'm-me' };
  const claimedGuest = { id: 'm-ann', isAppUser: false, isClaimed: true, removedAt: null };

  it('is offered to the owner of an active group for a live, claimed guest', () => {
    expect(canResetClaim(detail, claimedGuest)).toBe(true);
  });

  it('is never offered for an app user, whose identity is their account', () => {
    expect(canResetClaim(detail, { ...claimedGuest, isAppUser: true })).toBe(false);
  });

  it('is not offered for an unclaimed name (nothing to reset) or a removed member', () => {
    expect(canResetClaim(detail, { ...claimedGuest, isClaimed: false })).toBe(false);
    expect(canResetClaim(detail, { ...claimedGuest, removedAt: '2026-10-01T00:00:00.000Z' })).toBe(false);
  });

  it('is owner-only, and never on an archived group or for myself', () => {
    expect(canResetClaim({ ...detail, isOwner: false }, claimedGuest)).toBe(false);
    expect(canResetClaim({ ...detail, status: 'archived' }, claimedGuest)).toBe(false);
    expect(canResetClaim(detail, { ...claimedGuest, id: 'm-me' })).toBe(false);
  });
});

describe('claimResetErrorReason (ABA-651)', () => {
  it('maps the server answers', () => {
    expect(claimResetErrorReason({ status: 409, code: 'NOT_CLAIMED' })).toBe('notClaimed');
    expect(claimResetErrorReason({ status: 404 })).toBe('gone');
    expect(claimResetErrorReason({ status: 409, code: 'OTHER' })).toBeNull();
    expect(claimResetErrorReason({ status: 500 })).toBeNull();
    expect(claimResetErrorReason(undefined)).toBeNull();
  });
});

describe('claim reset copy (ABA-651)', () => {
  const KEYS = [
    'resetClaim',
    'resetClaimHint',
    'resetClaimConfirmTitle',
    'resetClaimConfirmBody',
    'resetClaimConfirmAction',
    'claimResetDone',
    'claimResetNotClaimed',
    'claimResetGone',
  ];
  const LOCALES = { be, de, en, es, fr, nl, pl, ru, ua };

  it.each(Object.entries(LOCALES))('%s has every key, with the {{name}} placeholder kept', (_lang, locale) => {
    const groups = (locale as unknown as { groups: Record<string, string> }).groups;
    for (const key of KEYS) expect(typeof groups[key]).toBe('string');
    for (const key of ['resetClaimConfirmTitle', 'claimResetDone', 'claimResetNotClaimed']) {
      expect(groups[key]).toContain('{{name}}');
    }
  });
});
