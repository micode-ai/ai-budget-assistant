/**
 * childSync.ts — the child-costs offline queue drain and the pull merge of
 * server attribution into SQLite. Not a store: `childStore` writes the queue,
 * this module replays it; `expenseSync`/`incomeStore` call the merge.
 *
 * ## Queue drain (native only — web has no SQLite and goes straight to REST)
 *
 * 1. `child` changes first, in their OWN `/sync/push` request. The server runs
 *    a push batch with `Promise.all`, so a child create and a link referencing
 *    it in the same batch could race; a separate, earlier request cannot. A
 *    link (or line) whose child create failed stays queued for a later drain.
 * 2. Then link (`expense_child`, via `/sync/push`) and line
 *    (`expense_item_child`, via `PATCH /expenses/:id/items/:itemId/child`)
 *    changes, strictly in the order they were made. Lines go through REST, not
 *    a `/sync/push` `expense_item` change: that handler matches the parent
 *    expense by server PK only, needs the item's exact `syncVersion`, and
 *    writes `canonicalName: payload.canonicalName ?? null` — a child-only
 *    update would wipe the line's product name.
 *    Each row (one link pair, one line) is coalesced to its LAST change, so no
 *    two changes in a request touch the same row. A failure for an expense
 *    holds back that expense's later changes until the next drain, so the
 *    server never applies them out of order.
 *
 * A network failure stops the drain and leaves every row queued (no attempt
 * counted); a server rejection counts an attempt, and a row is dropped after
 * MAX_ATTEMPTS.
 *
 * ## Line changes the server cannot take (R12)
 *
 * A line change waits, uncounted, while its EXPENSE has not reached the
 * server. Once the expense is there but the line is still not server-known
 * (the offline retry path sends no lines, and a refetch replaces lines only
 * when the server returns some), the line may never become addressable. Such a
 * change is "undeliverable": it is stamped with the time it was first found so
 * (`markLinesUndeliverable`, no attempt counted — drains are frequent and the
 * next refetch may still adopt the line), it does not hold back the expense's
 * other changes (they touch other rows), it does not block the Statement PDF
 * (`countStatementQueue` reports it separately so the dialog can say so), and
 * it is dropped UNDELIVERABLE_LINE_TTL_MS after that first stamp. Failures are `console.warn`, never `console.error` (an offline
 * push is expected, ABA-157). Nothing here logs a child name.
 *
 * ## Encryption
 *
 * `child.name` is a tier-1 field. `maybeEncrypt` returns the data UNCHANGED
 * when the key is locked or missing, and `getAccountEncryptionTier` caches 0
 * when its lookup fails — either would send the plaintext name of a minor to a
 * server that must not hold it. So the tier is read fresh and fail-closed, and
 * on an encrypted account the change is sent only when a ciphertext was
 * actually produced (`name: null` + `encryptedPayload`); otherwise it stays
 * queued.
 */
import { Platform } from 'react-native';
import type { SyncChange, ExpenseChildLink, ExpenseItem } from '@budget/shared-types';
import * as childRepo from '@/db/childRepository';
import type { StoredQueuedChildChange } from '@/db/childRepository';
import { getAttributedItems, setExpenseItemChild } from '@/db/expenseItemRepository';
import { withTransaction } from '@/db/client';
import { api } from '@/services/api';
import { maybeEncrypt } from '@/services/encryptionHelper';

export type QueuedChildChange = StoredQueuedChildChange;

const MAX_ATTEMPTS = 10;

