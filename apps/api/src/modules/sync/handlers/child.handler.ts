import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

type ChildChange = Extract<SyncChange, { entityType: 'child' }>;

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/** `undefined` leaves the column, `null` clears it, an ISO string sets it (an unparseable one leaves it). */
function parseArchivedAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Sync handler for `Child` (child costs). Mirrors `tag.handler.ts`: an
 * idempotent create on `(accountId, name)`, adoption of the device's
 * `clientId` only when the row has none, and a soft delete.
 *
 * Unlike tags it is also idempotent on `clientId` FIRST: `name` is a tier-1
 * encrypted field, so an encrypted account sends `name: null` with the
 * ciphertext in `encryptedPayload`, and a name cannot be the key there. Such a
 * row stores a per-row placeholder (`enc:<clientId>`) to satisfy the unique
 * `(accountId, name)` — never the plaintext, which the server must not hold.
 *
 * Child names are personal data of minors: nothing here logs a name.
 */
export async function processChildChange(
  ctx: SyncHandlerContext,
  accountId: string,
  _userId: string,
  change: ChildChange,
): Promise<SyncResult> {
  const { payload, entityId } = change;
  const encData = {
    encryptedPayload: change.encryptedPayload,
    encryptionKeyVersion: change.encryptionKeyVersion,
  };
  const plainName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  const archivedAt = parseArchivedAt(payload.archivedAt);

  if (change.operation === 'create') {
    const clientKey = payload.clientId ?? entityId;
    if (!plainName && !change.encryptedPayload) {
      return { entityId, status: 'error', error: 'Child name is required' };
    }

    // 1. A retry of a create the server already applied (even after a rename).
    const byClient = await ctx.prisma.child.findFirst({ where: { accountId, clientId: clientKey } });
    if (byClient) {
      const revived = await ctx.prisma.child.update({
        where: { id: byClient.id },
        data: { color: payload.color, archivedAt, ...encData, isDeleted: false },
      });
      return { entityId, status: 'success', serverId: revived.id, serverVersion: revived.syncVersion };
    }

    // 2. Same name created elsewhere (another device, the web): reuse it and adopt
    //    this clientId only if the row has none — never overwrite another device's.
    if (plainName) {
      const byName = await ctx.prisma.child.findFirst({ where: { accountId, name: plainName } });
      if (byName) {
        const adopted = await ctx.prisma.child.update({
          where: { id: byName.id },
          data: {
            color: payload.color,
            archivedAt,
            ...encData,
            isDeleted: false,
            clientId: byName.clientId == null ? clientKey : undefined,
          },
        });
        return { entityId, status: 'success', serverId: adopted.id, serverVersion: adopted.syncVersion };
      }
    }

    // 3. New child.
    try {
      const created = await ctx.prisma.child.create({
        data: {
          accountId,
          clientId: clientKey,
          name: plainName ?? `enc:${clientKey}`,
          color: payload.color,
          archivedAt: archivedAt ?? null,
          ...encData,
        },
      });
      return { entityId, status: 'success', serverId: created.id, serverVersion: created.syncVersion };
    } catch (e) {
      // A concurrent push of the same create won the race (not atomic, ABA-314):
      // answer with the row it created instead of an error.
      if (!isUniqueViolation(e)) throw e;
      const raced = await ctx.prisma.child.findFirst({
        where: { accountId, OR: [{ clientId: clientKey }, ...(plainName ? [{ name: plainName }] : [])] },
      });
      if (!raced) throw e;
      return { entityId, status: 'success', serverId: raced.id, serverVersion: raced.syncVersion };
    }
  }

  // The device addresses a child by its local id (clientId) or by the server PK.
  const existing = await ctx.prisma.child.findFirst({
    where: { accountId, OR: [{ id: entityId }, { clientId: entityId }] },
  });

  if (change.operation === 'update') {
    if (!existing) return { entityId, status: 'error', error: 'Child not found' };
    try {
      const updated = await ctx.prisma.child.update({
        where: { id: existing.id },
        data: {
          // An encrypted rename sends `name: null`: keep the placeholder, store the ciphertext.
          name: plainName ?? undefined,
          color: payload.color,
          archivedAt,
          ...encData,
          syncVersion: { increment: 1 },
        },
      });
      return { entityId, status: 'success', serverVersion: updated.syncVersion };
    } catch (e) {
      if (isUniqueViolation(e)) return { entityId, status: 'error', error: 'Child name already exists' };
      throw e;
    }
  }

  if (change.operation === 'delete') {
    if (existing) {
      await ctx.prisma.child.updateMany({
        where: { id: existing.id, accountId },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
    }
    return { entityId, status: 'success' };
  }

  return { entityId, status: 'error', error: 'Unknown operation' };
}
