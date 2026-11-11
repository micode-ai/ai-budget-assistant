import type { LeafletSource } from '@budget/shared-types';
import type { SharedFile } from '@/features/share-intake/shareIntakeQueue';
import { useLeafletSession } from '@/features/leaflets/useLeafletSession';
import { useLeafletConsentNotice } from '@/features/leaflets/useLeafletConsentNotice';
import { LeafletPhone } from './LeafletPhone';
import { LeafletConsentNotice } from './LeafletConsentNotice';

export interface LeafletScreenProps {
  /** Files from the share sheet. None → the idle state, or the picker with `autoPick`. */
  files?: SharedFile[];
  source: LeafletSource;
  /** Open the gallery at once when there are no files (native; `?from=pick`). */
  autoPick?: boolean;
}

/**
 * Native. The phone body and nothing else; the web counterpart is `LeafletScreen.web.tsx`, and this
 * file must never import from `desktop/`. The one-time leaflet consent notice sits over the body.
 */
export function LeafletScreen({ files, source, autoPick }: LeafletScreenProps) {
  const session = useLeafletSession({ files, source, autoPick });
  const notice = useLeafletConsentNotice();
  return (
    <>
      <LeafletPhone session={session} />
      <LeafletConsentNotice notice={notice} />
    </>
  );
}