/** How long a line change may stay undeliverable (expense on the server, line not) before it is dropped. */
export const UNDELIVERABLE_LINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ChildChange = Extract<SyncChange, { entityType: 'child' }>;
type ExpenseChildChange = Extract<SyncChange, { entityType: 'expense_child' }>;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** An HTTP 4xx from the API: the server refused this request; retrying as-is will not help soon. */
function isClientRejection(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

// ─── Encryption ──────────────────────────────────────────────────────────────

/** The account's encryption tier, read from the server. Throws when it cannot be read — callers fail closed. */
export async function readEncryptionTier(accountId: string): Promise<number> {
  const status = await api.getAccountEncryptionStatus(accountId);
  const tier = (status as { encryptionTier?: unknown } | null | undefined)?.encryptionTier;
  // An empty or malformed body is not "tier 0": fail closed like a failed request.
  if (typeof tier !== 'number' || !Number.isFinite(tier)) throw new Error('Encryption tier missing from response');
  return tier;
}

/**
 * Build a `child` sync change. Returns null when the account is encrypted but
 * no ciphertext could be produced (locked or missing key) — the caller must not
 * send anything then.
 */
export async function buildChildSyncChange(
  accountId: string,
  tier: number,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: Record<string, unknown>,
  /** The device's local id (the server's clientId); defaults to `entityId`. */
  clientId: string = entityId,
): Promise<ChildChange | null> {
  const name = typeof payload.name === 'string' ? payload.name : '';
  let sendName: string | null = name;
  let enc: { encryptedPayload?: string; encryptionKeyVersion?: number } = {};
  if (tier >= 1) {
    const result = await maybeEncrypt('child', { name }, accountId);
    if (!result.encryptedPayload || result.payload.name != null) return null;
    sendName = null;
    enc = { encryptedPayload: result.encryptedPayload, encryptionKeyVersion: result.encryptionKeyVersion };
  }
  return {
    entityType: 'child',
    entityId,
    operation,
    accountId,
    clientVersion: 0,
    payload: {
      // An encrypted account sends `name: null`; the server keeps its `enc:<clientId>` placeholder.
      name: sendName as string,
      color: typeof payload.color === 'string' ? payload.color : undefined,
      clientId,
      archivedAt: (payload.archivedAt as string | null | undefined) ?? null,
    },
    ...enc,
  };
}

// ─── Drain ───────────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>();
const rerun = new Set<string>();

/** Forget in-flight drains — called from `childStore.reset()` (sign-out, account switch). */
export function resetChildSyncState(): void {
  inflight.clear();
  rerun.clear();
}

/**
 * Replay the account's queued child-cost changes. Single-flight per account:
 * a call made while a drain runs schedules one more pass after it, so a change
 * enqueued mid-drain is not left waiting for the next trigger.
 */
export function drainChildQueue(accountId: string): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  const running = inflight.get(accountId);
  if (running) {
    rerun.add(accountId);
    return running;
  }
  const run: Promise<void> = (async () => {
    try {
      do {
        rerun.delete(accountId);
        await doDrain(accountId);
      } while (rerun.has(accountId));
    } catch (e) {
      console.warn('[childSync] queue drain failed:', errorMessage(e));
    }
  })();
  inflight.set(accountId, run);
  void run.finally(() => {
    if (inflight.get(accountId) === run) inflight.delete(accountId);
  });
  return run;
}

async function doDrain(accountId: string): Promise<void> {
  const entries = await childRepo.getQueuedChildChanges(accountId);
  if (entries.length === 0) return;

  const exhausted = entries.filter((e) => e.attempts >= MAX_ATTEMPTS);
  if (exhausted.length > 0) {
    console.warn(`[childSync] dropping ${exhausted.length} child-cost change(s) after ${MAX_ATTEMPTS} rejected attempts`);
    await childRepo.deleteQueuedChildChanges(exhausted.map((e) => e.id));
  }
  const live = entries.filter((e) => e.attempts < MAX_ATTEMPTS);

  const blockedChildIds = new Set<string>();
  const childEntries = live.filter((e) => e.entityType === 'child');
  if (childEntries.length > 0) {
    const proceed = await pushChildren(accountId, childEntries, blockedChildIds);
    if (!proceed) return;
  }
  const rest = live.filter((e) => e.entityType !== 'child');
  if (rest.length === 0) return;
  // Read after the child push: a create just acked has recorded its server PK.
  const [serverIds, unsyncedExpenses, unsyncedItems] = await Promise.all([
    childRepo.getChildServerIds(accountId),
    childRepo.getUnsyncedExpenseIds(accountId),
    childRepo.getUnsyncedItemIds(
      rest.filter((e) => e.entityType === 'expense_item_child').map((e) => String(e.payload.itemId)),
    ),
  ]);
  await replayAttribution(accountId, rest, blockedChildIds, { serverIds, unsyncedExpenses, unsyncedItems });
}

