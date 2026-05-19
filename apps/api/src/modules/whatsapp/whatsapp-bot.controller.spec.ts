import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WhatsAppBotController } from './whatsapp-bot.controller';
import { WhatsAppBotService } from './whatsapp-bot.service';

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  return res;
}

describe('WhatsAppBotController', () => {
  let controller: WhatsAppBotController;
  let botService: { handleUpdate: jest.Mock };

  beforeEach(async () => {
    botService = { handleUpdate: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'WHATSAPP_VERIFY_TOKEN') return VERIFY_TOKEN;
        if (key === 'WHATSAPP_APP_SECRET') return APP_SECRET;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppBotController],
      providers: [
        { provide: WhatsAppBotService, useValue: botService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    controller = module.get<WhatsAppBotController>(WhatsAppBotController);
  });

  describe('GET /whatsapp/webhook (verify handshake)', () => {
    it('returns challenge when mode=subscribe and token matches', async () => {
      const res = mockRes();
      await controller.verify('subscribe', VERIFY_TOKEN, 'CHALLENGE_XYZ', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('CHALLENGE_XYZ');
    });

    it('returns 403 when token mismatches', async () => {
      const res = mockRes();
      await controller.verify('subscribe', 'wrong_token', 'X', res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when mode is not subscribe', async () => {
      const res = mockRes();
      await controller.verify('not_subscribe', VERIFY_TOKEN, 'X', res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('POST /whatsapp/webhook (signed events)', () => {
    it('returns 401 on missing rawBody', async () => {
      const res = mockRes();
      const req: any = { headers: {} };
      await controller.handle(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(botService.handleUpdate).not.toHaveBeenCalled();
    });

    it('returns 401 on bad signature', async () => {
      const res = mockRes();
      const req: any = {
        rawBody: Buffer.from('{"hello":"world"}'),
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
        body: { hello: 'world' },
      };
      await controller.handle(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(botService.handleUpdate).not.toHaveBeenCalled();
    });

    it('ACKs 200 and dispatches on valid signature', async () => {
      const res = mockRes();
      const raw = Buffer.from('{"hello":"world"}', 'utf-8');
      const sig = 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex');
      const req: any = {
        rawBody: raw,
        headers: { 'x-hub-signature-256': sig },
        body: { hello: 'world' },
      };
      await controller.handle(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      // Fire-and-forget — wait one tick for the .then/.catch microtask
      await new Promise((r) => setImmediate(r));
      expect(botService.handleUpdate).toHaveBeenCalledWith({ hello: 'world' });
    });
  });
});
