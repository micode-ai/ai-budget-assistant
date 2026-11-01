import {
  ArgumentMetadata,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { IsNumber, IsString } from 'class-validator';
import { ViewerBlockGuard } from '../../accounts/guards/account-role.guard';
import { TripArchivedGuard } from '../../accounts/guards/trip-archived.guard';
import { PublicApiError } from '../public-api-error';
import { PublicApiExceptionFilter } from './public-api-exception.filter';

jest.mock('@sentry/node', () => {
  const scope = { setUser: jest.fn(), setContext: jest.fn() };
  return {
    __scope: scope,
    withScope: (cb: (s: unknown) => void) => cb(scope),
    captureException: jest.fn(),
  };
});

function harness() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const req = { method: 'GET', url: '/public/v1/expenses?cursor=abc', user: { id: 'user-1' } };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any;
  return { res, req, host };
}

function run(exception: unknown, gateway?: { emitError: jest.Mock }) {
  const { res, host } = harness();
  new PublicApiExceptionFilter(gateway as any).catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
}

function ctxFor(req: object) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

class Dto {
  @IsNumber()
  amount!: number;

  @IsString()
  description!: string;
}

describe('PublicApiExceptionFilter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes a PublicApiError through with its status, code, message and details', () => {
    const out = run(new PublicApiError(403, 'insufficient_scope', 'Missing scope', { required: ['expenses:write'] }));
    expect(out).toEqual({
      status: 403,
      body: { error: { code: 'insufficient_scope', message: 'Missing scope', details: { required: ['expenses:write'] } } },
    });
  });

  it('omits details when there are none', () => {
    expect(run(new PublicApiError(401, 'invalid_token', 'Invalid token')).body).toEqual({
      error: { code: 'invalid_token', message: 'Invalid token' },
    });
  });

  it('turns a real ValidationPipe failure into validation_failed with details.fields per property', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    const meta: ArgumentMetadata = { type: 'body', metatype: Dto };
    const err = await pipe.transform({ amount: 'x', description: 'ok', nope: 1 }, meta).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);

    const out = run(err);
    expect(out.status).toBe(400);
    expect(out.body.error.code).toBe('validation_failed');
    expect(out.body.error.details.fields).toEqual({
      amount: ['amount must be a number conforming to the specified constraints'],
      nope: ['property nope should not exist'],
    });
  });

  it('maps a plain 400 (e.g. ParseUUIDPipe) to validation_failed without fields', () => {
    const out = run(new BadRequestException('Validation failed (uuid is expected)'));
    expect(out).toEqual({ status: 400, body: { error: { code: 'validation_failed', message: 'Validation failed (uuid is expected)' } } });
  });

  it("maps ViewerBlockGuard's real 403 to viewer_read_only", () => {
    let err: unknown;
    try {
      new ViewerBlockGuard().canActivate(ctxFor({ accountRole: 'viewer' }));
    } catch (e) {
      err = e;
    }
    expect(run(err)).toEqual({ status: 403, body: { error: { code: 'viewer_read_only', message: expect.any(String) } } });
  });

  it("maps TripArchivedGuard's real 403 to trip_archived", async () => {
    const prisma = { account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: 'archived' }) } };
    const err = await new TripArchivedGuard(prisma as any).canActivate(ctxFor({ accountId: 'a' })).catch((e) => e);
    expect(run(err)).toEqual({ status: 403, body: { error: { code: 'trip_archived', message: expect.any(String) } } });
  });

  it('maps other HttpExceptions by status', () => {
    expect(run(new NotFoundException('Expense not found')).body).toEqual({ error: { code: 'not_found', message: 'Expense not found' } });
    expect(run(new UnauthorizedException()).body.error.code).toBe('invalid_token');
    expect(run(new ForbiddenException('nope')).body.error.code).toBe('forbidden');
    expect(run(new ConflictException('dup')).body.error.code).toBe('conflict');
    expect(run(new HttpException('slow', 429)).body.error.code).toBe('rate_limited');
  });

  it('genericises the message of every non-PublicApiError 5xx (toPublicError)', () => {
    expect(run(new HttpException('redis at 10.0.0.5 refused', 503))).toEqual({
      status: 503,
      body: { error: { code: 'unavailable', message: 'Temporarily unavailable' } },
    });
    expect(run(new HttpException('upstream db host x', 502))).toEqual({
      status: 502,
      body: { error: { code: 'internal_error', message: 'Internal server error' } },
    });
    expect(run(new HttpException({ message: 'pool exhausted' }, 504)).body.error.message).toBe('Internal server error');
    // a PublicApiError keeps its own message
    expect(run(new PublicApiError(503, 'unavailable', 'Try again shortly')).body.error.message).toBe('Try again shortly');
  });

  it('answers an unknown error with a generic 500 internal_error, never leaking its message, and reports it to Sentry', () => {
    const gw = { emitError: jest.fn() };
    const boom = new Error('relation "secret_table" does not exist');
    const out = run(boom, gw);
    expect(out).toEqual({ status: 500, body: { error: { code: 'internal_error', message: 'Internal server error' } } });
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
    expect((Sentry as any).__scope.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(gw.emitError).toHaveBeenCalledTimes(1);
    expect(gw.emitError.mock.calls[0][0].message).toContain('500 GET /public/v1/expenses');
    expect(gw.emitError.mock.calls[0][0].message).not.toContain('cursor');
  });

  it('reports an unexpected 5xx HttpException to Sentry too', () => {
    const err = new HttpException('bad gateway', 502);
    run(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('does not report the expected 503 unavailable (a Redis blip) to Sentry or the admin feed', () => {
    const gw = { emitError: jest.fn() };
    const out = run(new PublicApiError(503, 'unavailable', 'Temporarily unavailable'), gw);
    expect(out.status).toBe(503);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(gw.emitError).not.toHaveBeenCalled();
  });

  it('does not report 4xx to Sentry', () => {
    run(new NotFoundException());
    run(new PublicApiError(401, 'invalid_token', 'x'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('survives an absent admin gateway', () => {
    expect(() => run(new Error('x'))).not.toThrow();
  });
});
