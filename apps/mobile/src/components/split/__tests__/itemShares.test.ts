import {
  BP_FULL,
  allocatedBp,
  amountFromBp,
  bpFromAmount,
  clearShares,
  equalBp,
  hasExplicitShares,
  isLineOverAllocated,
  overAllocatedItemIds,
  payerBp,
  removeParticipantFromShares,
  removeShare,
  seedEqualShares,
  setShare,
  sharesForParticipant,
} from '../itemShares';

describe('itemShares', () => {
  describe('the payer is the remainder', () => {
    it('gives the payer whatever a line was not handed out', () => {
      const shares = setShare({}, 'chicken', 'edik', 6000);
      expect(allocatedBp(shares, 'chicken')).toBe(6000);
      expect(payerBp(shares, 'chicken')).toBe(4000);
    });

    it('gives the payer the whole line when nobody has a hand-set share', () => {
      expect(payerBp({}, 'chicken')).toBe(BP_FULL);
    });

    it('never reports a negative payer share for an over-allocated line', () => {
      let shares = setShare({}, 'wine', 'a', 7000);
      shares = setShare(shares, 'wine', 'b', 6000);
      expect(payerBp(shares, 'wine')).toBe(0);
      expect(isLineOverAllocated(shares, 'wine')).toBe(true);
      expect(overAllocatedItemIds(shares)).toEqual(['wine']);
    });
  });

  describe('entering and leaving manual mode', () => {
    it('treats a line with no entries as still dividing equally', () => {
      expect(hasExplicitShares({}, 'wine')).toBe(false);
    });

    it('keeps an explicit zero rather than reverting the line to equal', () => {
      // "This person gets nothing off this line" is a real answer. Dropping the
      // entry would silently hand them an equal slice again.
      const shares = setShare({}, 'wine', 'a', 0);
      expect(hasExplicitShares(shares, 'wine')).toBe(true);
      expect(payerBp(shares, 'wine')).toBe(BP_FULL);
    });

    it('seeds from the split a line already had, so editing starts from today', () => {
      const shares = seedEqualShares({}, 'wine', ['a', 'b', 'c']);
      expect(shares.wine).toEqual({ a: 3333, b: 3333, c: 3333 });
      // Floors, so three claimants can never add up to more than the line; the
      // stray basis point stays with the payer, the safe direction.
      expect(allocatedBp(shares, 'wine')).toBeLessThanOrEqual(BP_FULL);
    });

    it('clears back to an equal division', () => {
      const shares = clearShares(setShare({}, 'wine', 'a', 6000), 'wine');
      expect(hasExplicitShares(shares, 'wine')).toBe(false);
    });

    it('reverts the line to equal once its last hand-set share is removed', () => {
      const shares = removeShare(setShare({}, 'wine', 'a', 6000), 'wine', 'a');
      expect(hasExplicitShares(shares, 'wine')).toBe(false);
    });

    it('drops a removed participant from every line so no stale share survives', () => {
      let shares = setShare({}, 'wine', 'a', 6000);
      shares = setShare(shares, 'bread', 'a', 5000);
      shares = setShare(shares, 'bread', 'b', 5000);
      const after = removeParticipantFromShares(shares, 'a');
      expect(hasExplicitShares(after, 'wine')).toBe(false);
      expect(after.bread).toEqual({ b: 5000 });
    });
  });

  describe('typing a percentage or a sum', () => {
    it('converts money to basis points and back', () => {
      const bp = bpFromAmount(6.4, 15.99);
      expect(bp).toBe(4003);
      expect(amountFromBp(bp, 15.99)).toBe(6.4);
    });

    it('renders a round percentage as the money it means', () => {
      expect(amountFromBp(6000, 15.99)).toBe(9.59);
      expect(amountFromBp(BP_FULL, 15.99)).toBe(15.99);
      expect(amountFromBp(0, 15.99)).toBe(0);
    });

    it('reads an impossible line price as nothing rather than everything', () => {
      expect(bpFromAmount(5, 0)).toBe(0);
      expect(bpFromAmount(Number.NaN, 10)).toBe(0);
    });

    it('clamps a share typed above the whole line', () => {
      expect(bpFromAmount(99, 10)).toBe(BP_FULL);
    });
  });

  describe('equalBp', () => {
    it('floors so claimants never exceed the line', () => {
      expect(equalBp(1)).toBe(BP_FULL);
      expect(equalBp(2)).toBe(5000);
      expect(equalBp(3)).toBe(3333);
    });

    it('reads a nonsense claimant count as nothing', () => {
      expect(equalBp(0)).toBe(0);
      expect(equalBp(-2)).toBe(0);
    });
  });

  describe('what gets sent', () => {
    it('sends only the lines a participant was actually given a share of', () => {
      let shares = setShare({}, 'wine', 'edik', 6000);
      shares = setShare(shares, 'bread', 'olya', 5000);
      expect(sharesForParticipant(shares, 'edik')).toEqual({ wine: 6000 });
      expect(sharesForParticipant(shares, 'olya')).toEqual({ bread: 5000 });
      expect(sharesForParticipant(shares, 'nobody')).toEqual({});
    });
  });
});
