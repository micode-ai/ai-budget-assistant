import { useCallback, useRef, useState } from 'react';

/**
 * Tracks how many receipts have been saved during one continuous stay on
 * `app/expense/receipt.tsx` (ABA batch-receipt-scan-session). Deliberately
 * plain component state, not a store or persisted value: the session is
 * scoped to a single mount of the screen — leaving it (navigating away, or
 * the screen unmounting) resets the count. That is the intended behavior for
 * "clear a stack of receipts in one sitting," not a bug to fix later.
 */
export function useReceiptScanSession() {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);

  // `recordSaved` must return the POST-increment count synchronously — the
  // caller decides, in the same tick, whether this save landed on a
  // checkpoint. A bare `setCount` can't do that: React state updates aren't
  // readable until the next render.
  const recordSaved = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
    return countRef.current;
  }, []);

  return { count, recordSaved };
}
