import { Test } from '@nestjs/testing';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthService } from '../auth/auth.service';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { RestoreCredentialsService } from './restore-credentials.service';

// A real Play/debug fingerprint is 32 bytes printed as colon-separated hex —
// the same one Task 1's config spec uses.
const FINGERPRINT =
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:' +
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';

describe('RestoreCredentialsService — registration', () => {
  let service: RestoreCredentialsService;
  let prisma: any;
  let cache: any;
  let auth: any;

  beforeEach(async () => {
    process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS = FINGERPRINT;

    prisma = { restoreCredential: { create: jest.fn(), deleteMany: jest.fn() } };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    auth = { buildAuthResponse: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RestoreCredentialsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(RestoreCredentialsService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS;
  });

  it('caches the issued challenge under the user key', async () => {
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-1' });

    await service.getRegistrationOptions('u1', 'a@b.c');

    expect(cache.set).toHaveBeenCalledWith('restorecred:reg:u1', 'chal-1', 300);
  });

  it('stores the credential when verification succeeds', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
      },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(prisma.restoreCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        credentialId: 'cred-1',
        counter: 0,
      }),
    });
    expect(cache.del).toHaveBeenCalledWith('restorecred:reg:u1');
  });

  it('rejects when no challenge was issued', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('rejects and stores nothing when the library says unverified', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({ verified: false });

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('passes both the rp id and every expected origin to the verifier', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: 'c', publicKey: new Uint8Array(), counter: 0 } },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'chal-1',
        expectedRPID: 'ai-budget.pl',
        expectedOrigin: expect.arrayContaining([expect.stringContaining('android:apk-key-hash:')]),
      }),
    );
  });
});

describe('RestoreCredentialsService — fails closed when unconfigured', () => {
  let service: RestoreCredentialsService;
  let prisma: any;
  let cache: any;
  let auth: any;

  beforeEach(async () => {
    delete process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS;

    prisma = { restoreCredential: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    auth = { buildAuthResponse: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RestoreCredentialsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(RestoreCredentialsService);

    jest.clearAllMocks();
  });

  it('does not throw during construction when the env var is missing', () => {
    expect(service).toBeDefined();
  });

  it('rejects getRegistrationOptions with ServiceUnavailableException', async () => {
    await expect(service.getRegistrationOptions('u1', 'a@b.c')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(generateRegistrationOptions).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('still allows deleteForUser — sign-out cleanup must not depend on config', async () => {
    await service.deleteForUser('u1');

    expect(prisma.restoreCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
