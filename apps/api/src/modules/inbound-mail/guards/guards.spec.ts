import { ForbiddenException, INestApplication, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { InternalSecretGuard, buildInternalBlockList } from './internal-secret.guard';
import { InboundMailEnabledGuard } from './inbound-mail-enabled.guard';
import { InboundMailInternalController } from '../inbound-mail-internal.controller';
import { InboundMailAddressService } from '../inbound-mail-address.service';
import { InboundReceiptService } from '../inbound-receipt.service';
import { ConfigService } from '@nestjs/config';

const SECRET = 'a'.repeat(64);

const ctx = (headers: Record<string, string>, remoteAddress: string | undefined = '172.20.0.5') =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers, socket: { remoteAddress } }) }) }) as any;
const config = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as any;

describe('InternalSecretGuard', () => {
  it('accepts the exact secret from a private address', () => {
    const guard = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: SECRET }));
    expect(guard.canActivate(ctx({ 'x-inbound-secret': SECRET }))).toBe(true);
  });

  it('rejects every request when the secret is UNSET, even an empty header', () => {
    const guard = new InternalSecretGuard(config({}));
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': '' }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': 'undefined' }))).toThrow(UnauthorizedException);
  });

  it('rejects a missing header, a wrong secret and a wrong-length secret', () => {
    const guard = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: SECRET }));
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': 'b'.repeat(64) }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': 'short' }))).toThrow(UnauthorizedException);
  });

  it('rejects a request that came through the proxy (X-Forwarded-For / X-Real-IP), even with the right secret', () => {
    const guard = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: SECRET }));
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': SECRET, 'x-forwarded-for': '1.2.3.4' }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': SECRET, 'x-real-ip': '1.2.3.4' }))).toThrow(
      ForbiddenException,
    );
  });

  // M5: a secret shorter than 32 characters is a misconfiguration, so even the "right" secret is refused.
  it('refuses every request, even the exact secret, when the secret is shorter than 32 characters', () => {
    const short = 'x'.repeat(31);
    const guard = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: short }));
    expect(() => guard.canActivate(ctx({ 'x-inbound-secret': short }))).toThrow(UnauthorizedException);
    const exactly32 = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: 'x'.repeat(32) }));
    expect(exactly32.canActivate(ctx({ 'x-inbound-secret': 'x'.repeat(32) }))).toBe(true);
  });

  it('logs a startup warning for a short secret, and for an unset one only while the feature is on', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: 'short' })).onModuleInit();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
      new InternalSecretGuard(config({})).onModuleInit();
      expect(warn).not.toHaveBeenCalled();
      new InternalSecretGuard(config({ INBOUND_MAIL_ENABLED: 'true' })).onModuleInit();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
      new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: SECRET })).onModuleInit();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  describe('remote address allow-list (socket peer, never a header)', () => {
    const guard = new InternalSecretGuard(config({ INBOUND_MAIL_SHARED_SECRET: SECRET }));
    const call = (remote: string | undefined) => () => guard.canActivate(ctx({ 'x-inbound-secret': SECRET }, remote));

    it.each(['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.9', '::ffff:172.20.0.5'])('allows RFC1918 %s by default', (ip) => {
      expect(call(ip)()).toBe(true);
    });

    it.each(['203.0.113.9', '8.8.8.8', '172.32.0.1', '172.15.255.255', '127.0.0.1', '::1', '2001:db8::1', 'garbage'])(
      'refuses %s with 403 even with the right secret',
      (ip) => {
        expect(call(ip)).toThrow(ForbiddenException);
      },
    );

    it('refuses a request with no socket address at all', () => {
      const noSocket = { switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-inbound-secret': SECRET } }) }) } as any;
      expect(() => guard.canActivate(noSocket)).toThrow(ForbiddenException);
    });

    it('honours INBOUND_MAIL_INTERNAL_CIDR (comma separated, replaces the default)', () => {
      const custom = new InternalSecretGuard(
        config({ INBOUND_MAIL_SHARED_SECRET: SECRET, INBOUND_MAIL_INTERNAL_CIDR: '172.28.5.0/24, 10.9.0.0/16' }),
      );
      const ok = (ip: string) => custom.canActivate(ctx({ 'x-inbound-secret': SECRET }, ip));
      expect(ok('172.28.5.77')).toBe(true);
      expect(ok('10.9.200.1')).toBe(true);
      expect(() => ok('172.28.6.1')).toThrow(ForbiddenException);
      expect(() => ok('192.168.1.1')).toThrow(ForbiddenException);
    });

    it('falls back to the default (not to allow-all) when the configured CIDR is garbage', () => {
      const { list, invalid } = buildInternalBlockList('not-a-cidr, 1.2.3.4/99');
      expect(invalid).toEqual(['not-a-cidr', '1.2.3.4/99']);
      expect(list.check('10.0.0.1', 'ipv4')).toBe(true);
      expect(list.check('203.0.113.9', 'ipv4')).toBe(false);
    });
  });
});