/** Push every queued child (one change per child, coalesced). Returns false when the drain must stop. */
async function pushChildren(
  accountId: string,
  entries: QueuedChildChange[],
  blockedChildIds: Set<string>,
): Promise<boolean> {
  const groups = new Map<string, QueuedChildChange[]>();
  for (const e of entries) {
    const g = groups.get(e.entityId) ?? [];
    g.push(e);
    groups.set(e.entityId, g);
  }

  let tier: number;
  try {
    tier = await readEncryptionTier(accountId);
  } catch (e) {
    // Fail closed: an unknown tier must never fall back to sending a plaintext name.
    console.warn('[childSync] encryption tier unavailable, child changes stay queued:', errorMessage(e));
    return false;
  }

  // A child the server adopted by name (created first on another device or the web) carries
  // that device's clientId, not ours: address updates by the server PK once it is known.
  const serverIds = await childRepo.getChildServerIds(accountId);

  const changes: ChildChange[] = [];
  const changeGroups: QueuedChildChange[][] = [];
  const localIds: string[] = [];
  for (const [entityId, group] of groups) {
    const last = group[group.length - 1];
    const operation = last.operation === 'delete' ? 'delete' : group.some((g) => g.operation === 'create') ? 'create' : 'update';
    const payload = Object.assign({}, ...group.map((g) => g.payload)) as Record<string, unknown>;
    const target = operation === 'create' ? entityId : (serverIds.get(entityId) ?? entityId);
    const change = await buildChildSyncChange(accountId, tier, target, operation, payload, entityId);
    if (!change) {
      console.warn('[childSync] account is encrypted but its key is not available; child changes stay queued');
      return false;
    }
    changes.push(change);
    changeGroups.push(group);
    localIds.push(entityId);
  }

  let response;
  try {
    response = await api.pushChanges(changes, { accountId });
  } catch (e) {
    if (isClientRejection(e)) {
      await childRepo.recordChildQueueFailure(entries.map((x) => x.id), errorMessage(e));
      for (const id of groups.keys()) blockedChildIds.add(id);
      console.warn('[childSync] child push rejected:', errorMessage(e));
      return true;
    }
    console.warn('[childSync] child push failed (offline?):', errorMessage(e));
    return false;
  }

  for (let i = 0; i < changes.length; i++) {
    const result = response?.results?.[i];
    const ids = changeGroups[i].map((g) => g.id);
    if (result?.status === 'success') {
      await childRepo.deleteQueuedChildChanges(ids);
      await childRepo.markChildSynced(localIds[i], result.serverId);
    } else {
      const reason = result?.error ?? result?.status ?? 'no result';
      await childRepo.recordChildQueueFailure(ids, reason);
      blockedChildIds.add(localIds[i]);
      console.warn('[childSync] child change not applied:', reason);
    }
  }
  return true;
}

interface Survivor {
  entry: QueuedChildChange;
  ids: string[];
  expenseId: string;
  childId: string | null;
}

/** Coalesce each link pair / line to its last change, ordered by that change's position. */
function coalesce(entries: QueuedChildChange[]): Survivor[] {
  const byKey = new Map<string, { last: QueuedChildChange; lastIndex: number; ids: string[] }>();
  entries.forEach((entry, index) => {
    const p = entry.payload;
    const key =
      entry.entityType === 'expense_child'
        ? `link:${String(p.expenseId)}:${String(p.childId)}`
        : `line:${String(p.itemId)}`;
    const slot = byKey.get(key) ?? { last: entry, lastIndex: index, ids: [] };
    slot.last = entry;
    slot.lastIndex = index;
    slot.ids.push(entry.id);
    byKey.set(key, slot);
  });
  return [...byKey.values()]
    .sort((a, b) => a.lastIndex - b.lastIndex)
    .map(({ last, ids }) => ({
      entry: last,
      ids,
      expenseId: String(last.payload.expenseId),
      childId: (last.payload.childId as string | null | undefined) ?? null,
    }));
}

