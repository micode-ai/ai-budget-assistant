import { Logger } from '@nestjs/common';

/**
 * Returns a `.catch()` handler for a fire-and-forget promise so a rejection
 * is logged instead of silently swallowed. Always `.warn` (never `.error`) —
 * a fire-and-forget side effect failing (Redis down, FCM misconfigured, a
 * transient DB error) is an expected, non-fatal outcome, mirroring the
 * mobile ABA-157 convention for the identical pattern.
 */
export function logFireAndForget(logger: Logger, context: string): (err: unknown) => void {
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`${context} failed: ${message}`);
  };
}
