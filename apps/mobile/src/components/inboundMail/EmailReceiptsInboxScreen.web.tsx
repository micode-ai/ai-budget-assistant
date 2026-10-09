import { useIsDesktopWeb } from '../webLayout.constants';
import { EmailReceiptsInbox } from './EmailReceiptsInbox';
import { EmailReceiptConfirm } from './EmailReceiptConfirm';
import { EmailReceiptsInboxDesktop } from './desktop/EmailReceiptsInboxDesktop';
import type { EmailReceiptsInboxScreenProps } from './EmailReceiptsInboxScreen';

/** Decides on width alone (see `GroupsScreen.web.tsx`). */
export function EmailReceiptsInboxScreen({ openId }: EmailReceiptsInboxScreenProps) {
  const desktop = useIsDesktopWeb();
  if (desktop) return <EmailReceiptsInboxDesktop openId={openId} />;
  return openId !== undefined ? <EmailReceiptConfirm id={openId} /> : <EmailReceiptsInbox />;
}
