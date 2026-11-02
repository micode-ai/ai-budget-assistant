import { HttpException } from '@nestjs/common';

/**
 * Stable machine codes of the `/public/v1` error body `{ error: { code, message, details? } }`.
 * Integrators branch on these, so a shipped code is permanent: add new ones, never rename.
 * The array is also the `code` enum of the published OpenAPI error schema.
 */
export const PUBLIC_API_ERROR_CODES = [
  'invalid_token',
  'grant_inactive',
  'account_encrypted',
  'insufficient_scope',
  'rate_limited',
  'unavailable',
  'validation_failed',
  'viewer_read_only',
  'trip_archived',
  'not_found',
  'conflict',
  'forbidden',
  'method_not_allowed',
  'payload_too_large',
  'bad_request',
  'internal_error',
  'invalid_cursor',
  'idempotency_key_conflict',
  'account_required',
  'account_not_granted',
] as const;
export type PublicApiErrorCode = (typeof PUBLIC_API_ERROR_CODES)[number];

export interface PublicApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * The one error type public-API code throws. It IS an `HttpException`, so even a route that
 * somehow lost `@UseFilters(PublicApiExceptionFilter)` still answers with the right status and
 * the `{error:{…}}` body (the default handler serialises `getResponse()`), never a 500.
 */
export class PublicApiError extends HttpException {
  constructor(
    status: number,
    readonly code: PublicApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    const body: PublicApiErrorBody = { error: details ? { code, message, details } : { code, message } };
    super(body, status);
    this.message = message;
    this.name = 'PublicApiError';
  }

  toBody(): PublicApiErrorBody {
    return this.getResponse() as PublicApiErrorBody;
  }
}
