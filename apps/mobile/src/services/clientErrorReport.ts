import type { ReportClientErrorRequest } from '@budget/shared-types';

/**
 * Pure helpers behind client error reporting (ABA-832). No React Native, no
 * network, no storage — so they are unit-testable in a repo with no renderer.
 * The wiring lives in `clientErrors.ts`.
 */

/** Mirrors the server's stored limits (`client-error.util.ts`); the server truncates again. */
export const CLIENT_ERROR_LIMITS = {
  message: 1000,
  stack: 8000,
  componentStack: 8000,
  route: 200,
  locale: 10,
} as const;

/** How much of the message the error screen shows, for a support screenshot. */
export const ERROR_SCREEN_MESSAGE_CHARS = 160;

/** At most this many distinct errors are reported per app session. */
export const MAX_REPORTS_PER_SESSION = 20;

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** `message` + `stack` out of anything that was thrown — not every throw is an `Error`. */
export function toErrorParts(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    const message = error.message || error.name || 'Error';
    return { message, stack: typeof error.stack === 'string' ? error.stack : '' };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, stack } = error as { message?: unknown; stack?: unknown };
    return {
      message: String(message ?? 'Unknown error'),
      stack: typeof stack === 'string' ? stack : '',
    };
  }
  try {
    return { message: typeof error === 'string' ? error : JSON.stringify(error) ?? 'Unknown error', stack: '' };
  } catch {
    return { message: 'Unknown error', stack: '' };
  }
}

/**
 * The first frame of a stack, skipping the "Error: message" header. Same rule
 * as the server's `firstStackFrame`: V8/Hermes frames start with `at `,
 * JSC/Firefox frames are `fn@file:line:col`.
 */
export function firstStackFrame(stack: string): string {
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const frame = lines.find((l) => l.startsWith('at ') || /^[^\s(]*@\S+:\d+/.test(l));
  return frame ?? lines[0] ?? '';
}

/**
 * The client's dedupe key: the same two inputs the server hashes into its
 * fingerprint, left unhashed — this one never leaves the device.
 */
export function errorKey(message: string, stack: string): string {
  return `${message}\n${firstStackFrame(stack)}`;
}

/**
 * A once-per-session gate: `true` the first time a key is seen, `false` after,
 * and `false` for everything once `max` distinct keys have been let through —
 * so a render loop, or a cascade of distinct errors, cannot flood the API.
 */
export function createSessionDedupe(max = MAX_REPORTS_PER_SESSION): (key: string) => boolean {
  const seen = new Set<string>();
  return (key: string) => {
    if (seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    return true;
  };
}

/** The short line under the error screen's subtitle. Empty when there is nothing useful. */
export function shortErrorMessage(error: unknown, max = ERROR_SCREEN_MESSAGE_CHARS): string {
  const { message } = toErrorParts(error);
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export interface ClientErrorContext {
  platform: string;
  appVersion: string;
  route?: string | null;
  locale?: string | null;
}

export function buildClientErrorPayload(
  parts: { message: string; stack: string },
  componentStack: string | undefined | null,
  fatal: boolean,
  ctx: ClientErrorContext,
): ReportClientErrorRequest {
  const payload: ReportClientErrorRequest = {
    platform: ctx.platform,
    appVersion: ctx.appVersion,
    message: truncate(parts.message, CLIENT_ERROR_LIMITS.message),
    fatal,
  };
  if (parts.stack) payload.stack = truncate(parts.stack, CLIENT_ERROR_LIMITS.stack);
  if (componentStack) {
    payload.componentStack = truncate(componentStack, CLIENT_ERROR_LIMITS.componentStack);
  }
  if (ctx.route) payload.route = truncate(ctx.route, CLIENT_ERROR_LIMITS.route);
  if (ctx.locale) payload.locale = truncate(ctx.locale, CLIENT_ERROR_LIMITS.locale);
  return payload;
}
