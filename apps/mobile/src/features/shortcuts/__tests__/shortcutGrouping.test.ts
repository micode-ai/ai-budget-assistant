import { groupShortcutDescriptors } from '../shortcutGrouping';

describe('groupShortcutDescriptors', () => {
  it('returns nothing for an empty list', () => {
    expect(groupShortcutDescriptors([])).toEqual([]);
  });

  it('drops a descriptor with no description — an active but unadvertised binding', () => {
    expect(groupShortcutDescriptors([{ combo: 'x', description: undefined }])).toEqual([]);
  });

  it('groups two combos sharing one description into one row', () => {
    const groups = groupShortcutDescriptors([
      { combo: 'arrowup', description: 'Move between rows' },
      { combo: 'arrowdown', description: 'Move between rows' },
    ]);
    expect(groups).toEqual([{ description: 'Move between rows', combos: ['arrowup', 'arrowdown'] }]);
  });

  it('de-duplicates the same combo registered twice under one description', () => {
    const groups = groupShortcutDescriptors([
      { combo: '/', description: 'Focus search' },
      { combo: '/', description: 'Focus search' },
      { combo: 'mod+k', description: 'Focus search' },
    ]);
    expect(groups).toEqual([{ description: 'Focus search', combos: ['/', 'mod+k'] }]);
  });

  it('orders groups by first-seen description', () => {
    const groups = groupShortcutDescriptors([
      { combo: 'n', description: 'New expense' },
      { combo: '/', description: 'Focus search' },
    ]);
    expect(groups.map((g) => g.description)).toEqual(['New expense', 'Focus search']);
  });

  it('keeps two distinct descriptions separate even with distinct combos', () => {
    const groups = groupShortcutDescriptors([
      { combo: 'n', description: 'New expense' },
      { combo: 'enter', description: 'Open row' },
    ]);
    expect(groups).toEqual([
      { description: 'New expense', combos: ['n'] },
      { description: 'Open row', combos: ['enter'] },
    ]);
  });
});
