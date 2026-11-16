import { SMALL_BODY_PATHS, smallBodyLimit } from './small-body-limit';

describe('smallBodyLimit (ABA-809)', () => {
  it('covers sign-in and every inbound webhook', () => {
    expect(SMALL_BODY_PATHS).toEqual(
      expect.arrayContaining(['/api/v1/auth', '/webhooks/stripe', '/telegram/webhook', '/whatsapp/webhook', '/slack/events', '/slack/interactivity']),
    );
  });

  it('refuses a declared body over the limit before reading it', () => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    smallBodyLimit(10)({ headers: { 'content-length': '11' } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(next).not.toHaveBeenCalled();
  });
});
