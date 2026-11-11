import { shouldShowLeafletConsentNotice } from '../leafletConsent';

describe('shouldShowLeafletConsentNotice', () => {
  it('shows for a contributor who has not seen the notice', () => {
    expect(shouldShowLeafletConsentNotice({ contributeCommunityPrices: true, leafletConsentNoticeAt: null })).toBe(true);
    expect(shouldShowLeafletConsentNotice({ contributeCommunityPrices: true })).toBe(true);
  });

  it('never shows once it was seen', () => {
    expect(
      shouldShowLeafletConsentNotice({ contributeCommunityPrices: true, leafletConsentNoticeAt: '2026-11-11T10:00:00.000Z' }),
    ).toBe(false);
  });

  it('never shows to a user who does not share community prices', () => {
    expect(shouldShowLeafletConsentNotice({ contributeCommunityPrices: false, leafletConsentNoticeAt: null })).toBe(false);
    expect(shouldShowLeafletConsentNotice({})).toBe(false);
    expect(shouldShowLeafletConsentNotice(null)).toBe(false);
  });
});
