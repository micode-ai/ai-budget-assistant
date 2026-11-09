import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { diffTransaction } from './transaction-revision.util';

export type RevisionEntityType = 'expense' | 'income';

/** Retention: only the newest N revisions per transaction are kept. */
export const MAX_REVISIONS_PER_ENTITY = 20;

@Injectable()
export class TransactionRevisionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called INSIDE the update `$transaction` (pass `tx`). No-ops for single-member accounts, an
   * unknown editor, E2EE rows, and edits that touched no tracked field.
   */
  async record(
    tx: any,
    p: {
      accountId: string;
      userId: string | undefined;
      entityType: RevisionEntityType;
      entityId: string;
      before: Record<string, unknown>;
      after: Record<string, unknown> | null | undefined;
    },
  ): Promise<void> {
    if (!p.userId || !p.after) return;
    if (!diffTransaction(p.before, p.after)) return;
    const members = await tx.accountMember.count({ where: { accountId: p.accountId } });
    if (members < 2) return;
    const account = await tx.account.findUnique({
      where: { id: p.accountId },
      select: { encryptionTier: true },
    });
    const changes = diffTransaction(p.before, p.after, {
      textEncrypted: (account?.encryptionTier ?? 0) >= 1,
    });
    if (!changes) return;
    await tx.transactionRevision.create({
      data: {
        accountId: p.accountId,
        entityType: p.entityType,
        entityId: p.entityId,
        userId: p.userId,
        changes,
      },
    });
    const stale = await tx.transactionRevision.findMany({
      where: { entityType: p.entityType, entityId: p.entityId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_REVISIONS_PER_ENTITY,
      select: { id: true },
    });
    if (stale.length) {
      await tx.transactionRevision.deleteMany({ where: { id: { in: stale.map((s: { id: string }) => s.id) } } });
    }
  }

  /** Newest first, scoped by accountId. Category ids are resolved to names. */
  async list(accountId: string, entityType: RevisionEntityType, entityId: string) {
    const rows = await this.prisma.transactionRevision.findMany({
      where: { accountId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: MAX_REVISIONS_PER_ENTITY,
      include: { user: { select: { name: true } } },
    });
    const catIds = new Set<string>();
    for (const r of rows) {
      const c = (r.changes as any)?.categoryId;
      if (c?.from) catIds.add(c.from);
      if (c?.to) catIds.add(c.to);
    }
    const cats = catIds.size
      ? await this.prisma.category.findMany({
          where: { id: { in: [...catIds] }, accountId },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(cats.map((c) => [c.id, c.name]));
    return rows.map((r) => {
      const changes: Record<string, { from: unknown; to: unknown }> = { ...(r.changes as any) };
      if (changes.categoryId) {
        const c = changes.categoryId as { from: string | null; to: string | null };
        changes.categoryId = {
          from: c.from ? names.get(c.from) ?? null : null,
          to: c.to ? names.get(c.to) ?? null : null,
        };
      }
      return { id: r.id, userId: r.userId, userName: r.user?.name ?? null, createdAt: r.createdAt, changes };
    });
  }
}
