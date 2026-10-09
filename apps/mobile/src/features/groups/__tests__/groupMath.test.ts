import {
  canRecordPayment,
  checkSettleAmountInput,
  defaultSettleAmount,
  isSettlementExceedsBalance,
  maxSettleAmount,
  settleCounterparts,
  isAlreadyMember,
  isLedgerChanged,
  isLinkCodeInvalid,
  myPosition,
  transfersInvolvingMe,
} from '../groupMath';

const err = (status: number, code?: string) => Object.assign(new Error('x'), { status, code });

describe('error mapping', () => {
  it('detects LEDGER_CHANGED only on 409 with that code', () => {
    expect(isLedgerChanged(err(409, 'LEDGER_CHANGED'))).toBe(true);
    expect(isLedgerChanged(err(409))).toBe(false);
    expect(isLedgerChanged(err(400, 'LEDGER_CHANGED'))).toBe(false);
    expect(isLedgerChanged(null)).toBe(false);
  });

  it('detects already-member and invalid code', () => {
    expect(isAlreadyMember(err(409, 'ALREADY_MEMBER'))).toBe(true);
    expect(isAlreadyMember(err(409, 'LEDGER_CHANGED'))).toBe(false);
    expect(isLinkCodeInvalid(err(410, 'LINK_CODE_INVALID'))).toBe(true);
    expect(isLinkCodeInvalid(err(404))).toBe(false);
  });
});

describe('myPosition / transfersInvolvingMe', () => {
  const detail = {
    myMemberId: 'a',
    balances: [
      { memberId: 'a', netAmount: -12.5 },
      { memberId: 'b', netAmount: 12.5 },
    ],
    suggestedTransfers: [
      { fromMemberId: 'a', toMemberId: 'b', amount: 12.5 },
      { fromMemberId: 'c', toMemberId: 'a', amount: 3 },
      { fromMemberId: 'c', toMemberId: 'b', amount: 1 },
    ],
  };

  it('computes owe / owed', () => {
    expect(myPosition(detail)).toEqual({ net: -12.5, owed: 0, owe: 12.5 });
    expect(myPosition({ ...detail, myMemberId: 'b' })).toEqual({ net: 12.5, owed: 12.5, owe: 0 });
    expect(myPosition({ ...detail, myMemberId: 'zz' })).toEqual({ net: 0, owed: 0, owe: 0 });
  });

  it('picks transfers that involve me', () => {
    const r = transfersInvolvingMe(detail);
    expect(r.iPay).toEqual([detail.suggestedTransfers[0]]);
    expect(r.paidToMe).toEqual([detail.suggestedTransfers[1]]);
  });
});

// ------------------------------------------------------------ ABA-652 settle amounts

describe('settle amounts (ABA-652)', () => {
  // a owes 50, b owes 10, c is owed 30, d is owed 30. Suggested: a->c 30, a->d 20, b->d 10.
  const balances = [
    { memberId: 'a', netAmount: -50 },
    { memberId: 'b', netAmount: -10 },
    { memberId: 'c', netAmount: 30 },
    { memberId: 'd', netAmount: 30 },
    { memberId: 'z', netAmount: 0 },
  ];
  const suggestedTransfers = [
    { fromMemberId: 'a', toMemberId: 'c', amount: 30 },
    { fromMemberId: 'a', toMemberId: 'd', amount: 20 },
    { fromMemberId: 'b', toMemberId: 'd', amount: 10 },
  ];
  const members = ['a', 'b', 'c', 'd', 'z'].map((id) => ({ id, displayName: id, removedAt: null })) as never[];
  const detail = (myMemberId: string, over: Record<string, unknown> = {}) =>
    ({ myMemberId, balances, suggestedTransfers, members, status: 'active', ...over }) as never;

  it('maxSettleAmount mirrors the server bound', () => {
    expect(maxSettleAmount(balances, 'a', 'c')).toBe(30);
    expect(maxSettleAmount(balances, 'a', 'd')).toBe(30);
    expect(maxSettleAmount(balances, 'b', 'c')).toBe(10);
    expect(maxSettleAmount(balances, 'c', 'a')).toBeNull();
    expect(maxSettleAmount(balances, 'a', 'b')).toBeNull();
    expect(maxSettleAmount(balances, 'z', 'c')).toBeNull();
    expect(maxSettleAmount(balances, 'a', 'a')).toBeNull();
    expect(maxSettleAmount(balances, undefined, 'c')).toBeNull();
  });

  it('defaultSettleAmount is the suggested transfer, else the full bound', () => {
    expect(defaultSettleAmount(detail('a'), 'a', 'd')).toBe(20);
    expect(defaultSettleAmount(detail('b'), 'b', 'c')).toBe(10);
    expect(defaultSettleAmount(detail('c'), 'c', 'a')).toBeNull();
  });

  it.each([
    ['30', 30, { ok: true, amount: 30 }],
    ['12,5', 30, { ok: true, amount: 12.5 }],
    [' 12.34 ', 30, { ok: true, amount: 12.34 }],
    ['30.01', 30, { ok: true, amount: 30 }],
    ['30.02', 30, { ok: false, reason: 'tooMuch' }],
    ['0', 30, { ok: false, reason: 'tooSmall' }],
    ['0.00', 30, { ok: false, reason: 'tooSmall' }],
    ['', 30, { ok: false, reason: 'invalid' }],
    ['-5', 30, { ok: false, reason: 'invalid' }],
    ['1.234', 30, { ok: false, reason: 'invalid' }],
    ['1e3', 30, { ok: false, reason: 'invalid' }],
    ['abc', 30, { ok: false, reason: 'invalid' }],
  ])('checkSettleAmountInput(%p, %p)', (text, max, expected) => {
    expect(checkSettleAmountInput(text as string, max as number)).toEqual(expected);
  });

  it('a debtor may pay any creditor, suggested ones first', () => {
    const r = settleCounterparts(detail('b'));
    expect(r.direction).toBe('pay');
    expect(r.counterparts).toEqual([
      { memberId: 'd', max: 10 },
      { memberId: 'c', max: 10 },
    ]);
  });

  it('a creditor records money from any debtor', () => {
    const r = settleCounterparts(detail('c'));
    expect(r.direction).toBe('receive');
    expect(r.counterparts).toEqual([
      { memberId: 'a', max: 30 },
      { memberId: 'b', max: 10 },
    ]);
  });

  it('someone settled up has nobody to settle with', () => {
    expect(settleCounterparts(detail('z'))).toEqual({ direction: null, counterparts: [] });
    expect(canRecordPayment(detail('z'))).toBe(false);
    expect(canRecordPayment(detail('a'))).toBe(true);
    expect(canRecordPayment(detail('a', { status: 'archived' }))).toBe(false);
  });

  it('never offers a removed member', () => {
    const withRemoved = members.map((m: { id: string }) => (m.id === 'd' ? { ...m, removedAt: '2026-10-01' } : m));
    expect(settleCounterparts(detail('b', { members: withRemoved })).counterparts.map((c) => c.memberId)).toEqual(['c']);
  });

  it('maps the server refusal (and the pre-ABA-652 code) to exceedsBalance', () => {
    expect(isSettlementExceedsBalance(err(400, 'SETTLEMENT_EXCEEDS_BALANCE'))).toBe(true);
    expect(isSettlementExceedsBalance(err(400, 'SETTLEMENT_MISMATCH'))).toBe(true);
    expect(isSettlementExceedsBalance(err(409, 'LEDGER_CHANGED'))).toBe(false);
    expect(isSettlementExceedsBalance(err(400))).toBe(false);
  });
});
