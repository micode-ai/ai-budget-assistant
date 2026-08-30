import { HttpException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
import { promises as dnsPromises } from 'dns';

// Critical auth paths: password reset code flow and in-memory rate limiting.
// The rate-limit Map lives on the AuthService instance, so a fresh service is
// created for each describe block that needs a clean counter.

function makeService() {
  const usersService: any = {
    findByEmail: jest.fn(),
    findByGoogleId: jest.fn(),
    findById: jest.fn(),
    updatePasswordReset: jest.fn().mockResolvedValue(undefined),
    updateEmailVerification: jest.fn().mockResolvedValue(undefined),
    updateEmailChange: jest.fn().mockResolvedValue(undefined),
    updateLastSync: jest.fn().mockResolvedValue(undefined),
    update: jest.fn(),
    create: jest.fn(),
  };
  const accountsService: any = {
    createDefaultAccount: jest.fn(),
    findAllForUser: jest.fn().mockResolvedValue([]),
  };
  const telegramService: any = {
    notifyNewUser: jest.fn(),
  };
  const mailService: any = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService: any = {
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
    verify: jest.fn(),
  };
  const configService: any = {
    get: jest.fn((key: string, def?: string) => def ?? 'secret'),
  };
  const adminGateway: any = {
    emitNewUser: jest.fn(),
  };
  const referralsService: any = {
    applyReferralCode: jest.fn().mockResolvedValue(undefined),
  };

  const googleVerifier: any = {
    verify: jest.fn(),
  };

  const service = new AuthService(
    usersService,
    accountsService,
    telegramService,
    mailService,
    jwtService,
    configService,
    adminGateway,
    referralsService,
    googleVerifier,
  );

  return { service, usersService, accountsService, mailService, jwtService, googleVerifier };
}

describe('AuthService — forgotPassword', () => {
  it('returns a non-enumerable success message when user is not found (anti-enumeration)', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const result = await service.forgotPassword('nobody@example.com');

    expect(result.message).toBe('If this email is registered, a reset code has been sent');
    // Should NOT have sent any email
  });

  it('sends reset email when user exists and is active', async () => {
    const { service, usersService, mailService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      isActive: true,
    });

    await service.forgotPassword('user@example.com');

    expect(mailService.sendMail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('password reset'),
      expect.any(String),
    );
  });

  it('enforces rate limit: throws 429 after 3 attempts within the window', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const email = 'ratelimit@example.com';
    await service.forgotPassword(email);
    await service.forgotPassword(email);
    await service.forgotPassword(email);

    await expect(service.forgotPassword(email)).rejects.toThrow(HttpException);
  });

  it('does not throw on the first 3 calls within the window', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const email = 'ok@example.com';
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
  });
});

describe('AuthService — resetPassword', () => {
  it('throws BadRequestException when user is not found', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.resetPassword('nobody@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when reset code is missing', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    });

    await expect(service.resetPassword('u@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when reset code is expired', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'hash',
      passwordResetExpiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(service.resetPassword('u@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when code hash does not match', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'stored-hash',
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);

    await expect(service.resetPassword('u@example.com', 'wrong', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates the password and clears the code when everything is valid', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'stored-hash',
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('new-hash' as never);

    const result = await service.resetPassword('u@example.com', '123456', 'newPass1!');

    expect(result.message).toBe('Password reset successfully');
    expect(usersService.updatePasswordReset).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        passwordResetCode: null,
        passwordResetExpiresAt: null,
      }),
    );
  });
});

