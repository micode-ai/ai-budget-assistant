import type { ConfigService } from '@nestjs/config';

export const INBOUND_TOKEN_PATTERN = /^[a-z2-7]{16}$/;
export const DEFAULT_INBOUND_DOMAIN = 'in.ai-budget.pl';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_RETENTION_MS = 30 * DAY_MS;
/** Tier-1 (E2EE) accounts: the readable pending copy lives for a week, not a month. */
export const TIER1_RECEIPT_RETENTION_MS = 7 * DAY_MS;
/** A Gmail forwarding code is only worth showing for 30 minutes. */
export const VERIFICATION_RETENTION_MS = 30 * 60 * 1000;
/** Shared-secret floor for the SMTP container handshake. */
export const INBOUND_SECRET_MIN_LENGTH = 32;
/** A `processing` row younger than this is still running; the requeue cron must not re-claim it. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_CHARS = 100_000;

/** Rate limits (spec "Rate limits"). Keys live under `inmail:*` in Redis. */
export const BAD_RCPT_MAX = 10;
export const BAD_RCPT_WINDOW_MS = 10 * 60 * 1000;
export const PENALTY_WINDOW_MS = 60 * 60 * 1000;
export const TOKEN_HOURLY_MAX = 20;
export const TOKEN_DAILY_MAX = 60;
export const PUSH_THROTTLE_SEC = 10 * 60;
export const QUOTA_PUSH_THROTTLE_SEC = 24 * 60 * 60;

/** The feature flag. Default OFF: anything but the literal string `true` is off. */
export function isInboundMailEnabled(config: ConfigService): boolean {
  return `${config.get<string>('INBOUND_MAIL_ENABLED') ?? ''}`.trim().toLowerCase() === 'true';
}

export function getInboundMailDomain(config: ConfigService): string {
  const raw = `${config.get<string>('INBOUND_MAIL_DOMAIN') ?? ''}`.trim().toLowerCase();
  return raw || DEFAULT_INBOUND_DOMAIN;
}
