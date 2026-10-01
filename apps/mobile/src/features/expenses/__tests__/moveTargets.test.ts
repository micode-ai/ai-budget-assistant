import { getMoveTargets } from '../moveTargets';

const acc = (id: string, myRole: 'owner' | 'editor' | 'viewer') => ({ id, myRole });

describe('getMoveTargets', () => {
  it('excludes the current account and viewer accounts', () => {
    const result = getMoveTargets([acc('a', 'owner'), acc('b', 'editor'), acc('c', 'viewer')], 'a');
    expect(result.map((x) => x.id)).toEqual(['b']);
  });

  it('is empty when the only other account is a viewer one', () => {
    expect(getMoveTargets([acc('a', 'owner'), acc('c', 'viewer')], 'a')).toEqual([]);
  });

  it('keeps every writable account when no current account is set', () => {
    expect(getMoveTargets([acc('a', 'owner'), acc('b', 'editor')], null)).toHaveLength(2);
  });
});
