import { GroupClaimsDialog } from './GroupClaimsDialog';
import { GroupExpenseDialog } from './GroupExpenseDialog';
import { GroupMembersDialog } from './GroupMembersDialog';
import { GroupSettleDialog } from './GroupSettleDialog';

export type GroupDetailDialogState =
  | { kind: 'expense'; expenseId?: string }
  | { kind: 'settle'; from?: string; to?: string }
  | { kind: 'members' }
  /** ABA-656: an itemised expense's lines. Without an id (a malformed deep link) nothing opens. */
  | { kind: 'claims'; expenseId?: string };

interface Props {
  groupId: string;
  dialog: GroupDetailDialogState | null;
  onClose: () => void;
  /** The group is gone for me (I left it, or the owner deleted it). */
  onLeftGroup: () => void;
  /** Replace the open dialog with another one (claims -> edit expense). */
  onSwitch: (next: GroupDetailDialogState) => void;
}

/**
 * Renders whichever overlay `GroupDetailDesktop` has decided is open. The state lives in the
 * screen; this only turns it into JSX (the ABA-538 split), so a new group-detail overlay extends
 * this file, not the screen inline. At most one is ever mounted, so each dialog's fixed title id is
 * safe.
 */
export function GroupDetailDialogs({ groupId, dialog, onClose, onLeftGroup, onSwitch }: Props) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'expense':
      // Keyed, so a different expense never inherits another one's seeded state.
      return <GroupExpenseDialog key={dialog.expenseId ?? 'new'} groupId={groupId} expenseId={dialog.expenseId} onClose={onClose} />;
    case 'settle':
      return <GroupSettleDialog groupId={groupId} from={dialog.from} to={dialog.to} onClose={onClose} />;
    case 'members':
      return <GroupMembersDialog groupId={groupId} onClose={onClose} onLeftGroup={onLeftGroup} />;
    case 'claims':
      if (!dialog.expenseId) return null;
      return (
        <GroupClaimsDialog
          key={dialog.expenseId}
          groupId={groupId}
          expenseId={dialog.expenseId}
          onClose={onClose}
          onEditExpense={(expenseId) => onSwitch({ kind: 'expense', expenseId })}
        />
      );
  }
}
