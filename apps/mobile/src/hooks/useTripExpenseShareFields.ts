import { useState, useEffect, useCallback } from 'react';
import * as tripExpenseShareRepository from '@/db/tripExpenseShareRepository';
import type { TripExpenseShareValue } from '@/components/expenses/TripExpenseSplitPicker';
import type { ShareType } from '@budget/shared-types';

/**
 * Trip expense-share state for the expense detail card (Group Trip Wallet).
 *
 * `splitType`/`shares` mirror the picker's current value, seeded from the expense's existing
 * shares so re-entering edit mode shows the previously-selected split, not a fresh 'equal'
 * default. `persisted*` is the last-known-saved split (loaded from the DB, or advanced by
 * `markSaved` right after a save): leaving edit mode reverts to it, otherwise a discarded
 * split would silently resurface — and be saved — the next time the user edits.
 */
export function useTripExpenseShareFields(
  expenseId: string,
  isTripAccount: boolean,
  isEditing: boolean,
) {
  const [splitType, setSplitType] = useState<ShareType>('equal');
  const [shares, setShares] = useState<TripExpenseShareValue[]>([]);
  const [persistedSplitType, setPersistedSplitType] = useState<ShareType>('equal');
  const [persistedShares, setPersistedShares] = useState<TripExpenseShareValue[]>([]);

  useEffect(() => {
    if (!isTripAccount) return;
    tripExpenseShareRepository
      .getSharesForExpense(expenseId)
      .then((existing) => {
        if (existing.length === 0) return;
        const loadedSplitType = existing[0].shareType as ShareType;
        const loadedShares = existing.map((s) => ({ userId: s.userId, value: s.shareAmount }));
        setSplitType(loadedSplitType);
        setShares(loadedShares);
        setPersistedSplitType(loadedSplitType);
        setPersistedShares(loadedShares);
      })
      .catch(() => {});
  }, [expenseId, isTripAccount]);

  // Revert unsaved picker edits whenever editing is turned off.
  useEffect(() => {
    if (!isEditing) {
      setSplitType(persistedSplitType);
      setShares(persistedShares);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = useCallback((nextSplitType: ShareType, nextShares: TripExpenseShareValue[]) => {
    setSplitType(nextSplitType);
    setShares(nextShares);
  }, []);

  /** Advance the persisted mirror to the current value, so a later Cancel reverts to THIS split. */
  const markSaved = useCallback(() => {
    setPersistedSplitType(splitType);
    setPersistedShares(shares);
  }, [splitType, shares]);

  return { splitType, shares, onChange, markSaved };
}
