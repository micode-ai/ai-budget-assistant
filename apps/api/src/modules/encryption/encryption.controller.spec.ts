import { EncryptionController } from './encryption.controller';

/**
 * ABA-807: every account route checks the caller's access to the account in the
 * PATH before the service runs — the X-Account-Id header can name another account.
 */
describe('EncryptionController — path account access (ABA-807)', () => {
  const req: any = { user: { id: 'u1' } };
  const denied = new Error('Not a member of this account');
  let service: any;
  let controller: EncryptionController;

  beforeEach(() => {
    service = {
      assertAccountAccess: jest.fn().mockRejectedValue(denied),
      enableAccountEncryption: jest.fn(), getAccountKey: jest.fn(), getAccountEncryptionStatus: jest.fn(),
      grantKey: jest.fn(), getPendingGrants: jest.fn(), rotateAccountKey: jest.fn(), getMemberPublicKeys: jest.fn(),
    };
    controller = new EncryptionController(service);
  });

  const owner: [string, () => Promise<unknown>, string][] = [
    ['enable', () => controller.enableAccountEncryption(req, 'v', {} as any), 'enableAccountEncryption'],
    ['grant-key', () => controller.grantKey(req, 'v', {} as any), 'grantKey'],
    ['pending-grants', () => controller.getPendingGrants(req, 'v'), 'getPendingGrants'],
    ['rotate-key', () => controller.rotateAccountKey(req, 'v', {} as any), 'rotateAccountKey'],
  ];
  const member: [string, () => Promise<unknown>, string][] = [
    ['key', () => controller.getAccountKey(req, 'v'), 'getAccountKey'],
    ['status', () => controller.getAccountEncryptionStatus(req, 'v'), 'getAccountEncryptionStatus'],
    ['public-keys', () => controller.getMemberPublicKeys(req, 'v'), 'getMemberPublicKeys'],
  ];

  it.each(owner)('%s requires the owner role on the path account and stops when refused', async (_n, call, method) => {
    await expect(call()).rejects.toBe(denied);
    expect(service.assertAccountAccess).toHaveBeenCalledWith('v', 'u1', 'owner');
    expect(service[method]).not.toHaveBeenCalled();
  });

  it.each(member)('%s requires membership of the path account and stops when refused', async (_n, call, method) => {
    await expect(call()).rejects.toBe(denied);
    expect(service.assertAccountAccess).toHaveBeenCalledWith('v', 'u1');
    expect(service[method]).not.toHaveBeenCalled();
  });
});
