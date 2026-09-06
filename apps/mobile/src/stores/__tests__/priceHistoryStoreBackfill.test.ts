/**
 * `backfillWithAi` was the one write action in `priceHistoryStore` with no
 * `try/catch`: it neither logged a failure nor let anyone else describe one,
 * while `products.tsx` swallowed the rejection under a comment claiming the
 * store had warned. A failed AI re-analysis therefore produced nothing at all
 * -- no log, no alert -- and the button simply returned to its idle label,
 * which is indistinguishable from the real "updated 0 products" outcome.
 *
 * Each test names the production change that reddens it. The pair matters more
 * than either half, because the two plausible wrong fixes fail in opposite
 * directions:
 *
 *  - deleting the `catch` again reddens the WARN test only;
 *  - "fixing" it by catching and swallowing -- the tempting shape, since the
 *    two reloads inside already swallow -- reddens the RETHROW test only.
 *
 * Asserting the rejection alone would have been one of this project's tests
 * that cannot fail: the action rejected before the fix too, precisely because
 * it had no catch.
 */

jest.mock('@/services/api', () => ({
  api: {
    backfillProductNames: jest.fn(),
    getPriceHistory: jest.fn(),
    getProducts: jest.fn(),
  },
}));

import { usePriceHistoryStore } from '../priceHistoryStore';
import { api } from '@/services/api';

const backfillProductNames = jest.mocked(api.backfillProductNames);
const getPriceHistory = jest.mocked(api.getPriceHistory);
const getProducts = jest.mocked(api.getProducts);

describe('priceHistoryStore.backfillWithAi', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    usePriceHistoryStore.getState().reset();
    getPriceHistory.mockResolvedValue({} as never);
    getProducts.mockResolvedValue([]);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  // Catches: deleting the `console.warn` line, which is the whole of what the
  // sibling actions (`upsertAlias`, `deleteAlias`, `ignoreProduct`,
  // `mergeProducts`) do that this one did not. `warn`, never `error` -- ABA-157,
  // and the four siblings.
  it('warns when the request fails', async () => {
    backfillProductNames.mockRejectedValue(new Error('502 Bad Gateway'));

    await expect(usePriceHistoryStore.getState().backfillWithAi()).rejects.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[priceHistoryStore] backfillWithAi failed');
  });

  // Catches: a `catch` that logs and then swallows. The screen shows its error
  // alert from this rejection, so swallowing here would leave the user told
  // nothing all over again -- with a log this time, which is worse, because it
  // looks handled.
  it('rethrows so the caller can report the failure', async () => {
    const failure = new Error('502 Bad Gateway');
    backfillProductNames.mockRejectedValue(failure);

    await expect(usePriceHistoryStore.getState().backfillWithAi()).rejects.toBe(failure);
  });

  // Catches: a `catch` wrapped so widely that it also swallows the two reloads,
  // or a "fix" that drops them. The refresh is why the list reflects the new
  // names without a manual pull, and the returned count is what the success
  // alert quotes.
  it('refreshes both lists and returns the count on success', async () => {
    backfillProductNames.mockResolvedValue({ updatedCount: 7 });

    await expect(usePriceHistoryStore.getState().backfillWithAi()).resolves.toEqual({
      updatedCount: 7,
    });

    expect(getPriceHistory).toHaveBeenCalledTimes(1);
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  // Catches: narrowing the catch to the request alone would be fine, but
  // letting a reload's own failure surface as a backfill failure would not --
  // the backfill DID happen, and reporting it as failed would invite the user
  // to spend another AI call repeating it. `loadPriceHistory`/`loadProducts`
  // swallow and warn on their own; this pins that the outer action stays
  // resolved when they do.
  it('still resolves when a post-backfill reload fails', async () => {
    backfillProductNames.mockResolvedValue({ updatedCount: 3 });
    getProducts.mockRejectedValue(new Error('offline'));

    await expect(usePriceHistoryStore.getState().backfillWithAi()).resolves.toEqual({
      updatedCount: 3,
    });

    expect(String(warn.mock.calls[0][0])).toContain('loadProducts failed');
  });
});
