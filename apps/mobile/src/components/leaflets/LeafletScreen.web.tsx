import { useIsDesktopWeb } from '../webLayout.constants';
import { useLeafletSession } from '@/features/leaflets/useLeafletSession';
import { useLeafletConsentNotice } from '@/features/leaflets/useLeafletConsentNotice';
import { LeafletPhone } from './LeafletPhone';
import { LeafletConsentNotice } from './LeafletConsentNotice';
import { LeafletDesktop } from './desktop/LeafletDesktop';
import type { LeafletScreenProps } from './LeafletScreen';

/**
 * Decides on width alone (see `AnalyticsView.web.tsx`). The session hook runs HERE, above the
 * split, so a resize across 1024 mid-read swaps the body and keeps the rows already read; the
 * consent-notice hook likewise, so a resize cannot bring a dismissed notice back.
 */
export function LeafletScreen({ files, source, autoPick }: LeafletScreenProps) {
  const session = useLeafletSession({ files, source, autoPick });
  const notice = useLeafletConsentNotice();
  const desktop = useIsDesktopWeb();
  return (
    <>
      {desktop ? <LeafletDesktop session={session} /> : <LeafletPhone session={session} />}
      <LeafletConsentNotice notice={notice} centered={desktop} />
    </>
  );
}