interface ReplayContext {
  /** local child id -> server PK, for children whose server id is known. */
  serverIds: Map<string, string>;
  /** Local expenses that have not reached the server yet. */
  unsyncedExpenses: Set<string>;
  /** Local line ids not yet replaced by their server rows. */
  unsyncedItems: Set<string>;
}

async function replayAttribution(
  accountId: string,
  entries: QueuedChildChange[],
  blockedChildIds: Set<string>,
  ctx: ReplayContext,
): Promise<void> {
  const blockedExpenses = new Set<string>();
  const undeliverable: Survivor[] = [];
  let batch: Survivor[] = [];
  /** Send the server PK once known: a child adopted by name has another device's clientId. */
  const serverChildId = (childId: string | null): string | null =>
    childId == null ? null : (ctx.serverIds.get(childId) ?? childId);

  /** Push the pending link batch. Returns false when the drain must stop. */
  const flush = async (): Promise<boolean> => {
    if (batch.length === 0) return true;
    const sending = batch;
    batch = [];
    const changes: ExpenseChildChange[] = sending.map((s) => ({
      entityType: 'expense_child',
      entityId: `${s.expenseId}:${s.childId}`,
      operation: s.entry.operation,
      accountId,
      clientVersion: 0,
      payload: {
        expenseId: s.expenseId,
        childId: String(serverChildId(s.childId)),
        share: Number(s.entry.payload.share ?? 1),
      },
    }));
    let response;
    try {
      response = await api.pushChanges(changes, { accountId });
    } catch (e) {
      if (isClientRejection(e)) {
        await childRepo.recordChildQueueFailure(sending.flatMap((s) => s.ids), errorMessage(e));
        for (const s of sending) blockedExpenses.add(s.expenseId);
        console.warn('[childSync] link push rejected:', errorMessage(e));
        return true;
      }
      console.warn('[childSync] link push failed (offline?):', errorMessage(e));
      return false;
    }
    for (let i = 0; i < sending.length; i++) {
      const result = response?.results?.[i];
      if (result?.status === 'success') {
        await childRepo.deleteQueuedChildChanges(sending[i].ids);
      } else {
        const reason = result?.error ?? result?.status ?? 'no result';
        await childRepo.recordChildQueueFailure(sending[i].ids, reason);
        blockedExpenses.add(sending[i].expenseId);
        console.warn('[childSync] link change not applied:', reason);
      }
    }
    return true;
  };

  for (const s of coalesce(entries)) {
    if (isUndeliverableLine(s.entry, ctx)) {
      // Cannot be sent as long as the line is unknown; other rows of the expense go on.
      undeliverable.push(s);
      continue;
    }
    const waitsForChild = s.childId != null && blockedChildIds.has(s.childId);
    // Not on the server yet (an offline-created expense, or receipt lines still under their
    // client ids): wait WITHOUT counting an attempt — a 404 now is not a rejection.
    const waitsForServer =
      ctx.unsyncedExpenses.has(s.expenseId) ||
      (s.entry.entityType === 'expense_item_child' && ctx.unsyncedItems.has(String(s.entry.payload.itemId)));
    if (blockedExpenses.has(s.expenseId) || waitsForChild || waitsForServer) {
      // Leave it queued; later changes for this expense must not overtake it.
      blockedExpenses.add(s.expenseId);
      continue;
    }
    if (s.entry.entityType === 'expense_child') {
      batch.push(s);
      continue;
    }
    // A line change: everything queued before it goes first.
    if (!(await flush())) return;
    if (blockedExpenses.has(s.expenseId)) continue;
    try {
      await api.setItemChild(s.expenseId, String(s.entry.payload.itemId), serverChildId(s.childId), { accountId });
      await childRepo.deleteQueuedChildChanges(s.ids);
    } catch (e) {
      if (!isClientRejection(e)) {
        console.warn('[childSync] line change failed (offline?):', errorMessage(e));
        return;
      }
      // Typically the line or its expense has not reached the server yet.
      await childRepo.recordChildQueueFailure(s.ids, errorMessage(e));
      blockedExpenses.add(s.expenseId);
      console.warn('[childSync] line change not applied:', errorMessage(e));
    }
  }
  if (!(await flush())) return;
  await settleUndeliverable(undeliverable);
}

