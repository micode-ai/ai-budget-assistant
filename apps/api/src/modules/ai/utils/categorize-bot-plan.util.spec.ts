import { buildBotSteps } from './categorize-bot-plan.util';
import type { CategorizeSuggestionsResponse } from '@budget/shared-types';

function response(groups: CategorizeSuggestionsResponse['groups']): CategorizeSuggestionsResponse {
  return {
    expenses: [],
    groups,
    unassigned: [],
    skippedEncrypted: 0,
    remainingToday: 5,
    limitReached: false,
  };
}

describe('buildBotSteps', () => {
  it('maps an existing-category group using the name lookup', () => {
    const names = new Map([['cat-1', 'Groceries']]);
    const steps = buildBotSteps(
      response([{ categoryId: 'cat-1', proposedName: null, expenseIds: ['e1', 'e2'] }]),
      names,
    );
    expect(steps).toEqual([
      { categoryId: 'cat-1', name: 'Groceries', isNew: false, expenseIds: ['e1', 'e2'] },
    ]);
  });

  it('falls back to the raw id when the name lookup is missing (never throws)', () => {
    const steps = buildBotSteps(
      response([{ categoryId: 'cat-x', proposedName: null, expenseIds: ['e1'] }]),
      new Map(),
    );
    expect(steps[0].name).toBe('cat-x');
  });

  it('maps a new-category proposal from its proposedName', () => {
    const steps = buildBotSteps(
      response([{ categoryId: null, proposedName: 'Hardware', expenseIds: ['e1', 'e2', 'e3'] }]),
      new Map(),
    );
    expect(steps).toEqual([
      { categoryId: null, name: 'Hardware', isNew: true, expenseIds: ['e1', 'e2', 'e3'] },
    ]);
  });

  it('drops groups with no expenses', () => {
    const steps = buildBotSteps(
      response([{ categoryId: 'cat-1', proposedName: null, expenseIds: [] }]),
      new Map([['cat-1', 'Groceries']]),
    );
    expect(steps).toEqual([]);
  });

  it('sorts largest group first', () => {
    const names = new Map([['cat-1', 'Groceries'], ['cat-2', 'Transport']]);
    const steps = buildBotSteps(
      response([
        { categoryId: 'cat-1', proposedName: null, expenseIds: ['e1'] },
        { categoryId: 'cat-2', proposedName: null, expenseIds: ['e2', 'e3', 'e4'] },
      ]),
      names,
    );
    expect(steps.map((s) => s.name)).toEqual(['Transport', 'Groceries']);
  });

  it('does not mutate its input', () => {
    const groups: CategorizeSuggestionsResponse['groups'] = [
      { categoryId: 'cat-1', proposedName: null, expenseIds: ['e1'] },
    ];
    const snapshot = JSON.parse(JSON.stringify(groups));
    buildBotSteps(response(groups), new Map([['cat-1', 'Groceries']]));
    expect(groups).toEqual(snapshot);
  });
});
