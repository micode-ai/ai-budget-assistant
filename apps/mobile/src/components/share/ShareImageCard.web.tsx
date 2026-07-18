import { forwardRef, useImperativeHandle } from 'react';

export interface ShareCardLine {
  emoji: string;
  label: string;
  value: string;
}

export interface ShareCardPayload {
  fileTag: number | string;
  title: string;
  lines: ShareCardLine[];
  footer: string;
}

export interface ShareImageCardHandle {
  share: (payload: ShareCardPayload) => Promise<boolean>;
}

export interface ShareImageCardProps {
  renderFnName: string;
  gradientFrom: string;
  gradientTo: string;
  fileNamePrefix: string;
}

/**
 * Web no-op variant. There is no WebView-canvas image path in the browser, so
 * screens using this fall back to a plain-text share (`Share.share`). Keeps
 * `react-native-webview` / `expo-file-system` out of the web bundle entirely
 * (mirrors `ExpenseMapView.web.tsx`) while satisfying the same interface.
 */
export const ShareImageCard = forwardRef<ShareImageCardHandle, ShareImageCardProps>(function ShareImageCard(_props, ref) {
  useImperativeHandle(ref, () => ({ share: async () => false }));
  return null;
});
