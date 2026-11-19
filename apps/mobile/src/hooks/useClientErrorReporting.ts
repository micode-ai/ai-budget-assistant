import { useEffect } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import { reportClientError, setClientErrorRoute } from '@/services/clientErrors';
import { installGlobalErrorHandler, type ErrorUtilsLike } from '@/services/globalErrorHandler';

/**
 * Client error reporting bootstrap (ABA-832).
 *
 * 1. Wraps the global JS error handler once, so an uncaught error is reported
 *    before React Native's own handler runs. Native only in practice: web has
 *    no `ErrorUtils`, and there the render path (`ErrorBoundary`) is what reports.
 * 2. Keeps the last route PATTERN (`expense/[id]`, never the resolved path) for
 *    the report, through the navigation ref's listener — which never re-renders
 *    the host, the only shape allowed near `RootNavigator`.
 *
 * The handler is never uninstalled and the last route is never cleared on
 * unmount: a render crash unmounts `RootNavigator`, and both must outlive it
 * (only the listener goes away).
 */
export function useClientErrorReporting(): void {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    installGlobalErrorHandler(errorUtils, reportClientError);
  }, []);

  useEffect(() => {
    const record = () => setClientErrorRoute(navigationRef.getCurrentRoute()?.name);
    record();
    return navigationRef.addListener('state', record);
  }, [navigationRef]);
}
