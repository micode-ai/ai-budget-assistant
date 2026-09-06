import { resolveSetupSteps, isSetupComplete, type SetupStepsInputs } from '../resolveSetupSteps';
import en from '@/i18n/locales/en';
import de from '@/i18n/locales/de';
import es from '@/i18n/locales/es';
import fr from '@/i18n/locales/fr';
import nl from '@/i18n/locales/nl';
import pl from '@/i18n/locales/pl';
import ru from '@/i18n/locales/ru';
import ua from '@/i18n/locales/ua';
import be from '@/i18n/locales/be';

/**
 * The setup checklist's rule for what is done.
 *
 * Every test below names the single production change that would make it
 * fail. A test that cannot be broken by a named one-line edit pins nothing —
 * this project has shipped one that passed against a deliberately broken
 * implementation — so if a case here has no such note, delete it.
 */

/** A brand-new account: nothing added, no balance set, no budget. */
const nothingDone: SetupStepsInputs = {
  expenseCount: 0,
  incomeCount: 0,
  walletCurrencyCount: 0,
  monthlyBudgetCount: 0,
};

const byId = (i: SetupStepsInputs) =>
  Object.fromEntries(resolveSetupSteps(i).map((s) => [s.id, s.done])) as Record<string, boolean>;

describe('resolveSetupSteps', () => {
  describe('step 1 — add your first transaction', () => {
    it('is done once an expense exists', () => {
      // Breaks if: `expenseCount` is dropped from the sum (e.g. narrowed to
      // `incomeCount > 0`). The commonest way to activate the app is an
      // expense, so this is the case most users hit first.
      expect(byId({ ...nothingDone, expenseCount: 1 }).transaction).toBe(true);
    });

    it('is done when the account has ONLY an income and no expense', () => {
      // Breaks if: the rule is narrowed to `expenseCount > 0`. This is the
      // load-bearing half — every other transaction test still passes under
      // that narrowing, and a user who logged a salary would be told forever
      // that they have not added anything.
      expect(byId({ ...nothingDone, incomeCount: 1 }).transaction).toBe(true);
    });

    it('is not done when there are no transactions at all', () => {
      // Breaks if: `expenseCount + incomeCount > 0` becomes `>= 0`, which
      // ticks the row for every brand-new user and makes the checklist lie
      // on the one screen it exists to explain.
      expect(byId(nothingDone).transaction).toBe(false);
    });

    it('is not ticked by a wallet balance or a budget', () => {
      // Breaks if: the wrong input is wired into this row (e.g. the wallet
      // count copy-pasted into the transaction rule, or two rows' `done`
      // expressions swapped). Each row must read its own input and only its
      // own — a checklist whose rows tick each other teaches nothing.
      expect(
        byId({ ...nothingDone, walletCurrencyCount: 3, monthlyBudgetCount: 2 }).transaction,
      ).toBe(false);
    });
  });

  describe('step 2 — set your wallet balance', () => {
    it('is done once the account holds at least one currency', () => {
      // Breaks if: `walletCurrencyCount > 0` is dropped or hard-coded false.
      // This is the condition that makes Safe to Spend, Net Capital and
      // Wallets stop reading 0,00.
      expect(byId({ ...nothingDone, walletCurrencyCount: 1 }).wallet).toBe(true);
    });

    it('is not done with no wallet balances', () => {
      // Breaks if: the comparison becomes `>= 0`.
      expect(byId(nothingDone).wallet).toBe(false);
    });

    it('is not ticked by transactions alone', () => {
      // Breaks if: this row reads the transaction counts. That is precisely
      // the user this card exists for — one who added an expense, never set a
      // balance, and whose Safe to Spend reads 0,00 with nothing explaining
      // why. Ticking the row here hides the only explanation.
      expect(byId({ ...nothingDone, expenseCount: 40, incomeCount: 5 }).wallet).toBe(false);
    });
  });

  describe('step 3 — create a budget', () => {
    it('is done once an active monthly budget exists', () => {
      // Breaks if: `monthlyBudgetCount > 0` is dropped or hard-coded false.
      expect(byId({ ...nothingDone, monthlyBudgetCount: 1 }).budget).toBe(true);
    });

    it('is not done with no monthly budget', () => {
      // Breaks if: the comparison becomes `>= 0`.
      expect(byId(nothingDone).budget).toBe(false);
    });
  });

  describe('the card is a checklist, not a queue', () => {
    it('returns all three steps even when some are already done', () => {
      // Breaks if: the function filters out finished steps. The whole point
      // is a live tick — a user who has done two of three must see two ticks,
      // not a shrinking list of chores.
      const steps = resolveSetupSteps({
        expenseCount: 1,
        incomeCount: 0,
        walletCurrencyCount: 1,
        monthlyBudgetCount: 0,
      });
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.done)).toEqual([true, true, false]);
    });

    it('keeps a fixed order: transaction, wallet, budget', () => {
      // Breaks if: the array order changes, or a step is inserted between
      // them. Order is the spec's, and it is a progression — you cannot
      // usefully budget before you have logged anything.
      expect(resolveSetupSteps(nothingDone).map((s) => s.id)).toEqual([
        'transaction',
        'wallet',
        'budget',
      ]);
    });
  });

  describe('destinations', () => {
    it('sends each outstanding step to the screen that completes it', () => {
      // Breaks if: any route is changed — `/wallet` instead of
      // `/wallet/set-balance` (the wallet screen shows the emptiness, it does
      // not fix it) or `/budget` instead of `/budget/new`. A wrong route here
      // is a dead end the user is invited into by a card promising a fix.
      const routes = Object.fromEntries(resolveSetupSteps(nothingDone).map((s) => [s.id, s.route]));
      expect(routes).toEqual({
        transaction: '/expense/new',
        wallet: '/wallet/set-balance',
        budget: '/budget/new',
      });
    });
  });

  describe('every label is an existing key, in all nine locales', () => {
    const locales = { en, de, es, fr, nl, pl, ru, ua, be } as const;

    const lookup = (locale: unknown, key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
          locale,
        );

    for (const [name, locale] of Object.entries(locales)) {
      it(`${name} has every title and hint key the checklist uses`, () => {
        // Breaks if: any `titleKey`/`hintKey` is changed to a key that does
        // not exist — including a plausible-looking invented one. i18next
        // renders a missing key as the raw dotted string, so the failure
        // ships silently and only in the locales nobody on the team reads.
        // This is also what enforces the "reuse existing keys, invent none"
        // rule: a new key would have to be added to all nine files to pass.
        for (const step of resolveSetupSteps(nothingDone)) {
          for (const key of [step.titleKey, step.hintKey]) {
            const value = lookup(locale, key);
            expect(typeof value).toBe('string');
            expect((value as string).length).toBeGreaterThan(0);
          }
        }
      });
    }
  });
});

describe('isSetupComplete', () => {
  it('is false while a single step is outstanding', () => {
    // Breaks if: `every` becomes `some`. Two of three done is the case that
    // separates them, and it is the exact user the card outlives first-run
    // for: transactions and a budget, but no wallet balance.
    const steps = resolveSetupSteps({
      expenseCount: 1,
      incomeCount: 0,
      walletCurrencyCount: 0,
      monthlyBudgetCount: 1,
    });
    expect(isSetupComplete(steps)).toBe(false);
  });

  it('is true only once every step is done', () => {
    // Breaks if: the predicate is inverted, or hard-coded. This is the card's
    // own exit — it disappears on its own rather than needing a dismissal.
    const steps = resolveSetupSteps({
      expenseCount: 1,
      incomeCount: 1,
      walletCurrencyCount: 2,
      monthlyBudgetCount: 1,
    });
    expect(isSetupComplete(steps)).toBe(true);
  });
});
