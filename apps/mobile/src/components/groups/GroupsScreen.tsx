import type { ReactNode } from 'react';
import { GroupsListView } from './GroupsListView';

export interface GroupsScreenProps {
  /** Desktop only: open this dialog over the list (the `/groups/new` and `/groups/join` routes). */
  initialDialog?: 'new' | 'join';
  /** Desktop only: the pre-filled invite link for the join dialog. */
  initialLink?: string;
  /** What a phone renders instead of the list, for the two child routes. Defaults to the list. */
  phone?: ReactNode;
}

/**
 * Native. There is no desktop on a phone, so this is the phone view and nothing else. The web
 * counterpart is `GroupsScreen.web.tsx`; Metro resolves the platform file at bundle time, so no
 * desktop code reaches the native app (this file must never import from `desktop/`).
 */
export function GroupsScreen({ phone }: GroupsScreenProps) {
  return <>{phone ?? <GroupsListView />}</>;
}
