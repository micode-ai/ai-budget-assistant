import { useIsDesktopWeb } from '../webLayout.constants';
import { ImportReportView } from './ImportReportView';
import { ImportReportDesktop } from './desktop/ImportReportDesktop';

/** Decides on width alone (see `GroupsScreen.web.tsx`). */
export function ImportReportScreen({ batchId }: { batchId: string }) {
  return useIsDesktopWeb() ? <ImportReportDesktop batchId={batchId} /> : <ImportReportView batchId={batchId} />;
}
