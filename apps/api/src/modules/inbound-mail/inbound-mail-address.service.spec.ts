import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InboundMailAddressService } from './inbound-mail-address.service';

const TOKEN = 'abcdefghijklmnop';
const IP = '203.0.113.9';

function setup(flag: string | null = 'true') {
  const prisma: any = {
    inboundMailAddress: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    accountMember: { findUnique: jest.fn() },
    inboundReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const cache: any = {
    peekWindow: jest.fn().mockResolvedValue(0),
    incrementWindow: jest.fn().mockResolvedValue(1),
  };
  const config: any = {
    get: (k: string) => ({ INBOUND_MAIL_ENABLED: flag, INBOUND_MAIL_DOMAIN: 'in.example.test' })[k],
  };
  const service = new InboundMailAddressService(prisma, cache, config);
  (service as any).logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  return { prisma, cache, service };
}

const activeRow = (over: Record<string, unknown> = {}) => ({
  id: 'addr-1',
  userId: 'user-1',
  token: TOKEN,
  targetAccountId: 'acc-1',
  disabledAt: null,
  targetAccount: { encryptionTier: 0 },
  ...over,
});

describe('InboundMailAddressService.checkRcpt', () => {
  it('accepts an active token whose owner is an editor of a tier-0 account', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'editor' });

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('accept');
  });

  it('accepts tier 1 (readable pending copy expires sooner, but it is allowed)', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow({ targetAccount: { encryptionTier: 1 } }));
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'owner' });

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('accept');
  });

  it('answers unknown for everything while the flag is off, without touching Redis or the DB', async () => {
    const { prisma, cache, service } = setup(null);

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
    expect(prisma.inboundMailAddress.findUnique).not.toHaveBeenCalled();
    expect(cache.peekWindow).not.toHaveBeenCalled();
  });

  it('answers unknown for an unknown (or ROTATED-away) token and counts a bad RCPT for the IP', async () => {
    const { prisma, cache, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(null);

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
    expect(cache.incrementWindow).toHaveBeenCalledWith(`inmail:badrcpt:${IP}`, 600_000);
  });

  it('a rotated token stops resolving at once: only the new token finds a row', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockImplementation(async ({ where }: any) =>
      where.token === 'newtokennewtoken' ? activeRow({ token: 'newtokennewtoken' }) : null,
    );
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'editor' });

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
    await expect(service.checkRcpt('newtokennewtoken', IP)).resolves.toBe('accept');
  });

  it('rejects a malformed token without a DB lookup', async () => {
    const { prisma, service } = setup();

    await expect(service.checkRcpt('NOT-A-TOKEN', IP)).resolves.toBe('unknown');
    expect(prisma.inboundMailAddress.findUnique).not.toHaveBeenCalled();
  });

  it('answers unknown for a disabled address', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow({ disabledAt: new Date() }));

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
  });

  it('answers unknown when the target account moved to tier 2', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow({ targetAccount: { encryptionTier: 2 } }));

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
  });

  it.each([['viewer'], [undefined]])('answers unknown when the owner is now %p of the target account', async (role) => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
    prisma.accountMember.findUnique.mockResolvedValue(role ? { role } : null);

    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
  });

  it('answers limited at 20/hour and at 60/day', async () => {
    const { prisma, cache, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'editor' });

    cache.peekWindow.mockImplementation(async (key: string) => (key.endsWith(':h') ? 20 : 0));
    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('limited');

    cache.peekWindow.mockImplementation(async (key: string) => (key.endsWith(':d') ? 60 : 0));
    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('limited');
  });

  it('penalty box: after 10 bad RCPTs an IP reads unknown for every token, even a valid one', async () => {
    const { prisma, cache, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(null);
    cache.incrementWindow.mockResolvedValue(11);

    await service.checkRcpt(TOKEN, IP);
    expect(cache.incrementWindow).toHaveBeenCalledWith(`inmail:penalty:${IP}`, 3_600_000);

    prisma.inboundMailAddress.findUnique.mockClear();
    cache.peekWindow.mockImplementation(async (key: string) => (key.startsWith('inmail:penalty:') ? 1 : 0));
    await expect(service.checkRcpt(TOKEN, IP)).resolves.toBe('unknown');
    expect(prisma.inboundMailAddress.findUnique).not.toHaveBeenCalled();
  });

  describe('Redis down fails CLOSED (503, never accept)', () => {
    it('on the penalty/cap reads', async () => {
      const { prisma, cache, service } = setup();
      prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
      prisma.accountMember.findUnique.mockResolvedValue({ role: 'editor' });
      cache.peekWindow.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.checkRcpt(TOKEN, IP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('on the bad-RCPT counter', async () => {
      const { prisma, cache, service } = setup();
      prisma.inboundMailAddress.findUnique.mockResolvedValue(null);
      cache.incrementWindow.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.checkRcpt(TOKEN, IP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('on a database error', async () => {
      const { prisma, service } = setup();
      prisma.inboundMailAddress.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.checkRcpt(TOKEN, IP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});

describe('InboundMailAddressService (user-facing)', () => {
  it('create refuses a tier-2 target with the E2EE_UNSUPPORTED code', async () => {
    const { prisma, service } = setup();
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'owner', account: { encryptionTier: 2 } });

    const err = await service.create('acc-1', 'user-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'E2EE_UNSUPPORTED' });
    expect(prisma.inboundMailAddress.create).not.toHaveBeenCalled();
  });

  it('create is idempotent: an active address is returned as-is', async () => {
    const { prisma, service } = setup();
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'owner', account: { encryptionTier: 0 } });
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());

    const res = await service.create('acc-1', 'user-1');

    expect(res).toMatchObject({ address: `${TOKEN}@in.example.test`, targetAccountId: 'acc-1', enabled: true });
    expect(prisma.inboundMailAddress.create).not.toHaveBeenCalled();
  });

  it('create makes a 16-char [a-z2-7] token for a first-time user', async () => {
    const { prisma, service } = setup();
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'editor', account: { encryptionTier: 0 } });
    prisma.inboundMailAddress.findUnique.mockResolvedValue(null);
    prisma.inboundMailAddress.create.mockImplementation(async ({ data }: any) => ({ ...data }));

    await service.create('acc-1', 'user-1');

    expect(prisma.inboundMailAddress.create.mock.calls[0][0].data.token).toMatch(/^[a-z2-7]{16}$/);
  });

  it('setTarget requires editor+ membership in the target', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
    prisma.accountMember.findUnique.mockResolvedValue({ role: 'viewer', account: { encryptionTier: 0 } });

    await expect(service.setTarget('user-1', 'acc-2')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.accountMember.findUnique.mockResolvedValue(null);
    await expect(service.setTarget('user-1', 'acc-3')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rotate writes a new token and stamps rotatedAt; 404 without an active address', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockImplementation(async ({ where }: any) => (where.userId ? activeRow() : null));
    prisma.inboundMailAddress.update.mockImplementation(async ({ data }: any) => ({ ...activeRow(), ...data }));

    const res = await service.rotate('user-1');
    const data = prisma.inboundMailAddress.update.mock.calls[0][0].data;
    expect(data.token).toMatch(/^[a-z2-7]{16}$/);
    expect(data.token).not.toBe(TOKEN);
    expect(data.rotatedAt).toBeInstanceOf(Date);
    expect(res.address).toBe(`${data.token}@in.example.test`);

    prisma.inboundMailAddress.findUnique.mockResolvedValue(null);
    await expect(service.rotate('user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get surfaces a verification code received in the last 24 h', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow());
    prisma.inboundReceipt.findFirst.mockResolvedValue({ verificationCode: '123456789', createdAt: new Date('2026-10-09T10:00:00Z') });

    const res = await service.get('user-1');

    expect(res?.pendingVerification).toEqual({ code: '123456789', receivedAt: '2026-10-09T10:00:00.000Z' });
    const where = prisma.inboundReceipt.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.kind).toBe('forwarding_verification');
    expect(where.createdAt.gt).toBeInstanceOf(Date);
  });

  it('get returns null for a disabled or missing address; disable only touches the caller', async () => {
    const { prisma, service } = setup();
    prisma.inboundMailAddress.findUnique.mockResolvedValue(activeRow({ disabledAt: new Date() }));
    await expect(service.get('user-1')).resolves.toBeNull();

    await service.disable('user-1');
    expect(prisma.inboundMailAddress.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', disabledAt: null },
      data: { disabledAt: expect.any(Date) },
    });
  });
});
