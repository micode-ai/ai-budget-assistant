import * as ni18n from './notification-i18n';

// The debt reminder goes to the debt's owner, who can be either the lender or
// the borrower. Polish once shipped the lender's wording for both, telling a
// borrower "Pożyczyłeś…" (you lent) about money they owe.
const LANGS = ['en', 'ru', 'ua', 'pl', 'es', 'fr', 'de', 'be', 'nl'];

describe('debt reminder bodies', () => {
  const base = { contactName: 'Kuba', amount: '50', currencyCode: 'PLN' };

  it.each(LANGS)('%s words a borrowed debt differently from a lent one (upcoming)', (lang) => {
    const lent = ni18n.debtUpcomingBody(lang, { ...base, days: 3, type: 'lent' });
    const borrowed = ni18n.debtUpcomingBody(lang, { ...base, days: 3, type: 'borrowed' });
    expect(borrowed).not.toEqual(lent);
    expect(borrowed).toContain('50');
  });

  it.each(LANGS)('%s words a borrowed debt differently from a lent one (overdue)', (lang) => {
    const lent = ni18n.debtOverdueBody(lang, { ...base, type: 'lent' });
    const borrowed = ni18n.debtOverdueBody(lang, { ...base, type: 'borrowed' });
    expect(borrowed).not.toEqual(lent);
    expect(borrowed).toContain('50');
  });
});
