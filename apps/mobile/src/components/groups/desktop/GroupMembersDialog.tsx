import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupMembersView } from '../GroupMembersView';

const TITLE_ID = 'group-members-dialog-title';

/**
 * Desktop members dialog: add a placeholder, rename, payment details, remove / leave, and the owner
 * controls, all inside the existing `GroupMembersView`. Edits are live, so there is no footer.
 * `onLeftGroup` runs when the group is gone for me (I left, or the owner deleted it), and the
 * screen then leaves the group's page.
 */
export function GroupMembersDialog({
  groupId,
  onClose,
  onLeftGroup,
}: {
  groupId: string;
  onClose: () => void;
  onLeftGroup: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DesktopDialogFrame title={t('groups.membersTitle')} titleId={TITLE_ID} onRequestClose={onClose} width={560}>
      <GroupMembersView groupId={groupId} onLeftGroup={onLeftGroup} />
    </DesktopDialogFrame>
  );
}
