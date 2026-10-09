import { ImportReportView } from './ImportReportView';

/**
 * Native. The phone view and nothing else. The web counterpart is `ImportReportScreen.web.tsx`;
 * this file must never import from `desktop/`.
 */
export function ImportReportScreen({ batchId }: { batchId: string }) {
  return <ImportReportView batchId={batchId} />;
}
