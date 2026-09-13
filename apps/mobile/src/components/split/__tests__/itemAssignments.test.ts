import {
  toggleItemAssignment,
  removeParticipantFromAssignments,
  assigneesForItem,
  itemIdsForParticipant,
  assigneeLabel,
} from '../itemAssignments';

describe('toggleItemAssignment', () => {
  it('claims a line for someone who had not claimed it', () => {
    expect(toggleItemAssignment({}, 'wine', 'p1')).toEqual({ wine: ['p1'] });
  });

  it('adds a second claimant instead of replacing the first', () => {
    // The whole point: one bottle, three people. Replacing is what the screen
    // used to do, and it made a shared line impossible to express.
    const once = toggleItemAssignment({}, 'wine', 'p1');
    const twice = toggleItemAssignment(once, 'wine', 'p2');
    expect(twice).toEqual({ wine: ['p1', 'p2'] });
  });

  it('releases a claim on a second tap', () => {
    expect(toggleItemAssignment({ wine: ['p1', 'p2'] }, 'wine', 'p1')).toEqual({ wine: ['p2'] });
  });

  it('drops a line nobody claims any more, rather than leaving an empty list', () => {
    expect(toggleItemAssignment({ wine: ['p1'] }, 'wine', 'p1')).toEqual({});
  });

  it('leaves other lines untouched', () => {
    const before = { wine: ['p1'], bread: ['p2'] };
    expect(toggleItemAssignment(before, 'wine', 'p3')).toEqual({ wine: ['p1', 'p3'], bread: ['p2'] });
  });

  it('does not mutate its input', () => {
    const before = { wine: ['p1'] };
    toggleItemAssignment(before, 'wine', 'p2');
    expect(before).toEqual({ wine: ['p1'] });
  });
});

describe('removeParticipantFromAssignments', () => {
  it('drops the person from every line they claimed', () => {
    const before = { wine: ['p1', 'p2'], bread: ['p1'], soup: ['p2'] };
    expect(removeParticipantFromAssignments(before, 'p1')).toEqual({ wine: ['p2'], soup: ['p2'] });
  });

  it('leaves the map alone when the person claimed nothing', () => {
    expect(removeParticipantFromAssignments({ wine: ['p2'] }, 'p1')).toEqual({ wine: ['p2'] });
  });
});

describe('itemIdsForParticipant', () => {
  it('collects every line this person claimed, shared or not', () => {
    const assignments = { wine: ['p1', 'p2'], bread: ['p1'], soup: ['p2'] };
    expect(itemIdsForParticipant(assignments, 'p1').sort()).toEqual(['bread', 'wine']);
  });

  it('returns nothing for a person with no claims', () => {
    expect(itemIdsForParticipant({ wine: ['p2'] }, 'p1')).toEqual([]);
  });
});

describe('assigneesForItem', () => {
  it('returns an empty list for an unclaimed line', () => {
    expect(assigneesForItem({}, 'wine')).toEqual([]);
  });
});

describe('assigneeLabel', () => {
  const names = new Map([
    ['p1', 'Ann'],
    ['p2', 'Bob'],
    ['p3', 'Cat'],
  ]);

  it('is null for an unclaimed line', () => {
    expect(assigneeLabel({}, 'wine', names)).toBeNull();
  });

  it('is just the name for a single claimant', () => {
    expect(assigneeLabel({ wine: ['p1'] }, 'wine', names)).toBe('Ann');
  });

  it('counts the rest once a line is shared', () => {
    expect(assigneeLabel({ wine: ['p1', 'p2', 'p3'] }, 'wine', names)).toBe('Ann +2');
  });

  it('ignores ids with no matching participant', () => {
    // A participant removed mid-edit; the label must not render "undefined".
    expect(assigneeLabel({ wine: ['p1', 'gone'] }, 'wine', names)).toBe('Ann');
  });

  it('is null when every id is unknown', () => {
    expect(assigneeLabel({ wine: ['gone'] }, 'wine', names)).toBeNull();
  });
});
