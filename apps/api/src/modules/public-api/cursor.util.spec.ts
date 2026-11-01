import { decodeCursor, encodeCursor } from './cursor.util';
import { PublicApiError } from './public-api-error';

function expectInvalidCursor(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PublicApiError);
    expect((e as PublicApiError).getStatus()).toBe(400);
    expect((e as PublicApiError).code).toBe('invalid_cursor');
    return;
  }
  throw new Error('expected invalid_cursor');
}

describe('cursor.util', () => {
  it('round-trips the parts', () => {
    const parts = ['2026-10-31', '6f1c2d3e-0000-4000-8000-000000000001'];
    const c = encodeCursor(parts);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c, 2)).toEqual(parts);
  });

  it('is opaque base64url (no padding, URL-safe)', () => {
    const c = encodeCursor(['a?b/c+d', 'ü']);
    expect(c).not.toMatch(/[=+/]/);
    expect(decodeCursor(c, 2)).toEqual(['a?b/c+d', 'ü']);
  });

  it.each([
    ['garbage', 'not a cursor!!'],
    ['empty', ''],
    ['not JSON', Buffer.from('hello').toString('base64url')],
    ['not an array', Buffer.from('{"a":1}').toString('base64url')],
    ['non-string parts', Buffer.from('[1,2]').toString('base64url')],
  ])('rejects %s with invalid_cursor', (_label, c) => {
    expectInvalidCursor(() => decodeCursor(c, 2));
  });

  it('rejects a cursor of the wrong arity', () => {
    expectInvalidCursor(() => decodeCursor(encodeCursor(['only-one']), 2));
  });
});
