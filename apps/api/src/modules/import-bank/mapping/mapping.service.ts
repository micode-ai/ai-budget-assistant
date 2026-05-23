import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  CreateCsvImportMappingDto,
  CsvImportMapping,
} from '@budget/shared-types';

@Injectable()
export class MappingService {
  constructor(private readonly prisma: PrismaService) {}

  list(accountId: string) {
    return this.prisma.csvImportMapping.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByFingerprint(accountId: string, headerFingerprint: string) {
    return this.prisma.csvImportMapping.findFirst({
      where: { accountId, headerFingerprint },
    });
  }

  create(
    accountId: string,
    dto: CreateCsvImportMappingDto,
  ): Promise<CsvImportMapping> {
    return this.prisma.csvImportMapping.create({
      data: {
        accountId,
        name: dto.name,
        headerFingerprint: dto.headerFingerprint,
        bankId: dto.bankId ?? 'universal',
        mapping: dto.mapping as unknown as object,
        delimiter: dto.delimiter ?? ';',
        encoding: dto.encoding ?? 'utf-8',
        amountFormat: dto.amountFormat ?? 'polish',
        dateFormat: dto.dateFormat ?? 'auto',
      },
    }) as unknown as Promise<CsvImportMapping>;
  }

  async delete(accountId: string, id: string): Promise<void> {
    const existing = await this.prisma.csvImportMapping.findFirst({
      where: { id, accountId },
    });
    if (!existing) throw new NotFoundException('Mapping not found');
    await this.prisma.csvImportMapping.delete({ where: { id } });
  }
}
