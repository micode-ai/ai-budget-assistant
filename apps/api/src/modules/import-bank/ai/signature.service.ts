import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { ColumnMapping } from '@budget/shared-types';

export interface StoredSignature {
  mapping: ColumnMapping;
  delimiter?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  bankLabel?: string;
}

/**
 * A signature whose users correct it more often than they confirm it has
 * stopped being useful. Withdrawing it degrades to "ask the model again",
 * which is strictly better than serving a wrong mapping to everyone.
 */
export function isQuarantined(row: { confirmedCount: number; correctedCount: number }): boolean {
  return row.correctedCount > row.confirmedCount;
}

/**
 * The global statement-signature dictionary. Deliberately NOT account-scoped:
 * a row holds only column names, a delimiter and two format hints — no
 * accountId, no userId, no transaction data — so it is safe to share across
 * every account, which is what makes the second user of any bank free.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async find(headerFingerprint: string): Promise<StoredSignature | null> {
    const row = await this.prisma.bankStatementSignature.findUnique({
      where: { headerFingerprint },
    });
    if (!row) return null;
    if (isQuarantined(row)) return null;

    return {
      mapping: row.mapping as unknown as ColumnMapping,
      delimiter: row.delimiter ?? undefined,
      amountFormat: (row.amountFormat as StoredSignature['amountFormat']) ?? undefined,
      dateFormat: (row.dateFormat as StoredSignature['dateFormat']) ?? undefined,
      bankLabel: row.bankLabel ?? undefined,
    };
  }

  async record(input: {
    headerFingerprint: string;
    mapping: ColumnMapping;
    delimiter?: string;
    amountFormat?: string;
    dateFormat?: string;
    bankLabel?: string;
  }): Promise<void> {
    const shared = {
      mapping: input.mapping as unknown as object,
      delimiter: input.delimiter ?? null,
      amountFormat: input.amountFormat ?? null,
      dateFormat: input.dateFormat ?? null,
      bankLabel: input.bankLabel ?? null,
    };
    try {
      // A quarantined row is being re-recorded because inference just
      // produced a fresh mapping for the same fingerprint. Give it a clean
      // slate instead of carrying over the counts that quarantined the OLD
      // mapping — otherwise a corrected signature could never re-enter the
      // dictionary: find() would keep rejecting it forever, since nothing
      // else ever lowers correctedCount back below confirmedCount.
      const existing = await this.prisma.bankStatementSignature.findUnique({
        where: { headerFingerprint: input.headerFingerprint },
        select: { confirmedCount: true, correctedCount: true },
      });
      const resetCounters = existing != null && isQuarantined(existing);

      await this.prisma.bankStatementSignature.upsert({
        where: { headerFingerprint: input.headerFingerprint },
        create: {
          headerFingerprint: input.headerFingerprint,
          ...shared,
          confirmedCount: 0,
          correctedCount: 0,
        },
        update: resetCounters ? { ...shared, confirmedCount: 0, correctedCount: 0 } : shared,
      });
    } catch (e) {
      this.logger.warn(`Failed to record signature: ${e}`);
    }
  }

  async confirm(headerFingerprint: string): Promise<void> {
    await this.bump(headerFingerprint, 'confirmedCount');
  }

  async markCorrected(headerFingerprint: string): Promise<void> {
    await this.bump(headerFingerprint, 'correctedCount');
  }

  private async bump(
    headerFingerprint: string,
    field: 'confirmedCount' | 'correctedCount',
  ): Promise<void> {
    try {
      await this.prisma.bankStatementSignature.update({
        where: { headerFingerprint },
        data: { [field]: { increment: 1 } },
      });
    } catch (e) {
      // The row may legitimately not exist (parser-detected import, or a
      // signature that was never written). Counting is best-effort.
      this.logger.warn(`Failed to bump ${field}: ${e}`);
    }
  }
}
