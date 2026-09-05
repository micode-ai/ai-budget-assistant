import { useLocalSearchParams } from 'expo-router';
import { DrillDownView, type DrillDownPrefill } from '@/components/analytics/DrillDownView';

export default function DrillDownScreen() {
  const params = useLocalSearchParams<DrillDownPrefill>();

  return <DrillDownView initial={params} />;
}
