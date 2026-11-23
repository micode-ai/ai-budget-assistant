import { useGroupScreen } from '@/features/all-accounts/useGroupScreen';
import { AllAccountsStatus } from './AllAccountsStatus';
import { GroupComparisonMobile } from './GroupComparisonMobile';

/** The hook runs here (platform-neutral) and is passed down, so `GroupComparisonView.web.tsx` can swap layouts. */
export function GroupComparisonView({ groupId }: { groupId: string }) {
  const screen = useGroupScreen(groupId);
  const { data } = screen.state;
  if (!data)
    return (
      <AllAccountsStatus failed={screen.state.failed} onRetry={() => void screen.state.reload()} />
    );
  return <GroupComparisonMobile screen={screen} data={data} />;
}
