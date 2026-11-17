import { accountFooter, mentionsAccountName, resolveAccountFromMessage } from './bot-account';

const accounts = [
  { id: 'a', name: 'Дом', currencyCode: 'PLN' },
  { id: 'b', name: 'Family', currencyCode: 'PLN' },
  { id: 'c', name: 'Family Trip', currencyCode: 'EUR' },
];

describe('bot account resolution (ABA-812)', () => {
  it('matches an account name only as a whole word', () => {
    expect(mentionsAccountName('купил хлеб домой', 'Дом')).toBe(false);
    expect(mentionsAccountName('расход 50 на счёт Дом', 'Дом')).toBe(true);
    expect(mentionsAccountName('carrots 5', 'Car')).toBe(false);
    expect(mentionsAccountName('car: fuel 200', 'Car')).toBe(true);
    expect(mentionsAccountName('anything', 'X')).toBe(false);
  });

  it('keeps the linked account when no account is named', () => {
    expect(resolveAccountFromMessage('купил хлеб домой', accounts, 'b')).toEqual({
      resolvedAccountId: 'b',
      resolvedAccountName: null,
      wasOverridden: false,
    });
  });

  it('takes the most specific named account and says when it overrides', () => {
    const r = resolveAccountFromMessage('dinner 40 in Family Trip', accounts, 'a');
    expect(r).toEqual({ resolvedAccountId: 'c', resolvedAccountName: 'Family Trip', wasOverridden: true });
    expect(resolveAccountFromMessage('Family groceries', accounts, 'b').wasOverridden).toBe(false);
  });

  it('never overrides for a user with one account', () => {
    expect(resolveAccountFromMessage('Дом 50', [accounts[0]], 'a').wasOverridden).toBe(false);
  });

  it('writes the footer only for a user with more than one account, escaped by the caller', () => {
    const t = (key: string, _l?: string, p?: Record<string, string>) => `${key}:${p?.name}`;
    expect(accountFooter(t, 'en', { name: 'Home', multiAccount: false })).toBe('');
    expect(accountFooter(t, 'en', { name: 'A<B', multiAccount: true }, (s) => s.replace('<', '&lt;'))).toBe(
      '\n\naccountFooter:A&lt;B',
    );
    expect(accountFooter(t, 'en', { name: 'Home', multiAccount: true, fromMessage: true })).toBe(
      '\n\naccountFooterFromMessage:Home',
    );
  });
});
