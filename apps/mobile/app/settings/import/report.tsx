import { useLocalSearchParams } from 'expo-router';
import { ImportReportScreen } from '@/components/import/ImportReportScreen';

/** Post-import report (ABA-643). The header is registered in app/_layout.tsx. */
export default function ImportReportRoute() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  return <ImportReportScreen batchId={batchId ?? ''} />;
}
