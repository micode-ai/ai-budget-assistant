export interface InboundConfig {
  domain: string;
  hostname: string;
  secret: string;
  apiUrl: string;
  apiTimeoutMs: number;
  port: number;
  tlsCert?: string;
  tlsKey?: string;
}

export const MAX_MESSAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_INSPECTED = 10;
export const MAX_RECIPIENTS = 5;
export const MAX_HTML_INPUT_CHARS = 500_000;
export const MAX_TEXT_CHARS = 100_000;
/** Inline images under this size are tracking pixels / logos, never a receipt photo. */
export const MIN_IMAGE_BYTES = 4 * 1024;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): InboundConfig {
  const secret = (env.INBOUND_MAIL_SHARED_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('INBOUND_MAIL_SHARED_SECRET is not set; refusing to start');
  }
  const port = Number(env.PORT ?? 2525);
  return {
    domain: (env.INBOUND_MAIL_DOMAIN || 'in.ai-budget.pl').trim().toLowerCase(),
    hostname: (env.INBOUND_MAIL_HOSTNAME || 'mail-in.ai-budget.pl').trim(),
    secret,
    apiUrl: (env.API_INTERNAL_URL || 'http://api:3000/api/v1').replace(/\/+$/, ''),
    apiTimeoutMs: Number(env.API_TIMEOUT_MS ?? 10_000),
    port: Number.isInteger(port) && port > 0 ? port : 2525,
    tlsCert: env.TLS_CERT || undefined,
    tlsKey: env.TLS_KEY || undefined,
  };
}

/** Global in-flight byte budget across all sessions (raw DATA bytes held in memory). */
export const MAX_INFLIGHT_BYTES = 64 * 1024 * 1024;
/** Wall-clock cap for receiving one DATA body: a slowloris holds a slot for at most this long. */
export const DATA_TIMEOUT_MS = 60_000;
/** Deadline for the gated authenticate + parse section. */
export const PARSE_DEADLINE_MS = 25_000;
