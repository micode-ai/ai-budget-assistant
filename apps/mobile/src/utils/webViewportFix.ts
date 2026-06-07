// Native (iOS/Android) no-op. The real implementation lives in
// `webViewportFix.web.ts` and only runs in the browser. Metro resolves the
// `.web.ts` variant for the web bundle and this file for native, so importing
// `@/utils/webViewportFix` is safe from shared code.
export function applyWebViewportFix(): void {
  // intentionally empty on native
}