describe('InternalSecretGuard on the internal controller (real HTTP routing)', () => {
  let app: INestApplication;
  const addresses = { checkRcpt: jest.fn().mockResolvedValue('accept') };
  const receipts = { ingest: jest.fn().mockResolvedValue({ id: 'r1' }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InboundMailInternalController],
      providers: [
        InternalSecretGuard,
        // supertest connects over loopback, so allow it here; the peer check itself is covered above.
        {
          provide: ConfigService,
          useValue: config({ INBOUND_MAIL_SHARED_SECRET: SECRET, INBOUND_MAIL_INTERNAL_CIDR: '127.0.0.0/8,::1/128' }),
        },
        { provide: InboundMailAddressService, useValue: addresses },
        { provide: InboundReceiptService, useValue: receipts },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // Express routing is case-insensitive, so /API/V1/INTERNAL/... reaches the same handler;
  // the class-level guard must therefore cover it too.
  it.each([
    '/api/v1/internal/inbound-mail/rcpt',
    '/API/V1/INTERNAL/INBOUND-MAIL/RCPT',
    '/api/v1/Internal/Inbound-Mail/Rcpt',
    '/api/v1/internal/inbound-mail/rcpt/',
  ])('%s never reaches the handler without the secret', async (path) => {
    const res = await request(app.getHttpServer()).post(path).send({ token: 'abcdefghijklmnop', remoteIp: '1.2.3.4' });
    expect(res.status).toBe(401);
    expect(addresses.checkRcpt).not.toHaveBeenCalled();
  });

  it.each(['/api/v1/internal/inbound-mail/messages', '/API/V1/INTERNAL/INBOUND-MAIL/MESSAGES'])(
    '%s is guarded too',
    async (path) => {
      const res = await request(app.getHttpServer()).post(path).send({});
      expect(res.status).toBe(401);
      expect(receipts.ingest).not.toHaveBeenCalled();
    },
  );

  it('a wrong secret is 401 and a proxied request is 403, before the handler', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/internal/inbound-mail/messages')
      .set('x-inbound-secret', 'b'.repeat(64))
      .send({});
    expect(wrong.status).toBe(401);
    const proxied = await request(app.getHttpServer())
      .post('/api/v1/internal/inbound-mail/messages')
      .set('x-inbound-secret', SECRET)
      .set('x-forwarded-for', '1.2.3.4')
      .send({});
    expect(proxied.status).toBe(403);
    expect(receipts.ingest).not.toHaveBeenCalled();
  });
});

describe('InboundMailEnabledGuard (INBOUND_MAIL_ENABLED, default OFF)', () => {
  it.each([undefined, '', 'false', '0', 'yes', '1'])('404s when the flag is %p', (value) => {
    const guard = new InboundMailEnabledGuard(config({ INBOUND_MAIL_ENABLED: value }));
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('passes only for the literal "true"', () => {
    expect(new InboundMailEnabledGuard(config({ INBOUND_MAIL_ENABLED: 'true' })).canActivate()).toBe(true);
    expect(new InboundMailEnabledGuard(config({ INBOUND_MAIL_ENABLED: ' TRUE ' })).canActivate()).toBe(true);
  });
});
