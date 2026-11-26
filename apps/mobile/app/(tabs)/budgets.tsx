import { BudgetsView } from '@/components/budgets/BudgetsView';

import { PrivacyBoundary } from '@/components/PrivacyBoundary';

export default function BudgetsScreen() {
  return <PrivacyBoundary><BudgetsView /></PrivacyBoundary>;
}
