import { useLocalSearchParams } from 'expo-router';
import { ImportReportView } from '@/components/import/ImportReportView';

/** Post-import report (ABA-643). The header is registered in app/_layout.tsx. */
export default function ImportReportScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  return <ImportReportView batchId={batchId ?? ''} />;
}
