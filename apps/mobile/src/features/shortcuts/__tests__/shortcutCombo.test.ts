import { normalizeShortcutEvent, isEditableTarget, formatComboForDisplay } from '../shortcutCombo';

describe('normalizeShortcutEvent', () => {
  it('lowercases a plain letter key', () => {
    expect(normalizeShortcutEvent({ key: 'N', ctrlKey: false, metaKey: false })).toBe('n');
  });

  it('passes through punctuation keys unchanged', () => {
    expect(normalizeShortcutEvent({ key: '/', ctrlKey: false, metaKey: false })).toBe('/');
    expect(normalizeShortcutEvent({ key: '?', ctrlKey: false, metaKey: false })).toBe('?');
  });

  it('maps named keys to a canonical lowercase name', () => {
    expect(normalizeShortcutEvent({ key: 'ArrowUp', ctrlKey: false, metaKey: false })).toBe('arrowup');
    expect(normalizeShortcutEvent({ key: 'ArrowDown', ctrlKey: false, metaKey: false })).toBe('arrowdown');
    expect(normalizeShortcutEvent({ key: ' ', ctrlKey: false, metaKey: false })).toBe('space');
    expect(normalizeShortcutEvent({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe('enter');
    expect(normalizeShortcutEvent({ key: 'Escape', ctrlKey: false, metaKey: false })).toBe('escape');
  });

  it('prefixes "mod+" for either Ctrl or Cmd, never both spelled out', () => {
    expect(normalizeShortcutEvent({ key: 'k', ctrlKey: true, metaKey: false })).toBe('mod+k');
    expect(normalizeShortcutEvent({ key: 'k', ctrlKey: false, metaKey: true })).toBe('mod+k');
    expect(normalizeShortcutEvent({ key: 'k', ctrlKey: true, metaKey: true })).toBe('mod+k');
  });

  it('does not prefix a plain key with no modifier held', () => {
    expect(normalizeShortcutEvent({ key: 'k', ctrlKey: false, metaKey: false })).toBe('k');
  });
});

describe('isEditableTarget', () => {
  it('is false for a missing target', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });

  it('is false for an ordinary element', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
  });

  it('is true for input-shaped elements, case-insensitively', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'input' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
  });

  it('is true for a contenteditable node regardless of tag', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
});

describe('formatComboForDisplay', () => {
  it('renders a plain key uppercased', () => {
    expect(formatComboForDisplay('n', false)).toBe('N');
  });

  it('renders punctuation and named keys with their own labels', () => {
    expect(formatComboForDisplay('/', false)).toBe('/');
    expect(formatComboForDisplay('?', false)).toBe('?');
    expect(formatComboForDisplay('arrowup', false)).toBe('↑');
    expect(formatComboForDisplay('arrowdown', false)).toBe('↓');
    expect(formatComboForDisplay('space', false)).toBe('Space');
    expect(formatComboForDisplay('enter', false)).toBe('Enter');
  });

  it('renders a mod combo differently per platform', () => {
    expect(formatComboForDisplay('mod+k', false)).toBe('Ctrl+K');
    expect(formatComboForDisplay('mod+k', true)).toBe('⌘K');
  });
});
