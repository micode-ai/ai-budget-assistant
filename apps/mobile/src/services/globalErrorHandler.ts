/**
 * Wraps React Native's global JS error handler so an uncaught error is reported
 * (ABA-832) before the previous handler runs. Pure over its inputs so it can be
 * tested without React Native; `useClientErrorReporting` passes the real
 * `ErrorUtils` and `reportClientError`.
 */

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

export interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler | undefined;
  setGlobalHandler(handler: GlobalHandler): void;
}

type Reporter = (input: { error: unknown; fatal: boolean }) => Promise<void>;

/**
 * How long a FATAL error waits for its report before the previous handler runs.
 * In a release build that handler kills the process, so without a short wait
 * the request would never leave the device — which is the one report we most
 * need. A non-fatal error does not wait.
 */
export const FATAL_REPORT_WAIT_MS = 1500;

let installed = false;

/** For tests only. */
export function resetGlobalErrorHandlerForTests(): void {
  installed = false;
}

/**
 * Idempotent and never undone: a render crash unmounts the component that
 * installed it, and the handler must outlive that. Returns whether it installed.
 */
export function installGlobalErrorHandler(
  errorUtils: ErrorUtilsLike | undefined,
  report: Reporter,
  fatalWaitMs = FATAL_REPORT_WAIT_MS,
): boolean {
  if (installed || !errorUtils) return false;
  installed = true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const fatal = isFatal === true;
    let sent: Promise<void> = Promise.resolve();
    try {
      sent = report({ error, fatal }).catch(() => undefined);
    } catch {
      // A reporter bug must never stop the original handler from running.
    }

    if (!fatal) {
      previous?.(error, isFatal);
      return;
    }

    let done = false;
    const runPrevious = () => {
      if (done) return;
      done = true;
      previous?.(error, isFatal);
    };
    setTimeout(runPrevious, fatalWaitMs);
    void sent.then(runPrevious);
  });
  return true;
}