/** A line change whose expense is on the server while the line is not server-known. */
function isUndeliverableLine(entry: QueuedChildChange, ctx: Pick<ReplayContext, 'unsyncedExpenses' | 'unsyncedItems'>): boolean {
  return (
    entry.entityType === 'expense_item_child' &&
    !ctx.unsyncedExpenses.has(String(entry.payload.expenseId)) &&
    ctx.unsyncedItems.has(String(entry.payload.itemId))
  );
}

/** Drop the undeliverable line changes past their TTL; stamp the rest (first stamp kept). */
async function settleUndeliverable(rows: Survivor[]): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  const expired = rows.filter(
    (s) => s.entry.undeliverableSince != null && now - s.entry.undeliverableSince >= UNDELIVERABLE_LINE_TTL_MS,
  );
  const waiting = rows.filter((s) => !expired.includes(s));
  if (expired.length > 0) {
    await childRepo.deleteQueuedChildChanges(expired.flatMap((s) => s.ids));
    console.warn(
      `[childSync] dropping ${expired.length} line attribution change(s): the line never reached the server`,
    );
  }
  await childRepo.markLinesUndeliverable(waiting.flatMap((s) => s.ids), now);
}

/**
 * What the Statement PDF gate must wait for, read after the drain: queued
 * child-cost changes still in good standing (not past MAX_ATTEMPTS, not
 * undeliverable), and how many line attributions are undeliverable (coalesced
 * per line) — those are not in the statement and the dialog says so. Native only.
 */
export async function countStatementQueue(
  accountId: string,
): Promise<{ pending: number; undeliverableLines: number }> {
  const entries = (await childRepo.getQueuedChildChanges(accountId)).filter((e) => e.attempts < MAX_ATTEMPTS);
  if (entries.length === 0) return { pending: 0, undeliverableLines: 0 };
  const [unsyncedExpenses, unsyncedItems] = await Promise.all([
    childRepo.getUnsyncedExpenseIds(accountId),
    childRepo.getUnsyncedItemIds(
      entries.filter((e) => e.entityType === 'expense_item_child').map((e) => String(e.payload.itemId)),
    ),
  ]);
  const ctx = { unsyncedExpenses, unsyncedItems };
  const lines = new Set<string>();
  let pending = 0;
  for (const e of entries) {
    if (isUndeliverableLine(e, ctx)) lines.add(String(e.payload.itemId));
    else pending++;
  }
  return { pending, undeliverableLines: lines.size };
}

// ─── Pull merge ──────────────────────────────────────────────────────────────

/** A pulled expense's child attribution, keyed by the expense's LOCAL id. */
export interface ServerExpenseAttribution {
  expenseId: string;
  /** Server `expenseChildren` (server child PKs); undefined when the response carried none. */
  links?: { childId: string; share: number | string }[];
  /** Server line items with their `childId` (server child PK or null). */
  items?: { id: string; childId?: string | null }[];
}

/** Server child PKs referenced by pulled attribution. */
export function collectServerChildIds(rows: ServerExpenseAttribution[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    for (const l of r.links ?? []) if (l.childId) ids.add(l.childId);
    for (const it of r.items ?? []) if (it.childId) ids.add(it.childId);
  }
  return [...ids];
}

/**
 * Server links -> local links (local expense and child ids). Undefined when the
 * server sent none, or when a child cannot be mapped yet — never a partial set.
 */
export function mapServerLinks(
  expenseId: string,
  links: ServerExpenseAttribution['links'],
  idMap: Map<string, string>,
): ExpenseChildLink[] | undefined {
  if (!Array.isArray(links)) return undefined;
  const mapped: ExpenseChildLink[] = [];
  for (const l of links) {
    const childId = idMap.get(l.childId);
    if (!childId) return undefined;
    mapped.push({ expenseId, childId, share: Number(l.share) });
  }
  return mapped;
}

/**
 * Web only: the receipt lines of an expense with a line attributed to a child,
 * kept on `expense.items` so the Child costs screen can total them (web has no
 * SQLite to read lines from). Every live line is kept, attributed or not — a
 * receipt discount is folded over the whole basket. A line whose child cannot
 * be mapped yet carries no child (it counts for no one rather than for the
 * wrong one). Undefined when no line carries a child.
 */
