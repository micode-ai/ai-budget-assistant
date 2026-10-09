import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupBudgetLinksView } from '../GroupBudgetLinksView';

const TITLE_ID = 'group-budget-links-dialog-title';

/**
 * Desktop "may be counted twice" dialog (ABA-661): hosts the phone's `GroupBudgetLinksView`
 * unchanged, with `withStackTitle={false}` so the group page underneath keeps its title. Every link
 * write is live, so there is no footer.
 */
export function GroupBudgetLinksDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <DesktopDialogFrame title={t('groupBudget.linksTitle')} titleId={TITLE_ID} onRequestClose={onClose} width={640}>
      <GroupBudgetLinksView groupId={groupId} withStackTitle={false} />
    </DesktopDialogFrame>
  );
}
