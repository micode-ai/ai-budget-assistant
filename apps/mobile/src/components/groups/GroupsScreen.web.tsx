import { useIsDesktopWeb } from '../webLayout.constants';
import { GroupsListView } from './GroupsListView';
import { GroupsDesktop } from './desktop/GroupsDesktop';
import type { GroupsScreenProps } from './GroupsScreen';

/**
 * The one place that decides, and it decides on width alone: below DESKTOP_MIN_WIDTH (1024) a
 * browser gets the phone view byte-for-byte, as `ExpensesView.web.tsx` does.
 */
export function GroupsScreen({ initialDialog, initialLink, phone }: GroupsScreenProps) {
  const desktop = useIsDesktopWeb();
  if (desktop) return <GroupsDesktop initialDialog={initialDialog} initialLink={initialLink} />;
  return <>{phone ?? <GroupsListView />}</>;
}
