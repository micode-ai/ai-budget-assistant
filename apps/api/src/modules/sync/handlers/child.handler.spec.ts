import { Logger } from '@nestjs/common';
import { processChildChange } from './child.handler';
import { SyncHandlerContext } from '../sync-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A tiny in-memory `child` table enforcing both unique keys, enough to prove idempotency. */
function makeChildTable() {
  const rows: any[] = [];
  let seq = 0;
  const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((w: any) => matches(row, w));
      return row[k] === v;
    });
  const checkUnique = (row: any, self?: any) => {
    if (rows.some((r) => r !== self && r.accountId === row.accountId && r.name === row.name)) throw p2002();
    if (row.clientId && rows.some((r) => r !== self && r.accountId === row.accountId && r.clientId === row.clientId)) throw p2002();
  };
  const table = {
    rows,
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `srv-${++seq}`, clientId: null, color: null, archivedAt: null, isDeleted: false, syncVersion: 0, ...data };
      checkUnique(row);
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      const next = { ...row };
      for (const [k, v] of Object.entries(data) as Array<[string, any]>) {
        if (v === undefined) continue;
        next[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + v.increment : v;
      }
      checkUnique(next, row);
      Object.assign(row, next);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) {
        for (const [k, v] of Object.entries(data) as Array<[string, any]>) {
          r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : v;
        }
      }
      return { count: hit.length };
    }),
  };
  return table;
}

function makeCtx(child: any): SyncHandlerContext {
  return {
    prisma: { child } as any,
    expensesService: {} as any,
    incomesService: {} as any,
    logger: new Logger('test'),
  };
}

const create = (over: Record<string, any> = {}): any => ({
  entityType: 'child',
  entityId: 'local-a',
  operation: 'create',
  clientVersion: 0,
  accountId: 'acc-1',
  payload: { name: 'Ala', color: '#ff0000', clientId: 'local-a' },
  ...over,
});

describe('processChildChange', () => {
  it('child create twice with same clientId → one row', async () => {
    const child = makeChildTable();
    const ctx = makeCtx(child);

    const r1 = await processChildChange(ctx, 'acc-1', 'user-1', create());
    const r2 = await processChildChange(ctx, 'acc-1', 'user-1', create());

    expect(child.rows).toHaveLength(1);
    expect(r1).toMatchObject({ status: 'success', serverId: 'srv-1' });
    expect(r2).toMatchObject({ status: 'success', serverId: 'srv-1' });
    expect(child.rows[0]).toMatchObject({ accountId: 'acc-1', name: 'Ala', clientId: 'local-a' });
  });

  it('a create for an existing name adopts the clientId only when the row has none', async () => {
    const child = makeChildTable();
    child.rows.push({ id: 'web-1', accountId: 'acc-1', name: 'Ala', clientId: null, isDeleted: false, syncVersion: 0 });
    const ctx = makeCtx(child);

    const r = await processChildChange(ctx, 'acc-1', 'user-1', create());
    expect(r).toMatchObject({ status: 'success', serverId: 'web-1' });
    expect(child.rows).toHaveLength(1);
    expect(child.rows[0].clientId).toBe('local-a');

    // A second device with another local id for the same name: same row, clientId kept.
    const r2 = await processChildChange(ctx, 'acc-1', 'user-1', create({ entityId: 'local-b', payload: { name: 'Ala', clientId: 'local-b' } }));
    expect(r2).toMatchObject({ status: 'success', serverId: 'web-1' });
    expect(child.rows[0].clientId).toBe('local-a');
  });

  it('stores an encrypted child without its plaintext name and stays idempotent on clientId', async () => {
    const child = makeChildTable();
    const ctx = makeCtx(child);
    const enc = create({ payload: { name: null, clientId: 'local-a' }, encryptedPayload: 'cipher', encryptionKeyVersion: 2 });

    await processChildChange(ctx, 'acc-1', 'user-1', enc);
    await processChildChange(ctx, 'acc-1', 'user-1', enc);

    expect(child.rows).toHaveLength(1);
    expect(child.rows[0]).toMatchObject({ encryptedPayload: 'cipher', encryptionKeyVersion: 2, clientId: 'local-a' });
    expect(child.rows[0].name).not.toBe('Ala');
    expect(typeof child.rows[0].name).toBe('string');
  });

  it('update resolves by id OR clientId, scoped to the account, and archives', async () => {
    const child = makeChildTable();
    const ctx = makeCtx(child);
    await processChildChange(ctx, 'acc-1', 'user-1', create());

    const r = await processChildChange(ctx, 'acc-1', 'user-1', {
      ...create(), operation: 'update', payload: { name: 'Ala', archivedAt: '2026-11-01T00:00:00.000Z' },
    });
    expect(r).toMatchObject({ status: 'success', serverVersion: 1 });
    expect(child.rows[0].archivedAt).toEqual(new Date('2026-11-01T00:00:00.000Z'));

    const other = await processChildChange(ctx, 'acc-2', 'user-1', { ...create(), operation: 'update' });
    expect(other).toMatchObject({ status: 'error' });
  });

  it('delete is a soft delete scoped to the account', async () => {
    const child = makeChildTable();
    const ctx = makeCtx(child);
    await processChildChange(ctx, 'acc-1', 'user-1', create());

    await processChildChange(ctx, 'acc-2', 'user-1', { ...create(), operation: 'delete' });
    expect(child.rows[0].isDeleted).toBe(false);

    const r = await processChildChange(ctx, 'acc-1', 'user-1', { ...create(), operation: 'delete' });
    expect(r).toMatchObject({ status: 'success' });
    expect(child.rows).toHaveLength(1);
    expect(child.rows[0].isDeleted).toBe(true);
  });
});
