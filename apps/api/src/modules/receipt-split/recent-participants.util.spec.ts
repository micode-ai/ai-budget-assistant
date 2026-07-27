import {
  dedupeRecentParticipantNames,
  resolveRecentParticipantsLimit,
  RECENT_PARTICIPANTS_DEFAULT_LIMIT,
  RECENT_PARTICIPANTS_MAX_LIMIT,
} from './recent-participants.util';

const row = (name: string, createdAt: string) => ({ name, createdAt: new Date(createdAt) });

describe('dedupeRecentParticipantNames', () => {
  it('returns names in the order given (caller is responsible for DESC-by-createdAt ordering)', () => {
    const rows = [row('Alice', '2026-01-03'), row('Bob', '2026-01-02'), row('Carol', '2026-01-01')];
    expect(dedupeRecentParticipantNames(rows, 10)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('dedupes case-insensitively and by trimmed whitespace, keeping the FIRST (most recent) occurrence', () => {
    const rows = [
      row('Alice', '2026-01-05'),
      row('bob', '2026-01-04'),
      row('  Alice  ', '2026-01-03'),
      row('BOB', '2026-01-02'),
    ];
    expect(dedupeRecentParticipantNames(rows, 10)).toEqual(['Alice', 'bob']);
  });

  it('caps the result at `limit`, keeping only the earliest (most recent) distinct names', () => {
    const rows = [row('A', '2026-01-05'), row('B', '2026-01-04'), row('C', '2026-01-03'), row('D', '2026-01-02')];
    expect(dedupeRecentParticipantNames(rows, 2)).toEqual(['A', 'B']);
  });

  it('skips a blank (post-trim) name', () => {
    const rows = [row('   ', '2026-01-02'), row('Alice', '2026-01-01')];
    expect(dedupeRecentParticipantNames(rows, 10)).toEqual(['Alice']);
  });

  it('returns an empty array for no rows', () => {
    expect(dedupeRecentParticipantNames([], 10)).toEqual([]);
  });
});

describe('resolveRecentParticipantsLimit', () => {
  it('parses a valid numeric string', () => {
    expect(resolveRecentParticipantsLimit('5')).toBe(5);
  });

  it('truncates a fractional value', () => {
    expect(resolveRecentParticipantsLimit('5.9')).toBe(5);
  });

  it('falls back to the default for undefined/missing input', () => {
    expect(resolveRecentParticipantsLimit(undefined)).toBe(RECENT_PARTICIPANTS_DEFAULT_LIMIT);
  });

  it('falls back to the default for a non-numeric string', () => {
    expect(resolveRecentParticipantsLimit('abc')).toBe(RECENT_PARTICIPANTS_DEFAULT_LIMIT);
  });

  it('falls back to the default for zero or negative values', () => {
    expect(resolveRecentParticipantsLimit('0')).toBe(RECENT_PARTICIPANTS_DEFAULT_LIMIT);
    expect(resolveRecentParticipantsLimit('-3')).toBe(RECENT_PARTICIPANTS_DEFAULT_LIMIT);
  });

  it('clamps a value above the max down to the max', () => {
    expect(resolveRecentParticipantsLimit('999')).toBe(RECENT_PARTICIPANTS_MAX_LIMIT);
  });
});
