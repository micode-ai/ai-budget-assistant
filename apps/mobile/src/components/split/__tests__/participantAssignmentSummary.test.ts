import { computeParticipantAssignmentSummaries } from '../participantAssignmentSummary';

describe('computeParticipantAssignmentSummaries', () => {
  it('returns an empty map for no participants', () => {
    expect(computeParticipantAssignmentSummaries([], {}, new Map())).toEqual({});
  });

  it('gives every participant a {count:0, subtotal:0} entry when nothing is assigned yet', () => {
    const result = computeParticipantAssignmentSummaries(['p1', 'p2'], {}, new Map());
    expect(result).toEqual({
      p1: { count: 0, subtotal: 0 },
      p2: { count: 0, subtotal: 0 },
    });
  });

  it('sums count and subtotal for multiple items assigned to the same participant', () => {
    const prices = new Map([
      ['item-1', 10],
      ['item-2', 5.5],
    ]);
    const result = computeParticipantAssignmentSummaries(
      ['p1'],
      { 'item-1': ['p1'], 'item-2': ['p1'] },
      prices,
    );
    expect(result.p1).toEqual({ count: 2, subtotal: 15.5 });
  });

  it('keeps each participant’s items separate', () => {
    const prices = new Map([
      ['item-1', 10],
      ['item-2', 20],
    ]);
    const result = computeParticipantAssignmentSummaries(
      ['p1', 'p2'],
      { 'item-1': ['p1'], 'item-2': ['p2'] },
      prices,
    );
    expect(result.p1).toEqual({ count: 1, subtotal: 10 });
    expect(result.p2).toEqual({ count: 1, subtotal: 20 });
  });

  it('charges each claimant only their share of a line they share', () => {
    // Three people on one 60 bottle owe 20 each. Charging all three the full
    // 60 would show a number the server never agrees with, and would trip the
    // over-bill guard on a perfectly valid split.
    const result = computeParticipantAssignmentSummaries(
      ['p1', 'p2', 'p3'],
      { wine: ['p1', 'p2', 'p3'] },
      new Map([['wine', 60]]),
    );
    expect(result.p1).toEqual({ count: 1, subtotal: 20 });
    expect(result.p2).toEqual({ count: 1, subtotal: 20 });
    expect(result.p3).toEqual({ count: 1, subtotal: 20 });
  });

  it('counts a shared line as one item for each person on it', () => {
    const result = computeParticipantAssignmentSummaries(
      ['p1', 'p2'],
      { wine: ['p1', 'p2'], bread: ['p1'] },
      new Map([
        ['wine', 60],
        ['bread', 4],
      ]),
    );
    expect(result.p1).toEqual({ count: 2, subtotal: 34 });
    expect(result.p2).toEqual({ count: 1, subtotal: 30 });
  });

  it('ignores an assignment referencing a participant id that is not in the list (e.g. already removed), without throwing or adding a stray entry', () => {
    const prices = new Map([['item-1', 10]]);
    const result = computeParticipantAssignmentSummaries(
      ['p1'],
      { 'item-1': ['removed-participant'] },
      prices,
    );
    expect(result).toEqual({ p1: { count: 0, subtotal: 0 } });
    expect(result['removed-participant']).toBeUndefined();
  });

  it('divides by the claimants who still exist, not by the removed ones', () => {
    // Mid-edit a participant is removed but the assignment map has not caught
    // up. Dividing by the stale count would understate what the survivor owes.
    const result = computeParticipantAssignmentSummaries(
      ['p1'],
      { wine: ['p1', 'removed-participant'] },
      new Map([['wine', 60]]),
    );
    expect(result.p1).toEqual({ count: 1, subtotal: 60 });
  });

  it('treats a missing price lookup as 0 rather than NaN', () => {
    const result = computeParticipantAssignmentSummaries(['p1'], { 'item-1': ['p1'] }, new Map());
    expect(result.p1).toEqual({ count: 1, subtotal: 0 });
  });
});
