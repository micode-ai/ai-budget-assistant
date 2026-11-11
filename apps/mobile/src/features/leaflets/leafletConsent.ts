import type { User } from '@budget/shared-types';

/**
 * The one-time leaflet consent notice (Gazetka match, community layer). It is shown to a user who
 * already shares anonymous community prices but has not yet been told that leaflet promo prices
 * are shared too. Until they acknowledge it, the server contributes nothing from their leaflets.
 * Opting in from Data settings stamps it server-side, because that copy already names leaflets.
 */
export function shouldShowLeafletConsentNotice(
  user: Pick<User, 'contributeCommunityPrices' | 'leafletConsentNoticeAt'> | null | undefined,
): boolean {
  return !!user?.contributeCommunityPrices && !user.leafletConsentNoticeAt;
}
