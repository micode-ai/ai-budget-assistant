import { buildGroupPayLink } from '../groupPay';
import { extractGroupToken, isGroupLinkCode, joinErrorKind, resolvePendingGroupLink } from '../groupLink';
import { findCurrentTransfer, balanceOf, canModifyExpense, canVoidSettlement, hasOpenBalances, memberName } from '../groupDisplay';

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('buildGroupPayLink', () => {
  it('mirrors the trip wallet revolut.me and paypal.me shapes', () => {
    expect(buildGroupPayLink('revolut', 'anna k', 12.5, 'PLN')).toEqual({
      link: 'https://revolut.me/anna%20k?amount=12.5&currency=PLN',
      instruction: null,
    });
    expect(buildGroupPayLink('paypal', 'anna', 12.5, 'EUR')).toEqual({
      link: 'https://paypal.me/anna/12.5EUR',
      instruction: null,
    });
  });

  it('gives instructions, not a link, for blik / cash / other', () => {
    expect(buildGroupPayLink('blik', '500600700', 10, 'PLN')).toEqual({ link: null, instruction: 'blik' });
    expect(buildGroupPayLink('cash', 'tomorrow', 10, 'PLN').instruction).toBe('cash');
    expect(buildGroupPayLink('other', 'PL00', 10, 'PLN').instruction).toBe('other');
  });

  it('returns nothing without a handle or a method', () => {
    expect(buildGroupPayLink('revolut', '  ', 10, 'PLN')).toEqual({ link: null, instruction: null });
    expect(buildGroupPayLink(null, 'x', 10, 'PLN')).toEqual({ link: null, instruction: null });
  });
});

describe('extractGroupToken', () => {
  it('reads a /g/ link, a ?t= link and a bare token', () => {
    expect(extractGroupToken(`https://api.ai-budget.pl/g/${TOKEN}`)).toBe(TOKEN);
    expect(extractGroupToken(`https://api.ai-budget.pl/g/${TOKEN}?lang=pl`)).toBe(TOKEN);
    expect(extractGroupToken(`budget://groups/join?t=${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    expect(extractGroupToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it('rejects anything else, including a longer hex run', () => {
    expect(extractGroupToken('')).toBeNull();
    expect(extractGroupToken('hello')).toBeNull();
    expect(extractGroupToken(`https://x/g/${TOKEN}ff`)).toBeNull();
    expect(extractGroupToken(null)).toBeNull();
  });
});

describe('isGroupLinkCode', () => {
  it('accepts 32 hex only', () => {
    expect(isGroupLinkCode(TOKEN)).toBe(true);
    expect(isGroupLinkCode('abc')).toBe(false);
    expect(isGroupLinkCode(null)).toBe(false);
  });
});

describe('groupDisplay', () => {
  const detail = {
    isOwner: false,
    myMemberId: 'me',
    members: [
      { id: 'me', displayName: 'Ola', removedAt: null },
      { id: 'x', displayName: 'Gone', removedAt: '2026-01-01' },
    ],
    balances: [
      { memberId: 'me', netAmount: 5 },
      { memberId: 'x', netAmount: 0 },
    ],
  } as never;

  it('resolves names including removed members', () => {
    expect(memberName(detail, 'x')).toBe('Gone');
    expect(memberName(detail, 'nope')).toBe('');
    expect(memberName(detail, null)).toBe('');
  });

  it('reads balances', () => {
    expect(balanceOf(detail, 'me')).toBe(5);
    expect(balanceOf(detail, 'zzz')).toBe(0);
    expect(hasOpenBalances(detail)).toBe(true);
  });

  it('gates edit and void to creator/payer/receiver/owner', () => {
    expect(canModifyExpense(detail, { createdByMemberId: 'x', paidByMemberId: 'x' })).toBe(false);
    expect(canModifyExpense(detail, { createdByMemberId: 'x', paidByMemberId: 'me' })).toBe(true);
    expect(canVoidSettlement(detail, { recordedByMemberId: 'x', toMemberId: 'me' })).toBe(true);
    expect(canVoidSettlement(detail, { recordedByMemberId: 'x', toMemberId: 'x' })).toBe(false);
    expect(canModifyExpense({ isOwner: true, myMemberId: 'me' }, { createdByMemberId: 'x', paidByMemberId: 'x' })).toBe(true);
  });
});

describe('findCurrentTransfer', () => {
  const detail = { suggestedTransfers: [{ fromMemberId: 'a', toMemberId: 'b', amount: 10 }] };
  it('matches on the pair, not the amount', () => {
    expect(findCurrentTransfer(detail, 'a', 'b')?.amount).toBe(10);
    expect(findCurrentTransfer(detail, 'b', 'a')).toBeNull();
    expect(findCurrentTransfer(detail, undefined, 'b')).toBeNull();
  });
});

describe('resolvePendingGroupLink', () => {
  it('distinguishes nothing, junk and a live code', () => {
    expect(resolvePendingGroupLink(null)).toEqual({ status: 'none' });
    expect(resolvePendingGroupLink('not-a-code')).toEqual({ status: 'discard' });
    expect(resolvePendingGroupLink(`  ${TOKEN.toUpperCase()} `)).toEqual({ status: 'resume', code: TOKEN });
  });
});

describe('joinErrorKind', () => {
  const err = (status: number, code?: string) => ({ status, code });
  it('maps the API failures to friendly kinds', () => {
    expect(joinErrorKind(err(404))).toBe('notFound');
    expect(joinErrorKind(err(403, 'GROUP_ARCHIVED'))).toBe('archived');
    expect(joinErrorKind(err(409, 'ALREADY_MEMBER'))).toBe('alreadyMember');
    expect(joinErrorKind(err(409, 'MEMBER_NAME_TAKEN'))).toBe('nameTaken');
    expect(joinErrorKind(err(500))).toBe('other');
    expect(joinErrorKind(null)).toBe('other');
  });
});
