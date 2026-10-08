import {
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
