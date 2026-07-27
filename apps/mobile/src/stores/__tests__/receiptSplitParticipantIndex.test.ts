import {
  parseParticipantIndex,
  mergeParticipantIndex,
  recordParticipants,
  resolveExpenseIdForParticipant,
} from '../receiptSplitParticipantIndex';

describe('parseParticipantIndex', () => {
  it('returns an empty object for missing data', () => {
    expect(parseParticipantIndex(undefined)).toEqual({});
  });

  it('parses a stored JSON object of participantId -> expenseId', () => {
    expect(parseParticipantIndex('{"p1":"e1","p2":"e2"}')).toEqual({ p1: 'e1', p2: 'e2' });
  });

  it('ignores non-string values', () => {
    expect(parseParticipantIndex('{"p1":"e1","p2":1,"p3":null}')).toEqual({ p1: 'e1' });
  });

  it('returns an empty object for corrupt JSON or a non-object (e.g. an array)', () => {
    expect(parseParticipantIndex('not json')).toEqual({});
    expect(parseParticipantIndex('["p1","e1"]')).toEqual({});
  });
});

describe('mergeParticipantIndex', () => {
  it('merges additions into the existing index', () => {
    expect(mergeParticipantIndex({ p1: 'e1' }, { p2: 'e2' })).toEqual({ p1: 'e1', p2: 'e2' });
  });

  it('caps total size, dropping the oldest-inserted entries first', () => {
    const existing = { p1: 'e1', p2: 'e2', p3: 'e3' };
    const result = mergeParticipantIndex(existing, { p4: 'e4' }, 3);
    expect(result).toEqual({ p2: 'e2', p3: 'e3', p4: 'e4' });
    expect(result.p1).toBeUndefined();
  });
});

describe('recordParticipants / resolveExpenseIdForParticipant', () => {
  it('resolves an expense id for a participant recorded earlier', () => {
    recordParticipants('expense-99', ['alice-participant', 'bob-participant']);

    expect(resolveExpenseIdForParticipant('alice-participant')).toBe('expense-99');
    expect(resolveExpenseIdForParticipant('bob-participant')).toBe('expense-99');
  });

  it('returns undefined for a participant id this device never recorded', () => {
    expect(resolveExpenseIdForParticipant('never-seen-participant')).toBeUndefined();
  });

  it('is a no-op for an empty participant list', () => {
    // Recording nothing must not throw and must not resolve to anything.
    recordParticipants('expense-1', []);
    expect(resolveExpenseIdForParticipant('expense-1')).toBeUndefined();
  });
});
