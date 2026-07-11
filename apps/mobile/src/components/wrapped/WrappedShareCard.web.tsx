import { forwardRef, useImperativeHandle } from 'react';

export interface WrappedShareLine {
  emoji: string;
  label: string;
  value: string;
}

export interface WrappedSharePayload {
  year: number | string;
  title: string;
  lines: WrappedShareLine[];
  footer: string;
}

export interface WrappedShareCardHandle {
  share: (payload: WrappedSharePayload) => Promise<boolean>;
}

/**
 * Web no-op variant. There is no WebView-canvas image path in the browser, so the
 * Wrapped screen falls back to the text share (`Share.share`). This keeps
 * `react-native-webview` / `expo-file-system` out of the web bundle entirely
 * (mirrors `ExpenseMapView.web.tsx`) while satisfying the same interface — the
 * screen never mounts it on web, but Metro still resolves this file for the import.
 */
export const WrappedShareCard = forwardRef<WrappedShareCardHandle>(function WrappedShareCard(_props, ref) {
  useImperativeHandle(ref, () => ({ share: async () => false }));
  return null;
});