export function mapServerChildLines(
  expenseId: string,
  items: unknown,
  idMap: Map<string, string>,
): ExpenseItem[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const live = items.filter((it) => it && !it.isDeleted) as Record<string, any>[];
  if (!live.some((it) => !!it.childId)) return undefined;
  const now = new Date();
  return live.map((it) => ({
    id: String(it.id),
    localId: String(it.id),
    expenseId,
    description: it.description ?? '',
    canonicalName: it.canonicalName ?? undefined,
    quantity: Number(it.quantity ?? 1),
    unitPrice: Number(it.unitPrice ?? 0),
    totalPrice: Number(it.totalPrice ?? 0),
    sortOrder: it.sortOrder ?? 0,
    childId: it.childId ? (idMap.get(it.childId) ?? null) : null,
    categoryId: it.categoryId ?? null,
    lineDiscount: it.lineDiscount != null ? Number(it.lineDiscount) : null,
    createdAt: it.createdAt ? new Date(it.createdAt) : now,
    updatedAt: it.updatedAt ? new Date(it.updatedAt) : now,
    isDeleted: false,
    syncStatus: 'synced' as const,
    syncVersion: it.syncVersion ?? 0,
  }));
}

const linkKey = (links: { childId: string; share: number }[]): string =>
  links
    .map((l) => `${l.childId}:${Number(l.share).toFixed(4)}`)
    .sort()
    .join('|');

/**
 * Write the server's whole-expense links and line children into SQLite, mapped
 * to local ids. Expenses with a queued link/line change are skipped (the local
 * copy is newer), and only rows that differ are written. Native only.
 */
export async function mergeServerChildAttribution(
  accountId: string,
  rows: ServerExpenseAttribution[],
  idMap: Map<string, string>,
): Promise<void> {
  if (Platform.OS === 'web' || rows.length === 0) return;
  const hasAttribution = rows.some(
    (r) => (r.links?.length ?? 0) > 0 || (r.items ?? []).some((it) => it.childId != null),
  );

  const [pending, localLinks, localItems] = await Promise.all([
    childRepo.getPendingAttributionExpenseIds(accountId),
    childRepo.getExpenseChildLinks(accountId),
    getAttributedItems(accountId),
  ]);
  // Nothing on either side: nothing to reconcile.
  if (!hasAttribution && localLinks.length === 0 && localItems.length === 0) return;

  const linksByExpense = new Map<string, ExpenseChildLink[]>();
  for (const l of localLinks) {
    const list = linksByExpense.get(l.expenseId) ?? [];
    list.push(l);
    linksByExpense.set(l.expenseId, list);
  }
  const itemChild = new Map<string, string | null>();
  for (const it of localItems) itemChild.set(it.id, it.childId ?? null);

  const linkWrites: { expenseId: string; links: { childId: string; share: number }[] }[] = [];
  const itemWrites: { itemId: string; childId: string | null }[] = [];

  for (const r of rows) {
    if (pending.has(r.expenseId)) continue;
    const mapped = mapServerLinks(r.expenseId, r.links, idMap);
    if (mapped) {
      const local = linksByExpense.get(r.expenseId) ?? [];
      if (linkKey(mapped) !== linkKey(local)) {
        linkWrites.push({ expenseId: r.expenseId, links: mapped.map((l) => ({ childId: l.childId, share: l.share })) });
      }
    }
    for (const it of r.items ?? []) {
      if (!('childId' in it)) continue;
      const target = it.childId == null ? null : idMap.get(it.childId);
      if (target === undefined) continue; // child not known on this device yet
      if ((itemChild.get(it.id) ?? null) !== target) itemWrites.push({ itemId: it.id, childId: target });
    }
  }

  if (linkWrites.length === 0 && itemWrites.length === 0) return;
  await withTransaction(async () => {
    for (const w of linkWrites) await childRepo.replaceExpenseChildLinks(w.expenseId, w.links);
    for (const w of itemWrites) await setExpenseItemChild(w.itemId, w.childId);
  });
}
