import { filterAvailableRecentNames } from '../recentParticipants';

describe('filterAvailableRecentNames', () => {
  it('returns every recent name when the query is empty and none are already added', () => {
    expect(filterAvailableRecentNames(['Alice', 'Bob'], '', [])).toEqual(['Alice', 'Bob']);
  });

  it('excludes a name already added to the current split (case-insensitive, trimmed)', () => {
    expect(filterAvailableRecentNames(['Alice', 'Bob'], '', ['  alice  '])).toEqual(['Bob']);
  });

  it('narrows to a substring match while typing', () => {
    expect(filterAvailableRecentNames(['Alice', 'Bob', 'Alicia'], 'ali', [])).toEqual([
      'Alice',
      'Alicia',
    ]);
  });

  it('matching is case-insensitive', () => {
    expect(filterAvailableRecentNames(['Alice'], 'ALI', [])).toEqual(['Alice']);
  });

  it('preserves the incoming (server-provided recency) order', () => {
    expect(filterAvailableRecentNames(['Carol', 'Bob', 'Alice'], '', [])).toEqual([
      'Carol',
      'Bob',
      'Alice',
    ]);
  });

  it('returns an empty array when everything recent is already added', () => {
    expect(filterAvailableRecentNames(['Alice', 'Bob'], '', ['Alice', 'Bob'])).toEqual([]);
  });

  it('returns an empty array when nothing matches the typed query', () => {
    expect(filterAvailableRecentNames(['Alice', 'Bob'], 'zzz', [])).toEqual([]);
  });
});
