import { Response } from 'express';
import { SlackOAuthController } from './slack-oauth.controller';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackInstallationService } from './slack-installation.service';

function mockRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown; _redirect?: string } = {};
  res.status = ((c: number) => { res._status = c; return res as Response; }) as Response['status'];
  res.send = ((b?: unknown) => { res._body = b; return res as Response; }) as Response['send'];
  res.redirect = ((url: string) => { res._redirect = url; }) as Response['redirect'];
  return res as Response & { _status?: number; _body?: unknown; _redirect?: string };
}

describe('SlackOAuthController', () => {
  let controller: SlackOAuthController;
  let oauth: { isConfigured: jest.Mock; buildAuthorizeUrl: jest.Mock; exchangeCode: jest.Mock };
  let installations: { upsert: jest.Mock };
  let redis: { set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    oauth = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://slack.com/oauth/v2/authorize?state=S'),
      exchangeCode: jest.fn(),
    };
    installations = { upsert: jest.fn().mockResolvedValue(undefined) };
    redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    controller = new SlackOAuthController(
      oauth as unknown as SlackOAuthService,
      installations as unknown as SlackInstallationService,
      redis as never,
    );
  });

  it('install: stores a state and redirects to the authorize URL', async () => {
    const res = mockRes();
    await controller.install(res);
    expect(redis.set).toHaveBeenCalled();
    expect(res._redirect).toBe('https://slack.com/oauth/v2/authorize?state=S');
  });

  it('callback: rejects an unknown state without upserting', async () => {
    redis.del.mockResolvedValue(0);
    const res = mockRes();
    await controller.callback('code123', 'BADSTATE', undefined, res);
    expect(res._status).toBe(400);
    expect(installations.upsert).not.toHaveBeenCalled();
  });

  it('callback: valid state exchanges the code and upserts the installation', async () => {
    redis.del.mockResolvedValue(1);
    oauth.exchangeCode.mockResolvedValue({ teamId: 'T1', teamName: 'Acme', botToken: 'xoxb-1', botUserId: 'U1' });
    const res = mockRes();
    await controller.callback('code123', 'GOODSTATE', undefined, res);
    expect(oauth.exchangeCode).toHaveBeenCalledWith('code123');
    expect(installations.upsert).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'T1', botTokenPlain: 'xoxb-1', botUserId: 'U1' }));
    expect(res._status).toBe(200);
  });

  it('callback: cancelled install (error param) returns 400 and does not upsert', async () => {
    const res = mockRes();
    await controller.callback(undefined, undefined, 'access_denied', res);
    expect(res._status).toBe(400);
    expect(installations.upsert).not.toHaveBeenCalled();
  });
});
