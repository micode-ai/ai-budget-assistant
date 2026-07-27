import { BadRequestException, INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { WhatsAppLinkService } from '../whatsapp/whatsapp-link.service';
import { SlackLinkService } from '../slack/slack-link.service';

function makeController(update = jest.fn()) {
  const usersService = {
    update,
    findById: jest.fn(),
    updateLastSync: jest.fn().mockResolvedValue(null),
  } as any;
  const controller = new UsersController(
    usersService,
    {} as any, // telegramLinkService
    {} as any, // telegramBotService
    {} as any, // whatsAppLinkService
    {} as any, // slackLinkService
  );
  return { controller, usersService, update };
}

const req = { user: { id: 'u1' } } as any;

describe('UsersController.updateProfile theme prefs', () => {
  it('rejects an invalid accentColor', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { accentColor: 'red' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid themeMode', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { themeMode: 'blue' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid themeMode + accentColor and returns them', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'dark', accentColor: '#AABBCC',
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(update).toHaveBeenCalledWith('u1', { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(res.themeMode).toBe('dark');
    expect(res.accentColor).toBe('#AABBCC');
  });

  it('accepts accentColor null (reset to default)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { accentColor: null });
    expect(update).toHaveBeenCalledWith('u1', { accentColor: null });
    expect(res.accentColor).toBeNull();
  });
});

describe('UsersController.updateProfile payment handle', () => {
  it('rejects an invalid paymentMethod', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { paymentMethod: 'venmo' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed paymentHandle (disallowed characters)', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { paymentHandle: '<script>alert(1)</script>' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid paymentMethod + paymentHandle (BLIK phone number with + and space) and returns them', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: 'blik', paymentHandle: '+48 123 456 789',
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { paymentMethod: 'blik', paymentHandle: '+48 123 456 789' });
    expect(update).toHaveBeenCalledWith('u1', { paymentMethod: 'blik', paymentHandle: '+48 123 456 789' });
    expect(res.paymentMethod).toBe('blik');
    expect(res.paymentHandle).toBe('+48 123 456 789');
  });

  it('clears paymentMethod and paymentHandle via explicit null', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: null, paymentHandle: null,
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { paymentMethod: null, paymentHandle: null });
    expect(update).toHaveBeenCalledWith('u1', { paymentMethod: null, paymentHandle: null });
    expect(res.paymentMethod).toBeNull();
    expect(res.paymentHandle).toBeNull();
  });

  it('leaves paymentMethod/paymentHandle untouched when absent from the body (distinct from explicit null)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: 'revolut', paymentHandle: '@existing-handle',
    });
    const { controller } = makeController(update);
    // body has no paymentMethod/paymentHandle keys at all — must not be forwarded as null
    await controller.updateProfile(req, { name: 'New Name' });
    expect(update).toHaveBeenCalledWith('u1', { name: 'New Name' });
    const forwarded = update.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty('paymentMethod');
    expect(forwarded).not.toHaveProperty('paymentHandle');
  });
});

describe('UsersController.getProfile payment handle', () => {
  it('returns the stored paymentMethod/paymentHandle', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      aiResponseMode: 'balanced', aiModel: 'balanced', contributeCommunityPrices: false,
      themeMode: 'system', accentColor: null, createdAt: new Date('2026-01-01'),
      paymentMethod: 'paypal', paymentHandle: 'user@paypal.com',
    });
    const getPaymentMethods = jest.fn().mockResolvedValue([]);
    const usersService = { findById, updateLastSync: jest.fn().mockResolvedValue(null), getPaymentMethods } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.getProfile(req);
    expect(res.paymentMethod).toBe('paypal');
    expect(res.paymentHandle).toBe('user@paypal.com');
  });

  it('returns null paymentMethod/paymentHandle when never set', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      aiResponseMode: 'balanced', aiModel: 'balanced', contributeCommunityPrices: false,
      themeMode: 'system', accentColor: null, createdAt: new Date('2026-01-01'),
      paymentMethod: null, paymentHandle: null,
    });
    const getPaymentMethods = jest.fn().mockResolvedValue([]);
    const usersService = { findById, updateLastSync: jest.fn().mockResolvedValue(null), getPaymentMethods } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.getProfile(req);
    expect(res.paymentMethod).toBeNull();
    expect(res.paymentHandle).toBeNull();
  });

  it('includes the ordered paymentMethods list from UsersService.getPaymentMethods', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      aiResponseMode: 'balanced', aiModel: 'balanced', contributeCommunityPrices: false,
      themeMode: 'system', accentColor: null, createdAt: new Date('2026-01-01'),
      paymentMethod: null, paymentHandle: null,
    });
    const getPaymentMethods = jest.fn().mockResolvedValue([
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'blik', handle: '+48 123 456 789' },
    ]);
    const usersService = { findById, updateLastSync: jest.fn().mockResolvedValue(null), getPaymentMethods } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.getProfile(req);
    expect(getPaymentMethods).toHaveBeenCalledWith('u1');
    expect(res.paymentMethods).toEqual([
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'blik', handle: '+48 123 456 789' },
    ]);
  });
});

