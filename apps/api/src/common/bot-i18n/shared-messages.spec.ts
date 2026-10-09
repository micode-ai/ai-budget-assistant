import { createBotT, sharedMessages } from './shared-messages';

const LANGS = ['en', 'ru', 'ua', 'de', 'es', 'fr', 'pl', 'be', 'nl'];

describe('sharedMessages — the group command keys (ABA-658)', () => {
  const groupKeys = Object.keys(sharedMessages).filter((k) => k.startsWith('group'));

  it('has the keys the bot group flow uses', () => {
    expect(groupKeys.sort()).toEqual(
      [
        'groupAdded',
        'groupCancelled',
        'groupConfirmCard',
        'groupCurrencyUnsupported',
        'groupExpenseDefault',
        'groupExpired',
        'groupFxUnavailable',
        'groupNone',
        'groupNotAvailable',
        'groupOpenInApp',
        'groupPick',
        'groupPickButton',
        'groupPrivateOnly',
        'groupRateLimited',
        'groupUsage',
      ].sort(),
    );
  });

  it.each(groupKeys)('%s is translated into all 9 languages with the same placeholders', (key) => {
    const entry = sharedMessages[key];
    const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
    for (const lang of LANGS) {
      expect(entry[lang]?.trim()).toBeTruthy();
      expect(placeholders(entry[lang])).toBe(placeholders(entry.en));
    }
  });

  it('keeps the picker button within WhatsApp\'s 20-character limit', () => {
    for (const lang of LANGS) expect([...sharedMessages.groupPickButton[lang]].length).toBeLessThanOrEqual(20);
  });

  it('renders markdown for WhatsApp/Slack without leftover HTML tags', () => {
    const t = createBotT(sharedMessages, { markup: 'markdown' });
    for (const key of groupKeys) {
      for (const lang of LANGS) expect(t(key, lang, { command: 'group', group: 'G', amount: '1', description: 'd', count: '2', currency: 'X' })).not.toMatch(/<\/?(b|code)>/);
    }
  });
});

describe('createBotT replacement values (ABA-658)', () => {
  it('does not interpret $-patterns in user values', () => {
    const t = createBotT({ k: { en: 'Hi {{name}}!' } }, { markup: 'html' });
    for (const v of ['$&', "$'", '$`', '$$', '$1']) expect(t('k', 'en', { name: v })).toBe(`Hi ${v}!`);
  });
});
