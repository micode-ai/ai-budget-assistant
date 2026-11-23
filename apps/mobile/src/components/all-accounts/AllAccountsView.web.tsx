import { useAllAccounts } from '@/features/all-accounts/useAllAccounts';
import { useAccountGroups } from '@/features/all-accounts/useAccountGroups';
import { useIsDesktopWeb } from '../webLayout.constants';
import { AllAccountsMobile } from './AllAccountsMobile';
import { AllAccountsStatus } from './AllAccountsStatus';
import { AllAccountsDesktop } from './desktop/AllAccountsDesktop';

/**
 * The one place that decides, on width alone. The hooks run here, above the choice and identical to
 * `AllAccountsView.tsx`, so resizing across 1024 swaps the layout without refetching or resetting the period.
 */
export function AllAccountsView() {
  const desktop = useIsDesktopWeb();
  const state = useAllAccounts();
  const groups = useAccountGroups();

  if (!state.data)
    return <AllAccountsStatus failed={state.failed} onRetry={() => void state.reload()} />;
  return desktop ? (
    <AllAccountsDesktop state={state} data={state.data} groups={groups} />
  ) : (
    <AllAccountsMobile state={state} data={state.data} groups={groups} />
  );
}
