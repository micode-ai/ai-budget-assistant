import { ExpensesView } from '@/components/expenses/ExpensesView';

import { PrivacyBoundary } from '@/components/PrivacyBoundary';

export default function ExpensesScreen() {
  return <PrivacyBoundary><ExpensesView /></PrivacyBoundary>;
}
