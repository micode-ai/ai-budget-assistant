import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupJoinView } from '../GroupJoinView';

const TITLE_ID = 'group-join-dialog-title';

/**
 * Desktop "Join with link" dialog. Hosts `GroupJoinView` unchanged; its in-body "Join group" button
 * stays the primary action. A definite height (not `auto`) because the hosted root is a `flex: 1`
 * screen, which collapses inside an auto-height panel.
 */
export function GroupJoinDialog({
  initialLink,
  onClose,
  onJoined,
}: {
  initialLink?: string;
  onClose: () => void;
  onJoined: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <DesktopDialogFrame title={t('groups.joinTitle')} titleId={TITLE_ID} onRequestClose={onClose} width={480} height={480}>
      <GroupJoinView initialLink={initialLink} onJoined={onJoined} onAlreadyMember={onClose} />
    </DesktopDialogFrame>
  );
}