describe('UsersController.replacePaymentMethods', () => {
  it('delegates to UsersService.replacePaymentMethods with the caller id and returns the resulting list', async () => {
    const replacePaymentMethods = jest.fn().mockResolvedValue([
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'paypal', handle: 'pp-handle' },
    ]);
    const usersService = { replacePaymentMethods } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);

    const res = await controller.replacePaymentMethods(req, {
      paymentMethods: [
        { method: 'revolut', handle: 'rev-handle' } as any,
        { method: 'paypal', handle: 'pp-handle' } as any,
      ],
    });

    expect(replacePaymentMethods).toHaveBeenCalledWith('u1', [
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'paypal', handle: 'pp-handle' },
    ]);
    expect(res).toEqual({
      paymentMethods: [
        { method: 'revolut', handle: 'rev-handle' },
        { method: 'paypal', handle: 'pp-handle' },
      ],
    });
  });

  it('accepts an empty list (clears every configured method)', async () => {
    const replacePaymentMethods = jest.fn().mockResolvedValue([]);
    const usersService = { replacePaymentMethods } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);

    const res = await controller.replacePaymentMethods(req, { paymentMethods: [] });

    expect(replacePaymentMethods).toHaveBeenCalledWith('u1', []);
    expect(res).toEqual({ paymentMethods: [] });
  });
});

/**
 * Real `ValidationPipe` (mirrors main.ts + the precedent in expenses.controller.spec.ts)
 * so `ReplaceUserPaymentMethodsDto`'s class-validator decorators actually run — an inline
 * TS type has no decorators and the pipe would silently pass anything through, which is
 * exactly the gap this DTO exists to close. `UsersService` is a bare jest mock; only
 * routing + validation are under test here, not persistence.
 */
describe('PUT /users/me/payment-methods — DTO validation (real ValidationPipe)', () => {
  let app: INestApplication;
  const usersService = {
    replacePaymentMethods: jest.fn().mockResolvedValue([{ method: 'revolut', handle: 'rev-handle' }]),
  };

  const passThroughGuard: CanActivate = {
    canActivate: (ctx: ExecutionContext) => {
      const httpReq = ctx.switchToHttp().getRequest();
      httpReq.user = { id: 'user-1' };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: TelegramLinkService, useValue: {} },
        { provide: TelegramBotService, useValue: {} },
        { provide: WhatsAppLinkService, useValue: {} },
        { provide: SlackLinkService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      // ThrottlerGuard and AccountContextGuard are used on other routes in this same
      // controller (search, telegram/whatsapp/slack link-code) and Nest needs to
      // resolve them when building the controller even though this suite never calls
      // those routes — this minimal test module has neither ThrottlerModule nor
      // PrismaService wired up, so override both with a trivial pass-through, same
      // precedent as TripArchivedGuard in expenses.controller.spec.ts.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AccountContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('happy path: a valid list of distinct methods with valid handles returns 200', async () => {
    const res = await request(app.getHttpServer())
      .put('/users/me/payment-methods')
      .send({ paymentMethods: [{ method: 'revolut', handle: 'rev-handle' }, { method: 'blik', handle: '+48 123 456 789' }] });

    expect(res.status).toBe(200);
    expect(usersService.replacePaymentMethods).toHaveBeenCalledWith('user-1', [
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'blik', handle: '+48 123 456 789' },
    ]);
  });

  it('rejects more than 5 entries', async () => {
    const paymentMethods = [
      { method: 'revolut', handle: 'h1' },
      { method: 'paypal', handle: 'h2' },
      { method: 'blik', handle: 'h3' },
      { method: 'cash', handle: 'h4' },
      { method: 'other', handle: 'h5' },
      // A 6th entry has no 6th SettleMethod value to use without repeating one, but the
      // ArrayMaxSize check must fire before ArrayUnique ever looks at the values.
      { method: 'revolut', handle: 'h6' },
    ];
    const res = await request(app.getHttpServer()).put('/users/me/payment-methods').send({ paymentMethods });

    expect(res.status).toBe(400);
    expect(usersService.replacePaymentMethods).not.toHaveBeenCalled();
  });

  it('rejects a duplicate method', async () => {
    const res = await request(app.getHttpServer())
      .put('/users/me/payment-methods')
      .send({ paymentMethods: [{ method: 'revolut', handle: 'h1' }, { method: 'revolut', handle: 'h2' }] });

    expect(res.status).toBe(400);
    expect(usersService.replacePaymentMethods).not.toHaveBeenCalled();
  });

  it('rejects a malformed handle (disallowed characters)', async () => {
    const res = await request(app.getHttpServer())
      .put('/users/me/payment-methods')
      .send({ paymentMethods: [{ method: 'revolut', handle: '<script>alert(1)</script>' }] });

    expect(res.status).toBe(400);
    expect(usersService.replacePaymentMethods).not.toHaveBeenCalled();
  });

  it('rejects an unknown method value', async () => {
    const res = await request(app.getHttpServer())
      .put('/users/me/payment-methods')
      .send({ paymentMethods: [{ method: 'venmo', handle: 'h1' }] });

    expect(res.status).toBe(400);
    expect(usersService.replacePaymentMethods).not.toHaveBeenCalled();
  });

  it('accepts an empty array — clears the list', async () => {
    usersService.replacePaymentMethods.mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer()).put('/users/me/payment-methods').send({ paymentMethods: [] });

    expect(res.status).toBe(200);
    expect(usersService.replacePaymentMethods).toHaveBeenCalledWith('user-1', []);
  });
});
