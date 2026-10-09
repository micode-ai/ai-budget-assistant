import { renderGroupActivityPage } from './helpers/group-guest-page';
import { GROUP_GUEST_TRANSLATIONS, getGroupGuestStrings } from './helpers/group-guest-page-i18n';

/** ABA-654 review M2: the guest activity row marks a manually entered rate. */
const model = (manualRate: boolean | undefined, currencyCode = 'EUR'): any => ({
  token: 'tok',
  lang: 'en',
  currencyCode: 'PLN',
  me: null,
  nextBefore: null,
  activity: [
    {
      kind: 'expense',
      id: 'e1',
      description: 'Dinner',
      amount: 135,
      original: { amount: 30, currencyCode, manualRate },
      date: '2026-10-09',
      paidByName: '<b>Ann</b>',
      addedByName: null,
      deleted: false,
      canDelete: false,
    },
  ],
});

describe('guest page manual-rate marker (ABA-654 M2)', () => {
  it('shows the tag only for a manual rate', () => {
    const s = getGroupGuestStrings('en');
    expect(renderGroupActivityPage(model(true), s)).toContain('<span class="tag">manual rate</span>');
    expect(renderGroupActivityPage(model(false), s)).not.toContain('manual rate');
    expect(renderGroupActivityPage(model(undefined), s)).not.toContain('manual rate');
  });

  it('renders the tag in the page language and escapes other row content', () => {
    const html = renderGroupActivityPage(model(true), getGroupGuestStrings('pl'));
    expect(html).toContain('kurs ręczny');
    expect(html).not.toContain('<b>Ann</b>');
  });

  it('every guest-page language has the tag and the busy message', () => {
    for (const [lang, dict] of Object.entries(GROUP_GUEST_TRANSLATIONS)) {
      expect(typeof dict.manualRateTag).toBe('string');
      expect(dict.manualRateTag.length).toBeGreaterThan(0);
      expect(dict.msgBusy.length).toBeGreaterThan(0);
      if (lang !== 'en') expect(dict.manualRateTag).not.toBe(GROUP_GUEST_TRANSLATIONS.en.manualRateTag);
    }
    expect(Object.keys(GROUP_GUEST_TRANSLATIONS)).toHaveLength(9);
  });
});
