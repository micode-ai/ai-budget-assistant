import { createHash } from 'crypto';

/** What is stored per field (ABA-832). The DTO's transport ceiling is wider on purpose. */
export const CLIENT_ERROR_LIMITS = {
  platform: 16,
  appVersion: 32,
  message: 1000,
  stack: 8000,
  componentStack: 8000,
  route: 200,
  locale: 10,
} as const;

const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Strips what must never be stored from free text a client sent: bearer
 * tokens, bare JWTs and e-mail addresses. A render error's message can quote a
 * value from the screen, and a request error can quote a header.
 */
export function redactClientText(text: string): string {
  return text
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(JWT_RE, '[jwt]')
    .replace(EMAIL_RE, '[email]');
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * The first line of a stack that is a frame rather than the "Error: message"
 * header. V8/Hermes frames start with `at `; JSC/Firefox frames are
 * `fn@file:line:col`. Falls back to the first non-empty line.
 */
export function firstStackFrame(stack: string): string {
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const frame = lines.find((l) => l.startsWith('at ') || /^[^\s(]*@\S+:\d+/.test(l));
  return frame ?? lines[0] ?? '';
}

/** sha1(message + first stack frame): one bug → one fingerprint, across users and sessions. */
export function clientErrorFingerprint(message: string, stack: string): string {
  return createHash('sha1')
    .update(`${message}\n${firstStackFrame(stack)}`)
    .digest('hex');
}

/** Escape for Telegram `parse_mode: HTML` — an error message routinely contains `<`. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
