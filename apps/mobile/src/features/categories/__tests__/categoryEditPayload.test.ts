import { categoryEditPayload } from '../categoryEditPayload';

describe('categoryEditPayload', () => {
  // The form shows "Zakupy spożywcze" for a row stored as "Groceries". Sending
  // that text back would make the server mark the category renamed.
  it('leaves name out of a colour-only edit of a translated standard category', () => {
    const body = categoryEditPayload({
      prefilledName: 'Zakupy spożywcze',
      typedName: 'Zakupy spożywcze',
      color: '#123456',
      icon: 'basket',
    });
    expect(body).toEqual({ color: '#123456', icon: 'basket' });
    expect('name' in body).toBe(false);
  });

  it('ignores whitespace-only differences from the prefill', () => {
    expect('name' in categoryEditPayload({ prefilledName: 'Kawa', typedName: '  Kawa ' })).toBe(false);
  });

  it('sends the trimmed name when the user changed the text', () => {
    expect(categoryEditPayload({ prefilledName: 'Zakupy spożywcze', typedName: ' Biedronka ' }).name).toBe('Biedronka');
  });

  it('sends parentId only when the parent changed, null clearing it', () => {
    expect('parentId' in categoryEditPayload({ prefilledName: 'A', typedName: 'A', parentId: 'P' })).toBe(false);
    expect(categoryEditPayload({ prefilledName: 'A', typedName: 'A', parentChanged: true }).parentId).toBeNull();
    expect(categoryEditPayload({ prefilledName: 'A', typedName: 'A', parentChanged: true, parentId: 'P' }).parentId).toBe('P');
  });
});
