jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

import { categoryLabel, projectLabel, tagLabel } from '../entityLabel';

describe('categoryLabel', () => {
  it('returns the trimmed real name', () => {
    expect(categoryLabel({ name: '  Groceries  ' })).toBe('Groceries');
  });

  it('falls back for a missing entity (undefined)', () => {
    expect(categoryLabel(undefined)).toBe('common.uncategorized');
  });

  it('falls back for a missing entity (null)', () => {
    expect(categoryLabel(null)).toBe('common.uncategorized');
  });

  it('falls back for an empty-string name', () => {
    expect(categoryLabel({ name: '' })).toBe('common.uncategorized');
  });

  it('falls back for a whitespace-only name', () => {
    expect(categoryLabel({ name: '   ' })).toBe('common.uncategorized');
  });
});

describe('projectLabel', () => {
  it('returns the trimmed real name', () => {
    expect(projectLabel({ name: '  Kitchen remodel  ' })).toBe('Kitchen remodel');
  });

  it('falls back for a missing entity (undefined)', () => {
    expect(projectLabel(undefined)).toBe('common.unknownProject');
  });

  it('falls back for a missing entity (null)', () => {
    expect(projectLabel(null)).toBe('common.unknownProject');
  });

  it('falls back for an empty-string name', () => {
    expect(projectLabel({ name: '' })).toBe('common.unknownProject');
  });

  it('falls back for a whitespace-only name', () => {
    expect(projectLabel({ name: '   ' })).toBe('common.unknownProject');
  });
});

describe('tagLabel', () => {
  it('returns the trimmed real name', () => {
    expect(tagLabel({ name: '  urgent  ' })).toBe('urgent');
  });

  it('falls back for a missing entity (undefined)', () => {
    expect(tagLabel(undefined)).toBe('common.unknownTag');
  });

  it('falls back for a missing entity (null)', () => {
    expect(tagLabel(null)).toBe('common.unknownTag');
  });

  it('falls back for an empty-string name', () => {
    expect(tagLabel({ name: '' })).toBe('common.unknownTag');
  });

  it('falls back for a whitespace-only name', () => {
    expect(tagLabel({ name: '   ' })).toBe('common.unknownTag');
  });
});
