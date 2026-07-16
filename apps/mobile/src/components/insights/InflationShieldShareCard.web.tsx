import { forwardRef, useImperativeHandle } from 'react';
import type { ShieldSharePayload } from '@/features/insights/shieldShare';

// Web has no react-native-webview / expo-file-system — this no-op keeps them out of
// the web bundle (mirrors WrappedShareCard.web.tsx / ExpenseMapView.web.tsx). The
// screen never mounts it on web, but Metro still resolves the import.
export interface InflationShieldShareCardHandle { share: (payload: ShieldSharePayload) => Promise<boolean>; }

export const InflationShieldShareCard = forwardRef<InflationShieldShareCardHandle>(function InflationShieldShareCard(_props, ref) {
  useImperativeHandle(ref, () => ({ share: async () => false }));
  return null;
});
