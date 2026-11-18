import { buildPriceCheckLine } from './bot-receipt-price-check';
import { t as telegramT } from '../modules/telegram/helpers/i18n';
import { t as whatsappT } from '../modules/whatsapp/helpers/i18n';
import { t as slackT } from '../modules/slack/helpers/i18n';

const findings = (n: number) =>
  Array.from({ length: n }, () => ({ canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' }));

describe.each([
  ['telegram', telegramT],
  ['whatsapp', whatsappT],
  ['slack', slackT],
])('buildPriceCheckLine (%s dictionary)', (_name, translate) => {
  it('reports count and total when the scan returned findings', () => {
    const line = buildPriceCheckLine(
      {
        priceFindings: [
          { canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' },
          { canonicalName: 'Mleko', overpaidAmount: 2, currencyCode: 'PLN' },
        ],
      } as any,
      translate as any,
      'en',
    );
    expect(line).toContain('2');
    expect(line).toContain('6');
  });

  it('returns an empty string when there are no findings', () => {
    expect(buildPriceCheckLine({ priceFindings: [] } as any, translate as any, 'en')).toBe('');
    expect(buildPriceCheckLine({} as any, translate as any, 'en')).toBe('');
  });

  // The count must be the last token of its clause so no noun has to agree with it (ru).
  it.each([1, 2, 5])('keeps the count away from any agreeing noun (ru, count=%i)', (n) => {
    const line = buildPriceCheckLine({ priceFindings: findings(n) } as any, translate as any, 'ru');
    expect(line).toMatch(new RegExp(`${n}\\s*(,|\\.|$)`));
    expect(line).not.toMatch(new RegExp(`${n}\\s+\\p{L}`, 'u'));
  });
});
