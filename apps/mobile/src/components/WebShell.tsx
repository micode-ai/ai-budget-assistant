import React from 'react';

/**
 * Native: the app has no web chrome, so this is genuinely nothing.
 *
 * Deliberately a real no-op rather than a re-export of `WebShell.web.tsx`.
 * That file statically imports `WebTopBar` and `WebSidebar`, and a re-export
 * would pull both — with their styles and icon imports — into the native
 * graph, where they can never render. Verified once by exporting the Android
 * bundle and grepping the Hermes bytecode: before this split, all three were
 * present in the AAB. Same reasoning as `services/telemetry.ts`.
 *
 * Metro resolves `WebShell.web.tsx` on web and this file everywhere else, so
 * the separation is enforced by the bundler rather than by a runtime branch.
 */
export function WebShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
