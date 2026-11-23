import { useGroupScreen } from '@/features/all-accounts/useGroupScreen';
import { useIsDesktopWeb } from '../webLayout.constants';
import { AllAccountsStatus } from './AllAccountsStatus';
import { GroupComparisonMobile } from './GroupComparisonMobile';
import { GroupComparisonDesktop } from './desktop/GroupComparisonDesktop';

/** Decides on width alone; the hook call is identical to `GroupComparisonView.tsx` and sits above the choice. */
export function GroupComparisonView({ groupId }: { groupId: string }) {
  const desktop = useIsDesktopWeb();
  const screen = useGroupScreen(groupId);
  const { data } = screen.state;
  if (!data)
    return (
      <AllAccountsStatus failed={screen.state.failed} onRetry={() => void screen.state.reload()} />
    );
  return desktop ? (
    <GroupComparisonDesktop screen={screen} data={data} />
  ) : (
    <GroupComparisonMobile screen={screen} data={data} />
  );
}
