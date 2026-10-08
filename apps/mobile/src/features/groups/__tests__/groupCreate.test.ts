import { buildCreateGroupDto, firstGrapheme } from '../groupCreate';

describe('buildCreateGroupDto', () => {
  const base = { name: ' Flat ', emoji: '', currencyCode: 'PLN', myDisplayName: ' Ola ', memberNames: [] };

  it('trims and omits empty optionals', () => {
    expect(buildCreateGroupDto(base)).toEqual({ name: 'Flat', currencyCode: 'PLN', myDisplayName: 'Ola' });
  });

  it('returns null for a blank name', () => {
    expect(buildCreateGroupDto({ ...base, name: '   ' })).toBeNull();
  });

  it('drops blank, duplicate and own-name members case-insensitively', () => {
    const dto = buildCreateGroupDto({
      ...base,
      memberNames: ['Ania', ' ania ', '', 'OLA', 'Tomek'],
    });
    expect(dto?.memberNames).toEqual(['Ania', 'Tomek']);
  });

  it('keeps a single emoji', () => {
    expect(buildCreateGroupDto({ ...base, emoji: '🏠🏠' })?.emoji).toBe('🏠');
  });

  it('omits myDisplayName when blank so the server default applies', () => {
    expect(buildCreateGroupDto({ ...base, myDisplayName: ' ' })).not.toHaveProperty('myDisplayName');
  });
});

describe('firstGrapheme', () => {
  it('is undefined for blank input', () => {
    expect(firstGrapheme('  ')).toBeUndefined();
  });
});
