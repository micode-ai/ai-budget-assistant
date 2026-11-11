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

// Gazetka match community push: a leaflet price is a claim, not a fact — every language frames it
// as "according to a leaflet, check in store", and none of them urges a purchase.
describe('leaflet promo push copy', () => {
  const CHECK_IN_STORE: Record<string, RegExp> = {
    en: /check in store/i,
    ru: /проверьте в магазине/i,
    ua: /перевірте в магазині/i,
    pl: /sprawdź w sklepie/i,
    es: /compruébalo en la tienda/i,
    fr: /vérifiez en magasin/i,
    de: /im laden prüfen/i,
    be: /праверце ў краме/i,
    nl: /controleer in de winkel/i,
  };
  const withUsual = { name: 'Masło 200g', chain: 'Biedronka', promoPrice: '4.99', currencyCode: 'PLN', usualPrice: '7.49', condition: null, validTo: '2026-11-16' };
  // The promo's end date travels with every line, so a push never reads as "on forever".
  const UNTIL: Record<string, RegExp> = {
    en: /until 16\.11/,
    ru: /до 16\.11/,
    ua: /до 16\.11/,
    pl: /do 16\.11/,
    es: /hasta el 16\.11/,
    fr: /jusqu'au 16\.11/,
    de: /bis 16\.11/,
    be: /да 16\.11/,
    nl: /t\/m 16\.11/,
  };
  const withoutUsual = { ...withUsual, usualPrice: null };

  it('has all 9 languages', () => {
    expect(Object.keys(CHECK_IN_STORE).sort()).toEqual([...LANGS].sort());
  });

  it.each(LANGS)('%s: title, body with the check-in-store wording, price and chain', (lang) => {
    expect(ni18n.leafletPromoTitle(lang).length).toBeGreaterThan(0);
    const body = ni18n.leafletPromoBody(lang, [withUsual]);
    expect(body).toMatch(CHECK_IN_STORE[lang]);
    expect(body).toContain('Masło 200g');
    expect(body).toContain('4.99 PLN');
    expect(body).toContain('Biedronka');
    expect(body).toContain('7.49 PLN');
  });

  it.each(LANGS)('%s: every line says until when the promo runs', (lang) => {
    expect(Object.keys(UNTIL).sort()).toEqual([...LANGS].sort());
    expect(ni18n.leafletPromoBody(lang, [withUsual])).toMatch(UNTIL[lang]);
    expect(ni18n.leafletPromoBody(lang, [withoutUsual])).toMatch(UNTIL[lang]);
  });

  it.each(LANGS)('%s: no usual price → no comparison', (lang) => {
    const body = ni18n.leafletPromoBody(lang, [withoutUsual]);
    expect(body).toMatch(CHECK_IN_STORE[lang]);
    expect(body).not.toContain('7.49');
    expect(body).not.toEqual(ni18n.leafletPromoBody(lang, [withUsual]));
  });

  it.each(LANGS)('%s: lists several items and the condition', (lang) => {
    const body = ni18n.leafletPromoBody(lang, [
      { ...withUsual, condition: 'z aplikacją' },
      { ...withoutUsual, name: 'Mleko 1L', promoPrice: '2.99' },
    ]);
    expect(body).toContain('Masło 200g');
    expect(body).toContain('Mleko 1L');
    expect(body).toContain('z aplikacją');
  });

  it('a non-English locale is really translated', () => {
    for (const lang of LANGS.filter((l) => l !== 'en')) {
      expect(ni18n.leafletPromoBody(lang, [withUsual])).not.toEqual(ni18n.leafletPromoBody('en', [withUsual]));
      expect(ni18n.leafletPromoTitle(lang)).not.toEqual(ni18n.leafletPromoTitle('en'));
    }
  });

  it('never urges a purchase (en)', () => {
    const text = `${ni18n.leafletPromoTitle('en')} ${ni18n.leafletPromoBody('en', [withUsual])}`;
    expect(text).not.toMatch(/buy now|don't miss|hurry|last chance/i);
  });
});
