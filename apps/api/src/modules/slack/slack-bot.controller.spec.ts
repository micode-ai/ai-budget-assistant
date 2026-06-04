import { createHmac } from 'crypto';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SlackBotController } from './slack-bot.controller';
import { SlackBotService } from './slack-bot.service';

const SECRET = 'sig_secret';

function mockRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown } = {};
  res.status = ((c: number) => { res._status = c; return res as Response; }) as Response['status'];
  res.send = ((b?: unknown) => { res._body = b; return res as Response; }) as Response['send'];
  res.sendStatus = ((c: number) => { res._status = c; return res as Response; }) as Response['sendStatus'];
  return res as Response & { _status?: number; _body?: unknown };
}

function signedReq(body: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
  return {
    rawBody: Buffer.from(body),
    body: JSON.parse(body),
    headers: { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig },
  } as any;
}

describe('SlackBotController', () => {
  let controller: SlackBotController;
  let botService: { handleEvent: jest.Mock; handleInteractivity: jest.Mock };

  beforeEach(() => {
    botService = { handleEvent: jest.fn().mockResolvedValue(undefined), handleInteractivity: jest.fn().mockResolvedValue(undefined) };
    const config = { get: (k: string) => (k === 'SLACK_SIGNING_SECRET' ? SECRET : '') } as ConfigService;
    controller = new SlackBotController(botService as unknown as SlackBotService, config);
  });

  it('echoes the url_verification challenge', async () => {
    const req = signedReq(JSON.stringify({ type: 'url_verification', challenge: 'abc' }));
    const res = mockRes();
    await controller.events(req, res);
    expect(res._body).toBe('abc');
    expect(botService.handleEvent).not.toHaveBeenCalled();
  });

  it('rejects a bad signature with 401', async () => {
    const req = signedReq(JSON.stringify({ type: 'event_callback' }));
    req.headers['x-slack-signature'] = 'v0=deadbeef';
    const res = mockRes();
    await controller.events(req, res);
    expect(res._status).toBe(401);
    expect(botService.handleEvent).not.toHaveBeenCalled();
  });

  it('ACKs 200 and dispatches an event_callback', async () => {
    const req = signedReq(JSON.stringify({ type: 'event_callback', event: { type: 'message' } }));
    const res = mockRes();
    await controller.events(req, res);
    expect(res._status).toBe(200);
    expect(botService.handleEvent).toHaveBeenCalled();
  });
});
