import { ArgumentsHost, Catch, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AdminGateway } from '../../modules/admin/admin.gateway';

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(@Optional() private readonly adminGateway?: AdminGateway | null) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500 && !isExpectedUnavailable(exception)) {
      reportServerError(exception, status, host.switchToHttp().getRequest(), this.adminGateway);
    }

    super.catch(exception, host);
  }
}

/**
 * A 503 the public API / OAuth server raise on purpose when Redis is briefly unreachable (rate-limit
 * counter, authorization code read): `{error:{code:'unavailable'}}` on /public/v1 and the RFC 6749
 * `{error:'temporarily_unavailable'}` on /oauth/token. The caller is told to retry; reporting each one
 * would flood Sentry during a Redis blip that already shows up elsewhere. Duck-typed on the body so
 * this common filter does not import feature modules.
 */
export function isExpectedUnavailable(exception: unknown): boolean {
  if (!(exception instanceof HttpException) || exception.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) return false;
  const body = exception.getResponse() as { error?: unknown } | string;
  if (typeof body !== 'object' || body === null) return false;
  if (body.error === 'temporarily_unavailable') return true;
  return typeof body.error === 'object' && body.error !== null && (body.error as { code?: unknown }).code === 'unavailable';
}

type ReportedRequest = { method?: string; url?: string; user?: { id?: string } } | undefined;

/**
 * 5xx reporting shared by every exception filter: Sentry capture (user id + method/url context)
 * and the live admin error feed. A controller-scoped filter (e.g. the public API's) replaces the
 * global one for its routes, so it must call this to keep 5xx visibility.
 */
export function reportServerError(
  exception: unknown,
  status: number,
  req: ReportedRequest,
  adminGateway?: AdminGateway | null,
): void {
  Sentry.withScope((scope) => {
    if (req?.user?.id) {
      scope.setUser({ id: req.user.id });
    }
    if (req?.method && req?.url) {
      scope.setContext('request', { method: req.method, url: req.url });
    }
    Sentry.captureException(exception);
  });
  emitToAdmin(exception, status, req, adminGateway);
}

/** Live admin feed. No PII: route without query string, status, truncated message, no stack. */
function emitToAdmin(exception: unknown, status: number, req: ReportedRequest, adminGateway?: AdminGateway | null) {
  try {
    const raw = exception instanceof Error ? exception.message : String(exception);
    const route = `${req?.method ?? ''} ${(req?.url ?? '').split('?')[0]}`.trim();
    adminGateway?.emitError({
      message: `${status} ${route}: ${raw}`.slice(0, 200),
      timestamp: new Date().toISOString(),
    });
  } catch {
    // never let the admin feed affect error handling
  }
}
