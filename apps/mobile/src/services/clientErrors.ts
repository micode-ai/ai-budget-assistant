import { Platform } from 'react-native';
import i18next from 'i18next';
import { secureStorage } from './secureStorage';
import { clientErrorsApi } from './clientErrors.api';
import { clientHeaders } from '@/features/about/clientHeaders';
import {
  buildClientErrorPayload,
  createSessionDedupe,
  errorKey,
  toErrorParts,
} from './clientErrorReport';

/**
 * Client error reporting (ABA-832). The app has no crash-reporting SDK; this
 * sends a render error (`ErrorBoundary`) or a global JS error
 * (`useClientErrorReporting`) to `POST /telemetry/client-errors`, which stores
 * it and pings the ops channel on a new fingerprint.
 *
 * Shared by native and web — it imports nothing platform-specific beyond
 * `Platform` and the already-split `secureStorage`.
 */

const firstTimeThisSession = createSessionDedupe();

/** The last route pattern seen, kept by `useClientErrorReporting`. A module
 *  variable rather than a live lookup: by the time `ErrorBoundary` reports, the
 *  navigator it would ask has already been unmounted by the crash. */
let lastRoute: string | null = null;

export function setClientErrorRoute(route: string | null | undefined): void {
  lastRoute = route ?? null;
}

export interface ReportClientErrorInput {
  error: unknown;
  componentStack?: string | null;
  fatal: boolean;
}

/**
 * Never throws and never rejects. Skips silently when nobody is signed in (the
 * endpoint is authenticated) and when this error was already sent this session.
 */
export async function reportClientError(input: ReportClientErrorInput): Promise<void> {
  try {
    const parts = toErrorParts(input.error);
    const token = await secureStorage.getItem('accessToken');
    if (!token) return;
    if (!firstTimeThisSession(errorKey(parts.message, parts.stack))) return;

    const payload = buildClientErrorPayload(parts, input.componentStack, input.fatal, {
      platform: Platform.OS,
      appVersion: clientHeaders()['X-App-Version'] ?? '0.0.0',
      route: lastRoute,
      locale: i18next.language ?? null,
    });
    await clientErrorsApi.reportClientError(payload);
  } catch (e) {
    // warn, never error: on native an error opens LogBox, and a failed report
    // (offline, signed out mid-flight) is expected.
    console.warn('reportClientError failed:', e instanceof Error ? e.message : e);
  }
}
