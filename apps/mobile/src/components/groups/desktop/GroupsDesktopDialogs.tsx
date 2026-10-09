import { GroupCreateDialog } from './GroupCreateDialog';
import { GroupJoinDialog } from './GroupJoinDialog';

export type GroupsDialog = 'new' | 'join' | null;

interface Props {
  dialog: GroupsDialog;
  /** Pre-filled invite link (`/groups/join?t=`), only for the join dialog. */
  initialLink?: string;
  onClose: () => void;
  /** Called with the new / joined group's id; the screen decides how to navigate. */
  onOpenGroup: (groupId: string) => void;
}

/**
 * Renders whichever overlay `GroupsDesktop` has decided is open. The state lives in the screen;
 * this only turns it into JSX (the ABA-538 split), so a new groups-list overlay extends this file.
 */
export function GroupsDesktopDialogs({ dialog, initialLink, onClose, onOpenGroup }: Props) {
  if (dialog === 'new') return <GroupCreateDialog onClose={onClose} onCreated={onOpenGroup} />;
  if (dialog === 'join') {
    return <GroupJoinDialog initialLink={initialLink} onClose={onClose} onJoined={onOpenGroup} />;
  }
  return null;
}
