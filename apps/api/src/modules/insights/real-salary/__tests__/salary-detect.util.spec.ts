import {
  descriptionKey, salaryKeyOf, isSalaryEligible, findSalaryCandidates, nominalChange, type IncomeRow,
} from '../salary-detect.util';

const NOW = new Date('2026-09-26T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const row = (o: Partial<IncomeRow> & { date: Date; amount: number }): IncomeRow => ({
  currencyCode: 'PLN', description: 'Wynagrodzenie ACME', categoryId: 'cat-salary', categoryName: 'Salary',
  isDebt: false, isDebtRepayment: false, clientId: 'c-' + o.date.toISOString(), ...o,
});
const monthly = (fromYm: string, months: number, amount: number, extra: Partial<IncomeRow> = {}) => {
  const [y, m] = fromYm.split('-').map(Number);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 10));
    return row({ date: d, amount, ...extra });
  });
};

describe('descriptionKey / salaryKeyOf', () => {
  it('normalises case, digits and whitespace so monthly references do not split the series', () => {
    expect(descriptionKey('  Wynagrodzenie 09/2026  ACME ')).toBe('wynagrodzenie acme');
    expect(descriptionKey(null)).toBe('');
    expect(salaryKeyOf({ categoryId: 'c1', description: 'Salary 08', currencyCode: 'EUR' })).toBe('c1|salary|EUR');
    expect(salaryKeyOf({ categoryId: null, description: 'x', currencyCode: 'PLN' })).toBe('|x|PLN');
  });
});

describe('isSalaryEligible', () => {
  it('drops debts, repayments and transfers counted as income', () => {
    const base = row({ date: day('2026-09-10'), amount: 100 });
    expect(isSalaryEligible(base)).toBe(true);
    expect(isSalaryEligible({ ...base, isDebt: true })).toBe(false);
    expect(isSalaryEligible({ ...base, isDebtRepayment: true })).toBe(false);
    expect(isSalaryEligible({ ...base, clientId: 'transfer-income-abc' })).toBe(false);
    expect(isSalaryEligible({ ...base, amount: 0 })).toBe(false);
  });
});

describe('findSalaryCandidates', () => {
  it('finds a monthly series even when the amount changes (a raise must not split it)', () => {
    const rows = [
      row({ date: day('2026-07-10'), amount: 8000 }),
      row({ date: day('2026-08-10'), amount: 8400 }),
      row({ date: day('2026-09-10'), amount: 8400 }),
    ];
    const c = findSalaryCandidates(rows, NOW);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ key: 'cat-salary|wynagrodzenie acme|PLN', occurrences: 3, currencyCode: 'PLN' });
    expect(c[0].typicalAmount).toBe(8266.67);
  });

  it('ignores irregular income and anything older than 90 days', () => {
    const rows = [
      row({ date: day('2026-09-01'), amount: 50, description: 'Refund' }),
      row({ date: day('2026-09-05'), amount: 60, description: 'Refund' }),
      row({ date: day('2026-03-10'), amount: 8000 }),
      row({ date: day('2026-04-10'), amount: 8000 }),
    ];
    expect(findSalaryCandidates(rows, NOW)).toEqual([]);
  });

  it('orders several candidates by typical amount, largest first', () => {
    const rows = [
      ...monthly('2026-07', 3, 8000),
      ...monthly('2026-07', 3, 1200, { description: 'Najem mieszkania', categoryId: 'cat-rent' }),
    ];
    expect(findSalaryCandidates(rows, NOW).map((c) => c.categoryId)).toEqual(['cat-salary', 'cat-rent']);
  });

  it('a salary entered twice on the same day is still one monthly series', () => {
    const rows = [
      row({ date: day('2026-07-10'), amount: 8000 }),
      row({ date: day('2026-08-10'), amount: 8000 }),
      row({ date: day('2026-08-10'), amount: 8000 }),
      row({ date: day('2026-09-10'), amount: 8000 }),
    ];
    const c = findSalaryCandidates(rows, NOW);
    expect(c).toHaveLength(1);
    expect(c[0].occurrences).toBe(3);
  });

  it('a payday shifted across a holiday keeps the series', () => {
    const rows = [
      row({ date: day('2026-07-01'), amount: 8000 }),
      row({ date: day('2026-08-08'), amount: 8000 }),
      row({ date: day('2026-09-06'), amount: 8000 }),
    ];
    const c = findSalaryCandidates(rows, NOW);
    expect(c).toHaveLength(1);
    expect(c[0].occurrences).toBe(3);
  });
});

