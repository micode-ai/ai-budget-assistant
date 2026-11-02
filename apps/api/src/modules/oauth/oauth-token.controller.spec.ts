import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import * as request from 'supertest';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../global-prefix-exclusions';
import { buildCorsDelegate } from '../../cors-options';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { OAuthTokenController } from './oauth-token.controller';
import { OAuthTokenError, OAuthTokenService } from './oauth-token.service';

/** Boots the controller the way main.ts does (parsers, prefix + exclusions, CORS, global ValidationPipe). */
describe('OAuthTokenController (HTTP)', () => {
  let app: INestApplication;
  let enabled = 'true';
  const svc = { token: jest.fn(), revoke: jest.fn() };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [OAuthTokenController],
      providers: [
        PublicApiEnabledGuard,
        { provide: OAuthTokenService, useValue: svc },
        { provide: ConfigService, useValue: { get: () => enabled } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.enableCors(buildCorsDelegate({ origin: ['https://admin.ai-budget.pl'], credentials: true }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    enabled = 'true';
    svc.token.mockReset();
    svc.revoke.mockReset();
  });

  it('passes a form body with library extras straight to the service (no ValidationPipe 400), no-store headers', async () => {
    svc.token.mockResolvedValue({ access_token: 'aba_at_x', token_type: 'Bearer' });
    const res = await request(app.getHttpServer())
      .post('/oauth/token')
      .set('Authorization', 'Basic YTpi')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'c', client_secret: 'b', some_extra: '1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: 'aba_at_x', token_type: 'Bearer' });
    expect(svc.token).toHaveBeenCalledWith(
      { grant_type: 'authorization_code', code: 'c', client_secret: 'b', some_extra: '1' },
      'Basic YTpi',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('serialises account_ids, and account_id only when the service sets it', async () => {
    const base = { access_token: 'aba_at_x', token_type: 'Bearer', expires_in: 3600, refresh_token: 'aba_rt_x', scope: 'expenses:read' };
    svc.token.mockResolvedValueOnce({ ...base, account_ids: ['acc-a', 'acc-b'] });
    const multi = await request(app.getHttpServer()).post('/oauth/token').type('form').send({ grant_type: 'refresh_token' });
    expect(multi.status).toBe(200);
    expect(Object.keys(multi.body).sort()).toEqual(['access_token', 'account_ids', 'expires_in', 'refresh_token', 'scope', 'token_type']);
    expect(multi.body.account_ids).toEqual(['acc-a', 'acc-b']);

    svc.token.mockResolvedValueOnce({ ...base, account_ids: ['acc-a'], account_id: 'acc-a' });
    const single = await request(app.getHttpServer()).post('/oauth/token').type('form').send({ grant_type: 'refresh_token' });
    expect(Object.keys(single.body).sort()).toEqual([
      'access_token',
      'account_id',
      'account_ids',
      'expires_in',
      'refresh_token',
      'scope',
      'token_type',
    ]);
    expect(single.body).toMatchObject({ account_ids: ['acc-a'], account_id: 'acc-a' });
  });

  it('accepts a JSON body too', async () => {
    svc.token.mockResolvedValue({ ok: true });
    const res = await request(app.getHttpServer()).post('/oauth/token').send({ grant_type: 'refresh_token' });
    expect(res.status).toBe(200);
    expect(svc.token).toHaveBeenCalledWith({ grant_type: 'refresh_token' }, undefined);
  });

  it('answers errors in RFC 6749 shape with no-store, and WWW-Authenticate for a failed Basic client', async () => {
    svc.token.mockRejectedValue(new OAuthTokenError('invalid_client', 'client authentication failed', 401));
    const res = await request(app.getHttpServer())
      .post('/oauth/token')
      .set('Authorization', 'Basic YTpi')
      .type('form')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_client', error_description: 'client authentication failed' });
    expect(res.headers['www-authenticate']).toBe('Basic realm="oauth"');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('adds Retry-After to slow_down', async () => {
    svc.token.mockRejectedValue(new OAuthTokenError('slow_down', 'too many', 429));
    const res = await request(app.getHttpServer()).post('/oauth/token').type('form').send({});
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('revoke returns 200 {}', async () => {
    svc.revoke.mockResolvedValue({});
    const res = await request(app.getHttpServer())
      .post('/oauth/revoke')
      .type('form')
      .send({ token: 't', token_type_hint: 'access_token' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is served without the api/v1 prefix', async () => {
    svc.token.mockResolvedValue({});
    expect((await request(app.getHttpServer()).post('/api/v1/oauth/token').send({})).status).toBe(404);
  });

  it('answers CORS with * and no credentials, preflight included, on both routes', async () => {
    for (const path of ['/oauth/token', '/oauth/revoke']) {
      const pre = await request(app.getHttpServer())
        .options(path)
        .set('Origin', 'https://third-party.example')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(pre.status).toBe(204);
      expect(pre.headers['access-control-allow-origin']).toBe('*');
      expect(pre.headers['access-control-allow-credentials']).toBeUndefined();
      expect(pre.headers['access-control-allow-headers']).toBe('authorization,content-type');
    }
    svc.token.mockResolvedValue({});
    const res = await request(app.getHttpServer())
      .post('/oauth/token')
      .set('Origin', 'https://third-party.example')
      .send({});
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('keeps the credentialed origin list for ordinary routes', async () => {
    const pre = await request(app.getHttpServer())
      .options('/api/v1/expenses')
      .set('Origin', 'https://third-party.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const own = await request(app.getHttpServer())
      .options('/api/v1/expenses')
      .set('Origin', 'https://admin.ai-budget.pl')
      .set('Access-Control-Request-Method', 'POST');
    expect(own.headers['access-control-allow-origin']).toBe('https://admin.ai-budget.pl');
    expect(own.headers['access-control-allow-credentials']).toBe('true');
  });

  it('404s while PUBLIC_API_ENABLED is off', async () => {
    enabled = 'false';
    expect((await request(app.getHttpServer()).post('/oauth/token').send({})).status).toBe(404);
    expect((await request(app.getHttpServer()).post('/oauth/revoke').send({})).status).toBe(404);
    expect(svc.token).not.toHaveBeenCalled();
  });
});
