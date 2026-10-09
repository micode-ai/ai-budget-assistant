import { useIsDesktopWeb } from '../webLayout.constants';
import { GroupDetailView } from './GroupDetailView';
import { GroupDetailDesktop } from './desktop/GroupDetailDesktop';
import type { GroupDetailScreenProps } from './GroupDetailScreen';

/** Decides on width alone (see `GroupsScreen.web.tsx`). */
export function GroupDetailScreen({ groupId, initialDialog, phone }: GroupDetailScreenProps) {
  const desktop = useIsDesktopWeb();
  if (desktop) return <GroupDetailDesktop groupId={groupId} initialDialog={initialDialog} />;
  return <>{phone ?? <GroupDetailView groupId={groupId} />}</>;
}
