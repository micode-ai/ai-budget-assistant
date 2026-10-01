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

    if (status >= 500) {
      const ctx = host.switchToHttp();
      const req = ctx.getRequest<{ method?: string; url?: string; user?: { id?: string } }>();
      Sentry.withScope((scope) => {
        if (req?.user?.id) {
          scope.setUser({ id: req.user.id });
        }
        if (req?.method && req?.url) {
          scope.setContext('request', { method: req.method, url: req.url });
        }
        Sentry.captureException(exception);
      });
      this.emitToAdmin(exception, status, req);
    }

    super.catch(exception, host);
  }

  /** Live admin feed. No PII: route without query string, status, truncated message, no stack. */
  private emitToAdmin(exception: unknown, status: number, req?: { method?: string; url?: string }) {
    try {
      const raw = exception instanceof Error ? exception.message : String(exception);
      const route = `${req?.method ?? ''} ${(req?.url ?? '').split('?')[0]}`.trim();
      this.adminGateway?.emitError({
        message: `${status} ${route}: ${raw}`.slice(0, 200),
        timestamp: new Date().toISOString(),
      });
    } catch {
      // never let the admin feed affect error handling
    }
  }
}