describe('nominalChange', () => {
  const key = 'cat-salary|wynagrodzenie acme|PLN';

  it('compares the mean monthly salary of the last 12 months with the 12 before', () => {
    const rows = [...monthly('2024-10', 12, 8000), ...monthly('2025-10', 12, 8400)];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }))
      .toEqual({ nominalChangePct: 5 });
  });

  it('uses the manual previous salary when the prior year is too thin', () => {
    const rows = monthly('2026-04', 6, 8400);
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: 8000 }))
      .toEqual({ nominalChangePct: 5 });
  });

  it('returns null when the prior year is thin and there is no manual figure', () => {
    const rows = monthly('2026-04', 6, 8400);
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBeNull();
  });

  it('counts two payments in one month as one month of salary', () => {
    const rows = [
      ...monthly('2024-10', 12, 8000),
      ...monthly('2025-10', 12, 4200),
      ...monthly('2025-10', 12, 4200).map((r) => ({ ...r, date: new Date(r.date.getTime() + 14 * 86400000) })),
    ];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(5);
  });

  it('a salary in a foreign currency needs no FX rate', () => {
    const rows = [...monthly('2024-10', 12, 2000, { currencyCode: 'EUR' }), ...monthly('2025-10', 12, 2100, { currencyCode: 'EUR' })];
    const eurKey = 'cat-salary|wynagrodzenie acme|EUR';
    expect(nominalChange({ rows, salaryKey: eurKey, now: NOW, manualPreviousMonthly: null }))
      .toEqual({ nominalChangePct: 5 });
  });

  it('ignores rows that do not belong to the confirmed key', () => {
    const rows = [...monthly('2024-10', 12, 8000), ...monthly('2025-10', 12, 8400), ...monthly('2025-10', 12, 99999, { description: 'Bonus' })];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(5);
  });

  it('a duplicated month does not inflate the change', () => {
    const baseRows = [...monthly('2024-10', 12, 8000), ...monthly('2025-10', 12, 8000)];
    const lastCurrentRow = baseRows[baseRows.length - 1];
    const rows = [...baseRows, { ...lastCurrentRow }];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(0);
  });

  it('a payday moved into the previous month does not inflate the change', () => {
    const firsts = (fromYm: string) => {
      const [y, m] = fromYm.split('-').map(Number);
      return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)));
    };
    const moved: Record<string, string> = {
      '2026-02-01': '2026-01-31', '2026-03-01': '2026-02-28', '2026-05-01': '2026-04-30', '2026-08-01': '2026-07-31',
    };
    const prevRows = firsts('2024-10').map((d) => row({ date: d, amount: 8000 }));
    const curRows = firsts('2025-10').map((d) => {
      const iso = d.toISOString().split('T')[0];
      return row({ date: moved[iso] ? day(moved[iso]) : d, amount: 8000 });
    });
    const rows = [...prevRows, ...curRows];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(0);
  });

  it('two different amounts on one day are both counted', () => {
    const currentRows = monthly('2025-10', 12, 4200);
    const currentWithExtra = currentRows.flatMap((r) => [r, { ...r, amount: 4200.01 }]);
    const rows = [...monthly('2024-10', 12, 8000), ...currentWithExtra];
    expect(nominalChange({ rows, salaryKey: key, now: NOW, manualPreviousMonthly: null }).nominalChangePct)
      .toBe(5);
  });
});
