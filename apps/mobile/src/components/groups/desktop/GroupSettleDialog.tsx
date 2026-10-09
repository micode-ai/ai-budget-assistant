import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupSettleView } from '../GroupSettleView';

const TITLE_ID = 'group-settle-dialog-title';

/**
 * Desktop "Settle up" dialog. Hosts `GroupSettleView` unchanged, including its in-body confirm
 * (short, and it branches on the creditor's payment method). `onDone` replaces its `router.back()`.
 */
export function GroupSettleDialog({
  groupId,
  from,
  to,
  onClose,
}: {
  groupId: string;
  from?: string;
  to?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // No pair = "Record a payment" (ABA-652): the view offers a counterpart picker.
  const title = from && to ? t('groups.settleTitle') : t('groups.recordPayment');
  return (
    <DesktopDialogFrame title={title} titleId={TITLE_ID} onRequestClose={onClose} width={480} height={620}>
      <GroupSettleView groupId={groupId} from={from} to={to} onDone={onClose} />
    </DesktopDialogFrame>
  );
}
