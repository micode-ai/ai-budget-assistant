import { SupportTelegramController } from './support-telegram.controller';

describe('SupportTelegramController', () => {
  let service: { verifySecret: jest.Mock; handleUpdate: jest.Mock };
  let cache: { setIfAbsentStrict: jest.Mock };
  let controller: SupportTelegramController;
  const res = () => ({ sendStatus: jest.fn() });
  const req = (body: unknown = { update_id: 1 }) => ({ headers: { 'x-telegram-bot-api-secret-token': 's' }, body }) as never;

  beforeEach(() => {
    service = { verifySecret: jest.fn().mockReturnValue(true), handleUpdate: jest.fn().mockResolvedValue(undefined) };
    cache = { setIfAbsentStrict: jest.fn().mockResolvedValue(true) };
    controller = new SupportTelegramController(service as never, cache as never);
  });

  it('answers 403 on a bad secret and does nothing else', async () => {
    service.verifySecret.mockReturnValue(false);
    const r = res();
    await controller.handleWebhook(req(), r as never);
    expect(r.sendStatus).toHaveBeenCalledWith(403);
    expect(service.handleUpdate).not.toHaveBeenCalled();
  });

  it('answers 200 before handling resolves', async () => {
    let finish!: () => void;
    service.handleUpdate.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const r = res();
    const p = controller.handleWebhook(req(), r as never);
    await new Promise((x) => setImmediate(x));
    expect(r.sendStatus).toHaveBeenCalledWith(200);
    expect(service.handleUpdate).toHaveBeenCalledTimes(1);
    finish();
    await p;
  });

  it('handles a duplicate update_id once', async () => {
    cache.setIfAbsentStrict.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await controller.handleWebhook(req(), res() as never);
    await controller.handleWebhook(req(), res() as never);
    expect(cache.setIfAbsentStrict).toHaveBeenCalledWith('support-tg:update:1', 86400);
    expect(service.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it('still handles the update when Redis errors', async () => {
    cache.setIfAbsentStrict.mockRejectedValue(new Error('redis down'));
    await controller.handleWebhook(req(), res() as never);
    expect(service.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it('swallows a handler failure (already acked)', async () => {
    service.handleUpdate.mockRejectedValue(new Error('boom'));
    const r = res();
    await expect(controller.handleWebhook(req(), r as never)).resolves.toBeUndefined();
    expect(r.sendStatus).toHaveBeenCalledWith(200);
  });
});
