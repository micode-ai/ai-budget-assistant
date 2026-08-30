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

    prisma = {
      restoreCredential: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    prisma.restoreCredential.findUnique.mockResolvedValue(null);
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
    // The challenge is consumed by the atomic getAndDelete above — there is
    // no separate `del` call left on the happy path any more.
    expect(cache.getAndDelete).toHaveBeenCalledWith('restorecred:reg:u1');
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('rejects when no challenge was issued', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue(null);

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('rejects and stores nothing when the library says unverified', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
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
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockRejectedValue(
      new Error('bad attestation object'),
    );

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('passes both the rp id and every expected origin to the verifier', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    prisma.restoreCredential.findUnique.mockResolvedValue(null);
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

  // The challenge is consumed before verification, exactly like the
  // authentication half — a failed registration attempt must not leave the
  // challenge sitting in Redis, live and retryable, for the rest of its TTL.
  // Pinned two ways, mirroring the authentication describe block below: the
  // atomic method is what actually consumes it, and its call demonstrably
  // precedes the verification call.
  it('consumes the registration challenge atomically, before verification, so a failed attempt cannot retry against the same challenge', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({ verified: false });

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(cache.getAndDelete).toHaveBeenCalledWith('restorecred:reg:u1');
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();

    const consumeOrder = (cache.getAndDelete as jest.Mock).mock.invocationCallOrder[0];
    const verifyOrder = (verifyRegistrationResponse as jest.Mock).mock.invocationCallOrder[0];
    expect(consumeOrder).toBeLessThan(verifyOrder);
  });

  // ABA-316's "server-side create idempotency" rule: stage 2 registers on
  // launch whenever the device is already signed in behind a local flag, so a
  // lost flag / reinstall / sign-out-then-sign-in on the same device all
  // re-present the SAME credential id. A bare `create` would violate the
  // `@unique` on `credentialId` with P2002 and turn an ordinary retry into an
  // HTTP 500.
  it('updates the existing row instead of creating a duplicate when the same user re-registers the same credential id', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row-1',
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: Buffer.from([9]),
      counter: 3,
      transports: [],
    });
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 5,
          transports: ['internal'],
        },
      },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
    expect(prisma.restoreCredential.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ counter: 5 }),
    });
  });

  it('rejects re-registering a credential id that already belongs to a DIFFERENT user, and never reassigns it', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row-1',
      userId: 'someone-else',
      credentialId: 'cred-1',
      publicKey: Buffer.from([9]),
      counter: 3,
      transports: [],
    });
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-1', publicKey: new Uint8Array([1]), counter: 0, transports: [] },
      },
    });

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.update).not.toHaveBeenCalled();
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('re-resolves via findUnique and updates when a concurrent registration wins the create race (P2002)', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('chal-1');
    prisma.restoreCredential.findUnique
      .mockResolvedValueOnce(null) // pre-check: nothing there yet
      .mockResolvedValueOnce({
        // re-check after the concurrent winner's create committed
        id: 'row-1',
        userId: 'u1',
        credentialId: 'cred-1',
        publicKey: Buffer.from([9]),
        counter: 0,
        transports: [],
      });
    prisma.restoreCredential.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-1', publicKey: new Uint8Array([1]), counter: 2, transports: [] },
      },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(prisma.restoreCredential.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ counter: 2 }),
    });
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

    // A distinctive, unlikely-to-appear-by-coincidence value: several other
    // fixtures in this file use [1,2,3]-style bytes, and the whole point of
    // the "pins the verifier's credential argument" test below is that it
    // could NOT pass by accidentally matching some other buffer.
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1',
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: Buffer.from([42, 42, 42, 42, 42]),
      counter: 0,
      transports: [],
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      isActive: true,
      isVerified: true,
    });
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

  // Mirrors the registration side's "passes the locked-down registration
  // options to the library" test — pins the actual values so a future edit
  // that "corrects" one of them (e.g. adds a real allowCredentials list, or
  // flips userVerification) breaks this test instead of silently shipping.
  it('passes the locked-down authentication options to the library', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-9' });

    await service.getAuthenticationOptions();

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'ai-budget.pl',
        allowCredentials: [],
        userVerification: 'discouraged',
      }),
    );
  });

  // Nothing else in this file pins what is actually handed to the
  // cryptographic verifier. A regression that sourced the public key/counter
  // from the REQUEST instead of the stored database row would verify every
  // forged assertion — a complete authentication bypass — and every other
  // test in this suite would still pass, because they only assert the
  // RESULT (accepted/rejected), never the arguments that produced it.
  it('pins that verifyAuthenticationResponse is called with the STORED credential row\'s public key and counter, plus the expected challenge/RP/origin', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({});

    await service.verifyAuthentication(assertion('chal-9'));

    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'chal-9',
        expectedRPID: 'ai-budget.pl',
        expectedOrigin: expect.arrayContaining([expect.stringContaining('android:apk-key-hash:')]),
        credential: expect.objectContaining({
          id: 'cred-1',
          publicKey: new Uint8Array([42, 42, 42, 42, 42]),
          counter: 0,
        }),
      }),
    );
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
  // by a presented 0 must be ACCEPTED (login succeeds), not treated as a
  // clone signal — pinned here so a future edit to the counter guard cannot
  // silently reverse that. But accepting the login is a different decision
  // from what gets PERSISTED: writing the presented 0 verbatim would zero out
  // the stored high-water mark and permanently disarm the
  // `stored.counter > 0` guard, so a LATER genuine regression (say 7 -> 4)
  // would sail through unnoticed forever. The stored counter must therefore
  // stay at its high-water mark (5), not drop to 0.
  it('accepts a zero count from a credential that previously reported a non-zero one, but persists the counter HIGH-WATER MARK (5), not the presented 0', async () => {
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
      data: expect.objectContaining({ counter: 5 }),
    });
  });

  // Complements the case above: when the presented count DOES advance past
  // the stored high-water mark, the new (higher) value is what gets stored —
  // Math.max is not a no-op that pins the counter at its first-ever value.
  it('persists the presented counter when it genuinely advances past the stored high-water mark', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1', userId: 'u1', credentialId: 'cred-1',
      publicKey: Buffer.from([1]), counter: 5, transports: [],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 9 },
    });
    auth.buildAuthResponse.mockResolvedValue({});

    await expect(service.verifyAuthentication(assertion('chal-9'))).resolves.toBeDefined();

    expect(prisma.restoreCredential.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: expect.objectContaining({ counter: 9 }),
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
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.c', isActive: false, isVerified: true,
    });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.buildAuthResponse).not.toHaveBeenCalled();
  });

  // Restore is the one login path that mints a full session unconditionally
  // (no password, no OTP) — defence in depth, matching the same check
  // googleLogin already applies. Unreachable today (registration and Google
  // both require a verified account before a restore credential could exist),
  // but a route this privileged should not rely on that staying true forever.
  it('refuses an unverified account', async () => {
    (cache.getAndDelete as jest.Mock).mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.c', isActive: true, isVerified: false,
    });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.buildAuthResponse).not.toHaveBeenCalled();
  });
});
