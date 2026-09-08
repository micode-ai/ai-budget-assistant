import { invalidateExpenseChatCache } from './expense-cache.util';

/**
 * The chat's read tools are cached for 10 minutes under one key prefix EACH,
 * so a tool missing from this list keeps answering from before the write.
 * Every tool listed here reads the `expenses` table, so every expense
 * mutation must bust all of them — the failure mode is the assistant
 * confidently quoting a figure the app has already changed.
 */
function makeCache() {
  const delByPrefix = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  return { cache: { delByPrefix, del } as any, delByPrefix, del };
}

const prefixes = async (accountId = 'a1') => {
  const { cache, delByPrefix } = makeCache();
  await invalidateExpenseChatCache(cache, accountId);
  return delByPrefix.mock.calls.map((c: unknown[]) => String(c[0]));
};

describe('invalidateExpenseChatCache', () => {
  it('busts every expense-reading chat tool for the account', async () => {
    expect(await prefixes()).toEqual(
      expect.arrayContaining([
        'chat:get_expenses:a1:',
        'chat:get_budget_status:a1:',
        'chat:get_category_breakdown:a1:',
        'chat:get_inflation_shield:a1:',
        // Reads `Expense.depositAmount`, so a receipt scanned right after the
        // question must not leave the deposit total 10 minutes stale.
        'chat:get_deposit_total:a1:',
      ]),
    );
  });

  it('also drops the cached user context the system prompt is built from', async () => {
    const { cache, del } = makeCache();
    await invalidateExpenseChatCache(cache, 'a1');
    expect(del).toHaveBeenCalledWith('uc:a1');
  });

  it('does nothing without an account, rather than busting every account', async () => {
    const { cache, delByPrefix, del } = makeCache();
    await invalidateExpenseChatCache(cache, '');
    expect(delByPrefix).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
