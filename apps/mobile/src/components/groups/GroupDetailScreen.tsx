import type { ReactNode } from 'react';
import { GroupDetailView } from './GroupDetailView';

export type GroupDetailDialogKind = 'expense' | 'settle' | 'members' | 'claims' | 'budgetLinks';

export interface GroupDetailScreenProps {
  groupId: string;
  /** Desktop only: open this dialog over the detail page (the child routes and their deep links). */
  initialDialog?: { kind: GroupDetailDialogKind; expenseId?: string; from?: string; to?: string };
  /** What a phone renders instead of the detail, for the child routes. Defaults to the detail. */
  phone?: ReactNode;
}

/**
 * Native. The phone view and nothing else; the web counterpart is `GroupDetailScreen.web.tsx`.
 * Must never import from `desktop/`.
 */
export function GroupDetailScreen({ groupId, phone }: GroupDetailScreenProps) {
  return <>{phone ?? <GroupDetailView groupId={groupId} />}</>;
}
