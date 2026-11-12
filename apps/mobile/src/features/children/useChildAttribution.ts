import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  carryChildAttribution,
  normalizeProductKey,
  resolveAttributionMode,
  type AttributionMode,
} from '@budget/shared-utils';
import type { ExpenseItem } from '@budget/shared-types';
import { showAlert } from '@/utils/alert';
import { api } from '@/services/api';
import { useConnectivityStore } from '@/services/connectivity';
import { useAccountStore } from '@/stores/accountStore';
import { useChildStore } from '@/stores/childStore';
import { readEncryptionTier } from '@/stores/childSync';
import { useExpenseStore } from '@/stores/expenseStore';

const EMPTY_ITEMS: ExpenseItem[] = [];
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The product name a learned rule is keyed on: OCR's canonical name, else the line text. */
export const productNameOf = (line: { canonicalName?: string | null; description: string }): string =>
  line.canonicalName || line.description || '';

/**
 * Learned product -> child suggestions for one receipt, keyed by
 * `normalizeProductKey(canonicalName ?? description)` (the server's
 * `normalizeProductName`), valued by LOCAL child id.
 *
 * Fetched once per `receiptKey` (an expense id, or the scan object on the
 * confirm card), only when online, only on an unencrypted account (the tier is
 * read fresh and fail-closed: an encrypted account's product names must not be
 * sent in clear), and only with product names — never a child's name. Absent
 * (an empty map) offline, on any failure, and for a child that is archived or
 * unknown here. A suggestion is only ever SHOWN; nothing here writes.
 */
