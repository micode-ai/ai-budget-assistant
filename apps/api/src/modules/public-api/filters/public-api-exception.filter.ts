import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Optional } from '@nestjs/common';
import type { Response } from 'express';
import { isExpectedUnavailable, reportServerError } from '../../../common/filters/sentry-exception.filter';
import { AdminGateway } from '../../admin/admin.gateway';
import { PublicApiError, type PublicApiErrorBody, type PublicApiErrorCode } from '../public-api-error';

/** Exact messages of the app's own write guards, reused unchanged on public write routes. */
const VIEWER_BLOCK_MESSAGE = 'Viewers cannot modify data';
const TRIP_ARCHIVED_MESSAGE = 'This trip is archived and can no longer be modified';

const CODE_BY_STATUS: Record<number, PublicApiErrorCode> = {
  400: 'validation_failed',
  401: 'invalid_token',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  503: 'unavailable',
};

const GENERIC_500 = 'Internal server error';
const GENERIC_503 = 'Temporarily unavailable';

/**
 * Turns everything a `/public/v1` route throws into `{ error: { code, message, details? } }`.
 *
 * Applied with `@UseFilters(PublicApiExceptionFilter)` on public controllers ONLY — never globally,
 * the app's own routes keep Nest's shape. A controller-scoped filter replaces the global
 * `SentryExceptionFilter` for its routes, so 5xx are reported here through the same
 * `reportServerError` (Sentry + admin live feed), except the expected 503 `unavailable`. A 5xx's own
 * message is never sent to the caller unless it is a PublicApiError.
 */
@Catch()
export class PublicApiExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly adminGateway?: AdminGateway | null) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const { status, body } = toPublicError(exception);

    if (status >= 500 && !isExpectedUnavailable(exception)) {
      reportServerError(exception, status, http.getRequest(), this.adminGateway);
    }

    res.status(status).json(body);
  }
}

export function toPublicError(exception: unknown): { status: number; body: PublicApiErrorBody } {
  if (exception instanceof PublicApiError) {
    return { status: exception.getStatus(), body: exception.toBody() };
  }
  if (!(exception instanceof HttpException)) {
    return { status: 500, body: errorBody('internal_error', GENERIC_500) };
  }

  const status = exception.getStatus();
  const raw = exception.getResponse();
  const rawMessage = typeof raw === 'string' ? raw : (raw as { message?: unknown })?.message;

  if (status === 400 && Array.isArray(rawMessage)) {
    return {
      status,
      body: errorBody('validation_failed', 'The request is invalid.', { fields: groupByField(rawMessage.map(String)) }),
    };
  }

  const message = typeof rawMessage === 'string' && rawMessage ? rawMessage : exception.message;
  if (status === 403 && message === VIEWER_BLOCK_MESSAGE) {
    return { status, body: errorBody('viewer_read_only', 'The connected user can only view this account.') };
  }
  if (status === 403 && message === TRIP_ARCHIVED_MESSAGE) {
    return { status, body: errorBody('trip_archived', 'This trip is archived and can no longer be modified.') };
  }
  // Only a PublicApiError (returned above) chooses its own 5xx message; any other server error's
  // message may carry hosts, SQL or library internals, so the caller gets a fixed text.
  if (status >= 500) {
    return status === 503
      ? { status, body: errorBody('unavailable', GENERIC_503) }
      : { status, body: errorBody('internal_error', GENERIC_500) };
  }

  const code = CODE_BY_STATUS[status] ?? 'bad_request';
  return { status, body: errorBody(code, message) };
}

function errorBody(code: PublicApiErrorCode, message: string, details?: Record<string, unknown>): PublicApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/**
 * class-validator messages start with the property path (`amount must be …`, `items.0.name must …`);
 * `forbidNonWhitelisted` says `property extra should not exist`.
 */
function groupByField(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of messages) {
    const field = /^property (\S+) should not exist$/.exec(m)?.[1] ?? m.split(' ')[0] ?? '_';
    (out[field] ??= []).push(m);
  }
  return out;
}
