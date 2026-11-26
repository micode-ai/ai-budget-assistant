import { DashboardView } from '@/components/home/DashboardView';

import { PrivacyBoundary } from '@/components/PrivacyBoundary';

export default function DashboardScreen() {
  return <PrivacyBoundary><DashboardView /></PrivacyBoundary>;
}