export function useChildSuggestions(receiptKey: unknown, productNames: string[]): Record<string, string> {
  const accountId = useAccountStore((s) => s.currentAccountId);
  const status = useConnectivityStore((s) => s.status);
  const [byKey, setByKey] = useState<Record<string, string>>({});
  const fetchedFor = useRef<unknown>(undefined);
  const namesKey = productNames.join('\u0000');

  useEffect(() => {
    if (receiptKey == null || !accountId) return;
    if (fetchedFor.current === receiptKey) return;
    const names = Array.from(new Set(productNames.filter((n) => n.trim().length > 0)));
    // Nothing to ask about yet (lines still loading): try again when they arrive.
    if (names.length === 0) return;
    // Offline: no suggestions. Not marked fetched, so coming back online asks once.
    if (status === 'offline') return;
    fetchedFor.current = receiptKey;
    setByKey({});
    let cancelled = false;
    void (async () => {
      try {
        if ((await readEncryptionTier(accountId)) !== 0) return;
        const response = (await api.getChildSuggestions(names)) ?? {};
        const serverIds = Array.from(new Set(Object.values(response).filter((v) => typeof v === 'string')));
        if (serverIds.length === 0) return;
        const localIds = await useChildStore.getState().resolveServerChildIds(serverIds);
        const active = new Set(
          useChildStore
            .getState()
            .children.filter((c) => !c.archivedAt)
            .map((c) => c.id),
        );
        const out: Record<string, string> = {};
        for (const [key, serverId] of Object.entries(response)) {
          const local = localIds.get(serverId);
          if (local && active.has(local)) out[key] = local;
        }
        if (!cancelled && useAccountStore.getState().currentAccountId === accountId) setByKey(out);
      } catch (e) {
        // Expected offline / on a flaky network; a suggestion is a nicety.
        console.warn('[children] suggestions unavailable:', errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `namesKey` stands in for `productNames` (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptKey, namesKey, status, accountId]);

  return byKey;
}

/** The suggestion for one line, or undefined — only for a line with no child yet. */
export function suggestionForLine(
  byKey: Record<string, string>,
  line: { canonicalName?: string | null; description: string; childId?: string | null },
): string | undefined {
  if (line.childId) return undefined;
  return byKey[normalizeProductKey(productNameOf(line))];
}

/**
 * Per-line child attribution of a saved expense (expense detail item list, and
 * the desktop `ExpenseDialog` that hosts the same section).
 *
 * - `mode` is the expense's current attribution mode.
 * - `suggestions` maps a line id to a suggested child id; shown, never applied.
 * - `setLine` attributes one line (null clears it). On an expense attributed as
 *   a WHOLE it asks "Replace…?" first — the two modes are mutually exclusive,
 *   and the last action wins only after the user agreed.
 * - `setWhole` attributes the whole expense; on a line-attributed expense it
 *   asks first, for the same reason.
 *
 * Every write goes through `childStore` (`setItemChild`/`setExpenseChildren`),
 * which keeps the offline queue and the web's `hasLineChildren` flag right.
 * A failed write is reported and `console.warn`ed, never thrown.
 */
export function useChildAttribution(expenseId: string) {
  const { t } = useTranslation();
  const expense = useExpenseStore((s) => s.expenses.find((e) => e.id === expenseId));
  const rawItems = useExpenseStore((s) => s.expenseItems[expenseId]) ?? EMPTY_ITEMS;
  const items = useMemo(() => rawItems.filter((i) => !i.isDeleted), [rawItems]);

  const links = expense?.expenseChildren;
  const mode: AttributionMode = useMemo(
    () =>
      resolveAttributionMode(
        links ?? [],
        items.map((i) => ({ expenseId, totalPrice: i.totalPrice, childId: i.childId ?? null, categoryId: null })),
      ),
    [links, items, expenseId],
  );

  // No request at all for an account without (active) children — most accounts.
  const children = useChildStore((s) => s.children);
  const hasActiveChildren = useMemo(() => children.some((c) => !c.archivedAt), [children]);
  const productNames = useMemo(
    () => (hasActiveChildren ? items.map(productNameOf) : []),
    [items, hasActiveChildren],
  );
  const byKey = useChildSuggestions(expenseId, productNames);
  const suggestions = useMemo(() => {
    const out: Record<string, string> = {};
    for (const line of items) {
      const s = suggestionForLine(byKey, line);
      if (s) out[line.id] = s;
    }
    return out;
  }, [byKey, items]);

  const writeLine = useCallback(
    async (itemId: string, childId: string | null) => {
      try {
        await useChildStore.getState().setItemChild(expenseId, itemId, childId);
      } catch (e) {
        console.warn('[children] line attribution not saved:', errorMessage(e));
        showAlert(t('common.error'), t('children.lineSaveFailed'));
      }
    },
    [expenseId, t],
  );

  const setLine = useCallback(
    async (itemId: string, childId: string | null) => {
      if (childId && mode === 'whole') {
        showAlert(t('children.replaceWholeTitle'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('children.replaceLinesConfirm'),
            style: 'destructive',
            onPress: () => void writeLine(itemId, childId),
          },
        ]);
        return;
      }
      await writeLine(itemId, childId);
    },
    [mode, t, writeLine],
  );

  const writeWhole = useCallback(
    async (childIds: string[]) => {
      try {
        await useChildStore.getState().setExpenseChildren(expenseId, childIds);
      } catch (e) {
        console.warn('[children] attribution not saved:', errorMessage(e));
        showAlert(t('common.error'), t('children.assignFailed'));
      }
    },
    [expenseId, t],
  );

  const setWhole = useCallback(
    async (childIds: string[]) => {
      if (childIds.length > 0 && mode === 'lines') {
        showAlert(t('children.replaceLinesTitle'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('children.replaceLinesConfirm'),
            style: 'destructive',
            onPress: () => void writeWhole(childIds),
          },
        ]);
        return;
      }
      await writeWhole(childIds);
    },
    [mode, t, writeWhole],
  );

  return { mode, suggestions, setLine, setWhole };
}

export type ChildAttribution = ReturnType<typeof useChildAttribution>;

/**
 * "Extract items" replaced an expense's lines: carry each old line's child onto
 * the regenerated line with the same normalized product name
 * (`carryChildAttribution`), through `setItemChild`.
 *
 * `resolveItemId(index)` gives the id of the regenerated line at that position
 * (null when it never got one — e.g. web waiting on the server timed out).
 * `lost` counts the old attributions that did not land: unmatched by name, no
 * id, or a failed write.
 */
export async function applyCarriedAttribution(input: {
  expenseId: string;
  oldItems: { canonicalName?: string | null; description: string; childId?: string | null; isDeleted?: boolean }[];
  scanned: { canonicalName?: string | null; description: string }[];
  resolveItemId: (index: number) => Promise<string | null>;
  setItemChild?: (expenseId: string, itemId: string, childId: string | null) => Promise<void>;
}): Promise<{ applied: number; lost: number }> {
  const { expenseId, oldItems, scanned, resolveItemId } = input;
  const setItemChild =
    input.setItemChild ?? ((e: string, i: string, c: string | null) => useChildStore.getState().setItemChild(e, i, c));
  const carry = carryChildAttribution(
    oldItems.filter((o) => !o.isDeleted).map((o) => ({ ...o, childId: o.childId ?? null })),
    scanned,
    normalizeProductKey,
  );
  let applied = 0;
  let lost = carry.lost;
  for (let index = 0; index < carry.childIds.length; index++) {
    const childId = carry.childIds[index];
    if (!childId) continue;
    const itemId = await resolveItemId(index);
    if (!itemId) {
      lost++;
      continue;
    }
    try {
      await setItemChild(expenseId, itemId, childId);
      applied++;
    } catch (e) {
      console.warn('[children] carried line attribution not saved:', errorMessage(e));
      lost++;
    }
  }
  return { applied, lost };
}

const WEB_ITEM_TIMEOUT_MS = 20_000;

/**
 * The id of an expense's line at `sortOrder` that a write can address.
 *
 * Native: the line's current id at once — the queue holds the change until the
 * line reaches the server and follows it to its server id
 * (`replaceItemsForExpense`). Web has no queue: a just-added line carries a
 * client id until `addExpenseItem` adopts the server's, so wait for that
 * (null on timeout).
 */
export function resolveLineIdBySortOrder(expenseId: string, sortOrder: number): Promise<string | null> {
  const find = () =>
    (useExpenseStore.getState().expenseItems[expenseId] ?? []).find(
      (i) => i.sortOrder === sortOrder && !i.isDeleted,
    );
  if (Platform.OS !== 'web') return Promise.resolve(find()?.id ?? null);
  return new Promise((resolve) => {
    const ready = () => {
      const line = find();
      return line && line.syncStatus === 'synced' ? line.id : null;
    };
    const now = ready();
    if (now) {
      resolve(now);
      return;
    }
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const unsubscribe = useExpenseStore.subscribe(() => {
      const id = ready();
      if (id) finish(id);
    });
    const timer = setTimeout(() => finish(null), WEB_ITEM_TIMEOUT_MS);
  });
}
