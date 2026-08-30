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

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
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

  // These are named, locked spec decisions (attestation:'none' because trust
  // comes from the origin<->assetlinks binding, not attestation provenance;
  // userVerification:'discouraged' because no human is present during a
  // restore) — pin the actual values so a future edit that "corrects" one of
  // them breaks this test instead of silently shipping.
  it('passes the locked-down registration options to the library', async () => {
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-1' });

    await service.getRegistrationOptions('u1', 'a@b.c');

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'ai-budget.pl',
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'discouraged' },
        supportedAlgorithmIDs: [-7, -257],
      }),
    );
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

  // @simplewebauthn/server throws plain Errors for structural problems
  // (bad type, corrupted attestation object, ...) instead of returning
  // {verified: false}. This is a public route — an uncaught throw here
  // would surface as an HTTP 500, not a controlled 401.
  it('wraps a thrown verification error as an UnauthorizedException, not a 500', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockRejectedValue(
      new Error('bad attestation object'),
    );

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

describe('RestoreCredentialsService — authentication', () => {
  let service: RestoreCredentialsService;
  let prisma: any;
  let cache: any;
  let auth: any;

  const assertion = (challenge: string) => ({
    id: 'cred-1',
    response: {
      clientDataJSON: Buffer.from(JSON.stringify({ challenge })).toString('base64url'),
    },
  }) as any;

  beforeEach(async () => {
    process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS = FINGERPRINT;

    prisma = {
      restoreCredential: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), getAndDelete: jest.fn() };
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

    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1',
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', isActive: true });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    });
  });

  afterEach(() => {
    delete process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS;
  });

  it('caches the issued challenge keyed by the challenge itself', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-9' });

    await service.getAuthenticationOptions();

    expect(cache.set).toHaveBeenCalledWith('restorecred:auth:chal-9', '1', 300);
  });

  it('returns a full session for the credential owner', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const res = await service.verifyAuthentication(assertion('chal-9'));

    // Pins that the SESSION USER comes from the stored credential row's
    // userId, not from the assertion's userHandle: a bare object-shaped mock
    // would still pass this if the implementation read userHandle instead,
    // so the where clause itself is asserted, not just "was called".
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(auth.buildAuthResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
    );
    expect(res.accessToken).toBe('a');
  });

  // The challenge is consumed before verification, so a replay cannot race a
  // slow verification. Pinned two ways: the atomic method is what actually
  // consumes it (a plain get-then-del pair would leave a race window), and
  // its call demonstrably precedes the signature check, so a regression that
  // reordered "verify, then consume" would fail this test.
  it('consumes the challenge atomically, before verification, so a replay cannot race a slow signature check', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({});

    await service.verifyAuthentication(assertion('chal-9'));

    expect(cache.getAndDelete).toHaveBeenCalledWith('restorecred:auth:chal-9');
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();

    const consumeOrder = (cache.getAndDelete as jest.Mock).mock.invocationCallOrder[0];
    const verifyOrder = (verifyAuthenticationResponse as jest.Mock).mock.invocationCallOrder[0];
    expect(consumeOrder).toBeLessThan(verifyOrder);
  });

  it('rejects an assertion whose challenge was never issued', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue(null);

    await expect(service.verifyAuthentication(assertion('forged'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // @simplewebauthn/server throws plain Errors for structural problems (bad
  // type, corrupted authenticatorData, a malformed signature) instead of
  // returning {verified: false}. POST /auth/restore is a public,
  // unauthenticated route — an uncaught throw here would surface as an HTTP
  // 500 (and fill Sentry with them on malformed traffic) instead of a 401.
  it('wraps a thrown signature-verification error as an UnauthorizedException, not a 500', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    (verifyAuthenticationResponse as jest.Mock).mockRejectedValue(
      new Error('corrupted authenticatorData'),
    );

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.buildAuthResponse).not.toHaveBeenCalled();
  });

  // A system-managed restore key may legitimately always report 0. Demanding a
  // strictly increasing counter would lock out every user on every device.
  it('accepts a sign count of zero', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({});

    await expect(service.verifyAuthentication(assertion('chal-9'))).resolves.toBeDefined();
  });

  it('rejects a counter that goes backwards from a non-zero value', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1', userId: 'u1', credentialId: 'cred-1',
      publicKey: Buffer.from([1]), counter: 5, transports: [],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A restore credential's whole purpose is arriving on a NEW device with no
  // guarantee the old device's counter travelled with it. A stored 5 followed
  // by a presented 0 must be accepted, not treated as a clone signal — pinned
  // here so a future edit to the counter guard cannot silently reverse it.
  it('accepts a zero count from a credential that previously reported a non-zero one', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1', userId: 'u1', credentialId: 'cred-1',
      publicKey: Buffer.from([1]), counter: 5, transports: [],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    });
    auth.buildAuthResponse.mockResolvedValue({});

    await expect(service.verifyAuthentication(assertion('chal-9'))).resolves.toBeDefined();

    expect(prisma.restoreCredential.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: expect.objectContaining({ counter: 0 }),
    });
  });

  it('rejects an unknown credential without a 500', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue(null);

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a deactivated account', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', isActive: false });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.buildAuthResponse).not.toHaveBeenCalled();
  });
});
