import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupClaimsView } from '../GroupClaimsView';

const TITLE_ID = 'group-claims-dialog-title';

/**
 * Desktop "Divide the receipt" dialog (ABA-656). Hosts `GroupClaimsView` (the body of
 * `app/groups/[id]/claims.tsx`) unchanged, with `withStackTitle={false}` so the route underneath
 * keeps its header title, and its in-body Save / Close claims buttons (they depend on the mode
 * the view is in, so a footer would duplicate its state). "Edit expense" switches to the expense
 * dialog instead of pushing a route, which would navigate the page under the dialog away.
 */
export function GroupClaimsDialog({
  groupId,
  expenseId,
  onClose,
  onEditExpense,
}: {
  groupId: string;
  expenseId: string;
  onClose: () => void;
  onEditExpense: (expenseId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <DesktopDialogFrame title={t('groups.claimsTitle')} titleId={TITLE_ID} onRequestClose={onClose} width={640}>
      <GroupClaimsView groupId={groupId} expenseId={expenseId} withStackTitle={false} onEditExpense={onEditExpense} />
    </DesktopDialogFrame>
  );
}