describe('AuthService — login', () => {
  it('throws UnauthorizedException when user is not found', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when password is wrong', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      isVerified: true,
      passwordHash: 'hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);

    await expect(service.login({ email: 'u@x.com', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when account is deactivated', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: false,
      isVerified: true,
      passwordHash: 'hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    await expect(service.login({ email: 'u@x.com', password: 'pw' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns empty tokens for an unverified user so the app can redirect to verification', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      name: 'User',
      isActive: true,
      isVerified: false,
      passwordHash: 'hash',
      currencyCode: 'USD',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.accessToken).toBe('');
    expect(result.refreshToken).toBe('');
    expect(result.user.isVerified).toBe(false);
  });

  it('returns valid tokens for an active verified user', async () => {
    const { service, usersService, jwtService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      name: 'User',
      isActive: true,
      isVerified: true,
      passwordHash: 'hash',
      currencyCode: 'USD',
      defaultAccountId: 'acc-1',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.accessToken).toBeTruthy();
    expect(jwtService.signAsync).toHaveBeenCalled();
  });
});

describe('AuthService — googleLogin', () => {
  const goodPayload = {
    sub: 'google-123',
    email: 'User@Example.com',
    email_verified: true,
    name: 'Google User',
  };

  it('rejects a token whose email is not verified', async () => {
    const { service, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue({ ...goodPayload, email_verified: false });

    await expect(service.googleLogin({ idToken: 'tok' })).rejects.toThrow(UnauthorizedException);
  });

  it('signs in an existing user matched by googleId', async () => {
    const { service, usersService, jwtService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue({
      id: 'u1', email: 'user@example.com', name: 'Google User',
      isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-1',
    });

    const result = await service.googleLogin({ idToken: 'tok' });

    expect(result.accessToken).toBeTruthy();
    expect(jwtService.signAsync).toHaveBeenCalled();
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('auto-links an existing password user matched by email', async () => {
    const { service, usersService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue({
      id: 'u2', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: true, currencyCode: 'USD',
    });
    usersService.update.mockResolvedValue({
      id: 'u2', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-2',
    });

    const result = await service.googleLogin({ idToken: 'tok' });

    expect(usersService.update).toHaveBeenCalledWith('u2', expect.objectContaining({ googleId: 'google-123' }));
    expect(usersService.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe('u2');
  });

  it('creates a new verified user with defaults when no match exists', async () => {
    const { service, usersService, accountsService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'u3', email: 'user@example.com', name: 'Google User', isActive: true, isVerified: true, currencyCode: 'USD',
    });
    accountsService.createDefaultAccount.mockResolvedValue({ id: 'acc-3' });

    const result = await service.googleLogin({ idToken: 'tok', language: 'pl' });

    expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      googleId: 'google-123',
      isVerified: true,
    }));
    expect(accountsService.createDefaultAccount).toHaveBeenCalled();
    expect(result.accessToken).toBeTruthy();
    expect(result.user.defaultAccountId).toBe('acc-3');
  });

  it('marks an auto-linked unverified user as verified', async () => {
    const { service, usersService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue({
      id: 'u4', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: false, currencyCode: 'USD',
    });
    usersService.update.mockResolvedValue({
      id: 'u4', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-4',
    });

    await service.googleLogin({ idToken: 'tok' });

    expect(usersService.update).toHaveBeenCalledWith('u4', expect.objectContaining({ googleId: 'google-123', isVerified: true }));
  });

  it('rejects a deactivated account on auto-link and does not link it', async () => {
    const { service, usersService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue({
      id: 'u5', email: 'user@example.com', name: 'Deactivated', isActive: false, isVerified: true, currencyCode: 'USD',
    });

    await expect(service.googleLogin({ idToken: 'tok' })).rejects.toThrow(UnauthorizedException);
    expect(usersService.update).not.toHaveBeenCalled();
  });
});

describe('AuthService — login passwordless guard', () => {
  it('directs Google-only accounts to Google sign-in', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1', email: 'g@x.com', isActive: true, isVerified: true, passwordHash: null,
    });

    await expect(service.login({ email: 'g@x.com', password: 'pw' })).rejects.toThrow(
      'Use Google sign-in for this account',
    );
  });
});

describe('AuthService — changeEmailRequest passwordless guard', () => {
  it('rejects email change for a Google-only account (no password)', async () => {
    const { service, usersService } = makeService();
    usersService.findById.mockResolvedValue({
      id: 'u1', email: 'g@x.com', isActive: true, passwordHash: null,
    });

    await expect(
      service.changeEmailRequest('u1', { newEmail: 'new@x.com', currentPassword: 'x' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

// Regression guard for a class of bug this codebase has hit before: a user-level
// preference field readable from getProfile but missing from one of the auth
// response `user` blocks — appears after a profile fetch, vanishes after a fresh
// login/register/refresh. Every response `user` block that echoes back user fields
// (register, login x2, googleLogin, verifyEmail) must carry paymentMethod/paymentHandle.
describe('AuthService — auth responses carry paymentMethod/paymentHandle', () => {
  it('register(): included in the response user block', async () => {
    const { service, usersService, accountsService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'u1', email: 'new@x.com', name: 'New', isVerified: false, currencyCode: 'USD',
      themeMode: 'system', accentColor: null,
      paymentMethod: 'blik', paymentHandle: '+48 123 456 789',
    });
    accountsService.createDefaultAccount.mockResolvedValue({ id: 'acc-1' });

    // register() calls dnsPromises.resolveMx internally to verify the email domain;
    // stub it so the test doesn't depend on real DNS resolution.
    jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValueOnce([{ exchange: 'mx.x.com', priority: 10 }] as never);

    const result = await service.register({
      email: 'new@x.com', password: 'pw', name: 'New', currencyCode: 'USD',
    } as any);

    expect(result.user.paymentMethod).toBe('blik');
    expect(result.user.paymentHandle).toBe('+48 123 456 789');
  });

  it('login(): unverified-path response includes the fields', async () => {
    const { service, usersService, accountsService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1', email: 'u@x.com', name: 'User', isActive: true, isVerified: false,
      passwordHash: 'hash', currencyCode: 'USD',
      themeMode: 'system', accentColor: null,
      paymentMethod: 'revolut', paymentHandle: '@myhandle',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);
    accountsService.findAllForUser.mockResolvedValue([{ id: 'acc-1', type: 'personal' }]);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.user.paymentMethod).toBe('revolut');
    expect(result.user.paymentHandle).toBe('@myhandle');
  });

  it('login(): verified-path response includes the fields', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1', email: 'u@x.com', name: 'User', isActive: true, isVerified: true,
      passwordHash: 'hash', currencyCode: 'USD', defaultAccountId: 'acc-1',
      themeMode: 'system', accentColor: null,
      paymentMethod: 'paypal', paymentHandle: 'user@paypal.com',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.user.paymentMethod).toBe('paypal');
    expect(result.user.paymentHandle).toBe('user@paypal.com');
  });

  it('googleLogin(): response includes the fields', async () => {
    const { service, usersService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue({
      sub: 'google-123', email: 'user@example.com', email_verified: true, name: 'Google User',
    });
    usersService.findByGoogleId.mockResolvedValue({
      id: 'u1', email: 'user@example.com', name: 'Google User',
      isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-1',
      themeMode: 'system', accentColor: null,
      paymentMethod: 'cash', paymentHandle: null,
    });

    const result = await service.googleLogin({ idToken: 'tok' });

    expect(result.user.paymentMethod).toBe('cash');
    expect(result.user.paymentHandle).toBeNull();
  });

  it('verifyEmail(): response includes the fields', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1', email: 'u@x.com', name: 'User', isVerified: false,
      emailVerificationCode: 'stored-hash',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      currencyCode: 'USD', defaultAccountId: 'acc-1',
      themeMode: 'system', accentColor: null,
      paymentMethod: 'other', paymentHandle: 'some-handle',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.verifyEmail('u@x.com', '123456');

    expect(result.user.paymentMethod).toBe('other');
    expect(result.user.paymentHandle).toBe('some-handle');
  });
});

// buildAuthResponse is the single place a signed-in session is assembled — the
// restore-credential login (a later task) must return exactly what this produces,
// so googleLogin is refactored to delegate to it rather than assembling its own
// response inline. No makeUser helper exists in this file; build the object
// inline, matching the shape the neighbouring googleLogin tests already use.
describe('AuthService — buildAuthResponse', () => {
  it('returns tokens, the user block and the account list', async () => {
    const { service, accountsService } = makeService();
    const user: any = {
      id: 'u1', email: 'a@b.c', name: 'User', isActive: true, isVerified: true,
      currencyCode: 'USD', defaultAccountId: 'acc-1',
      themeMode: 'system', accentColor: null,
      paymentMethod: null, paymentHandle: null,
    };
    accountsService.findAllForUser.mockResolvedValue([{ id: 'acc1' }]);

    const res = await service.buildAuthResponse(user);

    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.refreshToken).toEqual(expect.any(String));
    expect(res.user.id).toBe('u1');
    expect(res.user.isVerified).toBe(true);
    expect(res.accounts).toEqual([{ id: 'acc1' }]);
  });

  it('prefers an explicit default account id over the stored one', async () => {
    const { service, accountsService } = makeService();
    const user: any = {
      id: 'u1', email: 'a@b.c', name: 'User', isActive: true, isVerified: true,
      currencyCode: 'USD', defaultAccountId: null,
      themeMode: 'system', accentColor: null,
      paymentMethod: null, paymentHandle: null,
    };
    accountsService.findAllForUser.mockResolvedValue([]);

    const res = await service.buildAuthResponse(user, 'fresh-acc');

    expect(res.user.defaultAccountId).toBe('fresh-acc');
  });
});
