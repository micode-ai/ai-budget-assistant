import { EmailReceiptsInbox } from './EmailReceiptsInbox';
import { EmailReceiptConfirm } from './EmailReceiptConfirm';

export interface EmailReceiptsInboxScreenProps {
  /**
   * Set by the `/inbox/email-receipt?id=` route (a push deep link). Desktop renders the inbox with
   * that item's confirm dialog open; the phone renders the full-screen confirm card for it.
   */
  openId?: string;
}

/**
 * Native. The phone view and nothing else: the inbox list, or (for the deep-link route) the confirm
 * card. The web counterpart is `EmailReceiptsInboxScreen.web.tsx`; this file must never import from
 * `desktop/`.
 */
export function EmailReceiptsInboxScreen({ openId }: EmailReceiptsInboxScreenProps) {
  return openId !== undefined ? <EmailReceiptConfirm id={openId} /> : <EmailReceiptsInbox />;
}
