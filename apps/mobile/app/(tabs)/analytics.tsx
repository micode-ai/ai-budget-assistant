import { AnalyticsView } from '@/components/analytics/AnalyticsView';

import { PrivacyBoundary } from '@/components/PrivacyBoundary';

export default function AnalyticsScreen() {
  return <PrivacyBoundary><AnalyticsView /></PrivacyBoundary>;
}
