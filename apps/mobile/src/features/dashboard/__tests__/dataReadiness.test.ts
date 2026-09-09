import { isDashboardRefreshing, resolveDashboardReadiness } from '../dataReadiness';

/**
 * These pin the two rules that decide whether the dashboard is allowed to draw
 * a number, and whether the progress bar is allowed to animate.
 *
 * The production changes each catches, named before writing:
 *  - dropping the `isWeb` short-circuit, which would put dashes in front of an
 *    offline native user whose SQLite mirror holds every figure correctly;
 *  - turning `showInitialLoader` into "anything is missing", which would cover
 *    already-correct content with a spinner on every partial load;
 *  - forgetting the bound, which would leave a dead network showing a spinner
 *    for ever;
 *  - keying the progress bar on "has not answered yet" instead of "a request
 *    is running", which animates for ever on an offline device.
 */

const web = (over: Partial<Parameters<typeof resolveDashboardReadiness>[0]> = {}) =>
  resolveDashboardReadiness({
    isWeb: true,
    expensesPullAt: null,
    incomesPullAt: null,
    walletPullAt: null,
    budgetsPullAt: null,
    categoriesReady: false,
    initialWaitElapsed: false,
    ...over,
  });

describe('resolveDashboardReadiness', () => {
  it('treats native as fully ready, whatever the stamps say', () => {
    // SQLite holds the whole account there and works offline, so `null` stamps
    // mean "offline", not "no data". Dashes would hide correct figures.
    const r = resolveDashboardReadiness({
      isWeb: false,
      expensesPullAt: null,
      incomesPullAt: null,
      walletPullAt: null,
      budgetsPullAt: null,
      categoriesReady: false,
      initialWaitElapsed: false,
    });

    expect(r).toEqual({
      transactions: true,
      wallet: true,
      budgets: true,
      categories: true,
      showInitialLoader: false,
    });
  });

  it('shows the centred loader only while nothing at all has answered', () => {
    expect(web().showInitialLoader).toBe(true);
  });

  it('stops showing the centred loader as soon as anything lands', () => {
    // A partial state must render: covering already-correct figures with a
    // spinner is worse than showing them beside a dash.
    expect(web({ walletPullAt: 1 }).showInitialLoader).toBe(false);
    expect(web({ budgetsPullAt: 1 }).showInitialLoader).toBe(false);
    expect(web({ categoriesReady: true }).showInitialLoader).toBe(false);
    expect(web({ expensesPullAt: 1, incomesPullAt: 1 }).showInitialLoader).toBe(false);
  });

  it('drops the loader once the bound elapses, even with nothing answered', () => {
    expect(web({ initialWaitElapsed: true }).showInitialLoader).toBe(false);
  });

  it('needs BOTH transaction pulls before any spend figure is trusted', () => {
    // Either one alone leaves every total wrong: expenses without incomes
    // makes net profit negative by construction, and the reverse inflates it.
    expect(web({ expensesPullAt: 1 }).transactions).toBe(false);
    expect(web({ incomesPullAt: 1 }).transactions).toBe(false);
    expect(web({ expensesPullAt: 1, incomesPullAt: 1 }).transactions).toBe(true);
  });

  it('compares against null, not falsiness', () => {
    // A stamp of 0 is a real answer. Reading it as absent would leave the
    // dashboard waiting on a pull that already landed.
    expect(web({ expensesPullAt: 0, incomesPullAt: 0 }).transactions).toBe(true);
    expect(web({ walletPullAt: 0 }).wallet).toBe(true);
    expect(web({ budgetsPullAt: 0 }).budgets).toBe(true);
  });

  it('reports each domain independently', () => {
    const r = web({ walletPullAt: 1, categoriesReady: true });

    expect(r.wallet).toBe(true);
    expect(r.categories).toBe(true);
    expect(r.transactions).toBe(false);
    expect(r.budgets).toBe(false);
  });
});

describe('isDashboardRefreshing', () => {
  const base = {
    isHydrating: false,
    walletLoading: false,
    budgetsLoading: false,
    categoriesLoading: false,
  };

  it('is quiet when nothing is in flight', () => {
    expect(isDashboardRefreshing(base)).toBe(false);
  });

  it('animates for any one of the four sources', () => {
    // The bar used to track `isHydrating` alone, so a dashboard busy fetching
    // its wallet, budgets and categories showed no activity whatsoever.
    expect(isDashboardRefreshing({ ...base, isHydrating: true })).toBe(true);
    expect(isDashboardRefreshing({ ...base, walletLoading: true })).toBe(true);
    expect(isDashboardRefreshing({ ...base, budgetsLoading: true })).toBe(true);
    expect(isDashboardRefreshing({ ...base, categoriesLoading: true })).toBe(true);
  });
});
