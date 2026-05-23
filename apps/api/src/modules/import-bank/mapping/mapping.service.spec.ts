import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { MappingService } from './mapping.service';

describe('MappingService', () => {
  let service: MappingService;
  const prisma = {
    csvImportMapping: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MappingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MappingService);
  });

  it('list scopes by accountId', async () => {
    prisma.csvImportMapping.findMany.mockResolvedValue([]);
    await service.list('acc-1');
    expect(prisma.csvImportMapping.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('create persists with defaults', async () => {
    prisma.csvImportMapping.create.mockResolvedValue({ id: 'm1' });
    await service.create('acc-1', {
      name: 'My bank',
      headerFingerprint: 'abc',
      mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
    });
    expect(prisma.csvImportMapping.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acc-1',
        name: 'My bank',
        headerFingerprint: 'abc',
        bankId: 'universal',
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';',
        encoding: 'utf-8',
        amountFormat: 'polish',
        dateFormat: 'auto',
      },
    });
  });

  it('delete only deletes mapping owned by account', async () => {
    prisma.csvImportMapping.findFirst.mockResolvedValue({
      id: 'm1',
      accountId: 'acc-1',
    });
    prisma.csvImportMapping.delete.mockResolvedValue({});
    await service.delete('acc-1', 'm1');
    expect(prisma.csvImportMapping.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    });
  });

  it('delete throws NotFound when mapping not owned by account', async () => {
    prisma.csvImportMapping.findFirst.mockResolvedValue(null);
    await expect(service.delete('acc-1', 'm1')).rejects.toThrow(/not found/i);
  });
});
