import { useAllAccounts } from '@/features/all-accounts/useAllAccounts';
import { useAccountGroups } from '@/features/all-accounts/useAccountGroups';
import { AllAccountsMobile } from './AllAccountsMobile';
import { AllAccountsStatus } from './AllAccountsStatus';

/**
 * All-accounts analytics. The data hooks are called HERE (platform-neutral) and passed down as props, so a
 * desktop `.web.tsx` layout can swap in without remounting or re-fetching on a resize.
 */
export function AllAccountsView() {
  const state = useAllAccounts();
  const groups = useAccountGroups();

  if (!state.data)
    return <AllAccountsStatus failed={state.failed} onRetry={() => void state.reload()} />;
  return <AllAccountsMobile state={state} data={state.data} groups={groups} />;
}
