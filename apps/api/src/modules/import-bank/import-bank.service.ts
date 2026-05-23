import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { PrismaService } from '../../database/prisma.service';
import { MappingService } from './mapping/mapping.service';
import { decodeCsvBuffer, type EncodingHint } from './utils/encoding';
import { headerFingerprint } from './utils/header-fingerprint';
import { pairFxRows } from './utils/fx-pairing';
import { PARSERS, getParserById, detectParser } from './parsers/registry';
import type { BankParser } from './parsers/parser.interface';
import type {
  BankImportPreviewResponse,
  BankImportCommitResponse,
  ImportRow,
} from '@budget/shared-types';
import type { BankImportCommitBodyDto } from './dto';

export interface PreviewOptions {
  bankId?: BankParser['id'];
  mappingId?: string;
  encoding?: EncodingHint;
  inlineMapping?: import('@budget/shared-types').ColumnMapping;
  delimiter?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

@Injectable()
export class ImportBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapping: MappingService,
  ) {}

  async parsePreview(
    accountId: string,
    _userId: string,
    fileBuffer: Buffer,
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    let text: string;
    try {
      text = decodeCsvBuffer(fileBuffer, opts.encoding ?? 'auto');
    } catch {
      throw new BadRequestException({ code: 'ENCODING_UNKNOWN' });
    }

    const headers = peekHeaders(text);
    const sampleRows = peekSampleRows(text, 3);
    const fingerprint = headerFingerprint(headers);

    let parser: BankParser | undefined;
    let columnMapping: import('@budget/shared-types').ColumnMapping | undefined;

    if (opts.mappingId) {
      const saved = await this.prisma.csvImportMapping.findFirst({
        where: { id: opts.mappingId, accountId },
      });
      if (!saved) throw new BadRequestException('Mapping not found');
      parser =
        getParserById((saved.bankId ?? 'universal') as BankParser['id']) ??
        getParserById('universal');
      columnMapping = saved.mapping as unknown as import('@budget/shared-types').ColumnMapping;
    } else if (opts.bankId) {
      parser = getParserById(opts.bankId);
      if (!parser) throw new BadRequestException('Unknown bankId');
    } else {
      const saved = await this.mapping.findByFingerprint(accountId, fingerprint);
      if (saved) {
        parser =
          getParserById((saved.bankId ?? 'universal') as BankParser['id']) ??
          getParserById('universal');
        columnMapping = saved.mapping as unknown as import('@budget/shared-types').ColumnMapping;
      } else {
        parser = detectParser(headers, sampleRows);
      }
    }

    if (opts.inlineMapping) {
      parser = getParserById('universal')!;
      columnMapping = opts.inlineMapping;
    }

    if (!parser) {
      return {
        status: 'needs_picker',
        headers,
        sampleRows,
        headerFingerprint: fingerprint,
        supportedBanks: PARSERS.map((p) => ({ id: p.id, displayName: p.displayName })),
      };
    }

    let parsed: ReturnType<BankParser['parse']>;
    try {
      parsed = parser.parse(text, {
        columnMapping,
        delimiter: opts.delimiter,
        amountFormat: opts.amountFormat,
        dateFormat: opts.dateFormat,
      });
    } catch (e: any) {
      throw new BadRequestException({ code: 'PARSE_FAILED', message: e.message });
    }

    const parseErrors = countParseFailures(text, parsed.rows.length);
    const withRefs: ImportRow[] = parsed.rows.map((r) => ({
      ...r,
      externalRef: buildExternalRef(parser!.id, r),
      alreadyImported: false,
    }));

    const paired = pairFxRows(withRefs, parser.id);

    const refs = paired.map((r) => r.externalRef);
    const [exExp, exInc, exFx] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
    ]);

    const seen = new Set([
      ...exExp.map((e) => e.externalRef!),
      ...exInc.map((e) => e.externalRef!),
      ...exFx.map((e) => e.externalRef!),
    ]);
    for (const r of paired) {
      if (seen.has(r.externalRef)) r.alreadyImported = true;
    }

    return {
      status: 'parsed',
      detectedBankId: parser.id,
      totalRows: paired.length,
      importable: paired.filter((r) => !r.alreadyImported).length,
      skipped: paired.filter((r) => r.alreadyImported).length,
      parseErrors,
      rows: paired,
      headerFingerprint: fingerprint,
    };
  }

  async commit(
    accountId: string,
    userId: string,
    dto: BankImportCommitBodyDto,
  ): Promise<BankImportCommitResponse> {
    const toImport = dto.rows.filter((r) => !r.alreadyImported);
    let createdExpenses = 0;
    let createdIncomes = 0;
    let createdExchanges = 0;
    let skippedDuplicates = 0;

    const categoryCache = new Map<string, string | null>();

    await this.prisma.$transaction(async (tx) => {
      for (const row of toImport) {
        try {
          if (row.kind === 'expense') {
            const categoryId = await this.resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
            );
            await (tx as any).expense.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                date: new Date(row.date),
                source: 'import',
                externalRef: row.externalRef,
                ...(categoryId ? { categoryId } : {}),
              },
            });
            createdExpenses++;
          } else if (row.kind === 'income') {
            const categoryId = await this.resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
            );
            await (tx as any).income.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                date: new Date(row.date),
                externalRef: row.externalRef,
                ...(categoryId ? { categoryId } : {}),
              },
            });
            createdIncomes++;
          } else if (row.kind === 'fx') {
            await (tx as any).currencyExchange.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                fromCurrency: row.fxFromCurrency!,
                toCurrency: row.fxToCurrency!,
                fromAmount: row.fxFromAmount!,
                toAmount: row.fxToAmount!,
                exchangeRate: row.fxRate ?? 0,
                date: new Date(row.date),
                externalRef: row.externalRef,
              },
            });
            createdExchanges++;
          }
        } catch (err: any) {
          if (err?.code === 'P2002') {
            skippedDuplicates++;
            continue;
          }
          throw err;
        }
      }
    });

    let savedMappingId: string | undefined;
    if (dto.saveMapping && dto.mapping && dto.headerFingerprint) {
      const saved = await this.mapping.create(accountId, {
        name: dto.saveMapping.name,
        headerFingerprint: dto.headerFingerprint,
        bankId: dto.bankId,
        mapping: dto.mapping,
        delimiter: dto.delimiter,
        encoding: dto.encoding,
        amountFormat: dto.amountFormat,
        dateFormat: dto.dateFormat,
      });
      savedMappingId = saved.id;
    }

    return {
      createdExpenses,
      createdIncomes,
      createdExchanges,
      skippedDuplicates,
      parseErrors: 0,
      savedMappingId,
    };
  }

  private async resolveCategoryId(
    tx: any,
    accountId: string,
    suggestedName: string | undefined,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    if (!suggestedName) return null;
    if (cache.has(suggestedName)) return cache.get(suggestedName)!;
    const cat = await tx.category.findFirst({
      where: { accountId, name: suggestedName },
      select: { id: true },
    });
    const id = cat?.id ?? null;
    cache.set(suggestedName, id);
    return id;
  }
}

function peekHeaders(text: string): string[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter: ';',
    preview: 1,
  });
  const first = result.data[0];
  return first ? first.map((h) => String(h).trim()) : [];
}

function peekSampleRows(text: string, count: number): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter: ';',
    preview: count + 1,
  });
  return result.data.slice(1).map((r) => r.map(String));
}

function buildExternalRef(
  bankId: string,
  row: { kind: string; date: string; amount: number; description: string },
): string {
  const cents = Math.round((row.kind === 'expense' ? -1 : 1) * row.amount * 100);
  const normalized = (row.description || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  const stripped = normalized.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hash = createHash('sha256').update(stripped).digest('hex').slice(0, 8);
  return `bank:${bankId}:${row.date}:${cents}:${hash}`;
}

function countParseFailures(text: string, importedCount: number): number {
  const totalRows = text.split('\n').filter((l) => l.trim().length > 0).length - 1;
  return Math.max(0, totalRows - importedCount);
}
