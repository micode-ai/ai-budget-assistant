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

// ABA-653: the group reminder goes to a debtor ("you owe") or a creditor ("you are owed"); the
// same mistake as ABA-628 would tell a creditor they owe money.
describe('group reminder copy', () => {
  const base = { groupName: 'Flat', amount: '42.00', currencyCode: 'PLN' };

  it.each(LANGS)('%s words owe and owed differently, title and body', (lang) => {
    const owe = { ...base, direction: 'owe' as const };
    const owed = { ...base, direction: 'owed' as const };
    expect(ni18n.groupReminderTitle(lang, owe)).not.toEqual(ni18n.groupReminderTitle(lang, owed));
    expect(ni18n.groupReminderBody(lang, owe)).not.toEqual(ni18n.groupReminderBody(lang, owed));
    for (const p of [owe, owed]) {
      expect(ni18n.groupReminderTitle(lang, p)).toContain('Flat');
      expect(ni18n.groupReminderBody(lang, p)).toContain('42.00 PLN');
      expect(ni18n.groupReminderBody(lang, p)).toContain('Flat');
    }
  });

  it('a non-English locale is really translated', () => {
    const owe = { ...base, direction: 'owe' as const };
    for (const lang of LANGS.filter((l) => l !== 'en')) {
      expect(ni18n.groupReminderBody(lang, owe)).not.toEqual(ni18n.groupReminderBody('en', owe));
    }
  });
});
