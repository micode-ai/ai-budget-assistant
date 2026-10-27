import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AccountRoleGuard } from '../accounts/guards/account-role.guard';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { CacheService } from '../../common/cache/cache.service';

const passThrough: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'user-1' };
    req.accountId = 'acc-1';
    req.accountRole = 'owner';
    return true;
  },
};

describe('CategoriesController - server-owned key fields through the real ValidationPipe', () => {
  let app: INestApplication;
  const stored = { id: 'k1', accountId: 'acc-1', name: 'Groceries', type: 'expense', systemKey: 'groceries', isDeleted: false };
  const prisma = {
    category: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...stored, ...data })),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data })),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmbeddingService, useValue: { embedAndStore: jest.fn().mockResolvedValue(undefined) } },
        { provide: CacheService, useValue: { delByPrefix: jest.fn().mockResolvedValue(undefined) } },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue(passThrough)
      .overrideGuard(AccountContextGuard).useValue(passThrough)
      .overrideGuard(AccountRoleGuard).useValue(passThrough)
      .compile();
    app = moduleRef.createNestApplication();
    // Same options as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => {
    prisma.category.findFirst.mockReset().mockResolvedValue(stored);
    prisma.category.update.mockClear();
    prisma.category.create.mockClear();
  });

  it('PATCH with systemKey/nameCustomized succeeds and leaves the key unchanged', async () => {
    const res = await request(app.getHttpServer())
      .patch('/categories/k1')
      .send({ color: '#000', systemKey: 'alcohol', nameCustomized: true });
    expect(res.status).toBe(200);
    const data = prisma.category.update.mock.calls[0][0].data;
    expect(data).toEqual({ color: '#000' });
    expect(res.body.systemKey).toBe('groceries');
  });

  it('POST with systemKey succeeds and the stored key comes from the catalog, not the body', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Piwo', type: 'expense', systemKey: 'alcohol', nameCustomized: true });
    expect(res.status).toBe(201);
    expect(prisma.category.create.mock.calls[0][0].data.systemKey).toBeNull();
    expect(prisma.category.create.mock.calls[0][0].data.nameCustomized).toBeUndefined();
  });
});
