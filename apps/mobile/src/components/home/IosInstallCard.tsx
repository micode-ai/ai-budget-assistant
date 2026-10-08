/**
 * Native: nothing. The iOS "Add to Home Screen" card exists only for the web build (IosInstallCard.web.tsx);
 * a native install is already an app. A real no-op rather than a re-export of the web file, so the native
 * bundle never pulls in `navigator`/`localStorage` code (the same rule as telemetry.ts).
 */
export function IosInstallCard(): null {
  return null;
}
