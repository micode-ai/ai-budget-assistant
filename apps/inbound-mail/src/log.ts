/**
 * Structured JSON logs on stdout. Never pass a message body, subject, address or
 * full token here: callers log a token hash prefix, a sender DOMAIN and sizes only.
 */
import { createHash } from 'crypto';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

function emit(level: string, msg: string, fields?: LogFields): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields })}\n`);
}

export const logger: Logger = {
  info: (m, f) => emit('info', m, f),
  warn: (m, f) => emit('warn', m, f),
  error: (m, f) => emit('error', m, f),
};

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export function tokenRef(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}
