import type { SupportMessageView } from '@budget/shared-types';
import { bubbleText, lastUserStatus, supportErrorKey } from '../supportDisplay';

function msg(over: Partial<SupportMessageView>): SupportMessageView {
  return {
    id: 'm1',
    author: 'developer',
    body: 'Привет',
    bodyLang: 'ru',
    translatedBody: 'Hello',
    translatedLang: 'en',
    readAt: null,
    createdAt: '2026-11-27T10:00:00.000Z',
    ...over,
  };
}

describe('bubbleText', () => {
  it('shows the translation first when auto-translate is on, with the original one tap away', () => {
    expect(bubbleText(msg({}), true, false)).toEqual({
      primary: 'Hello',
      secondary: null,
      altLabelKey: 'support.showOriginal',
    });
  });

  it('swaps to the original when showAlt is set under auto-translate', () => {
    expect(bubbleText(msg({}), true, true)).toEqual({
      primary: 'Привет',
      secondary: null,
      altLabelKey: 'support.showTranslation',
    });
  });

  it('shows the original first when auto-translate is off, with the translation one tap away', () => {
    expect(bubbleText(msg({}), false, false)).toEqual({
      primary: 'Привет',
      secondary: null,
      altLabelKey: 'support.showTranslation',
    });
    expect(bubbleText(msg({}), false, true)).toEqual({
      primary: 'Hello',
      secondary: null,
      altLabelKey: 'support.showOriginal',
    });
  });

  it('offers no alternative when there is no translation', () => {
    for (const auto of [true, false]) {
      for (const alt of [true, false]) {
        expect(bubbleText(msg({ translatedBody: null, translatedLang: null }), auto, alt)).toEqual({
          primary: 'Привет',
          secondary: null,
          altLabelKey: null,
        });
      }
    }
  });

  it('offers no alternative when the translation is empty or identical to the original', () => {
    expect(bubbleText(msg({ translatedBody: '' }), true, false).altLabelKey).toBeNull();
    expect(bubbleText(msg({ translatedBody: 'Привет' }), true, false).altLabelKey).toBeNull();
  });

  it('always shows a user message as typed, with no alternative', () => {
    const mine = msg({ author: 'user', body: 'My text', translatedBody: 'Мой текст' });
    expect(bubbleText(mine, true, false)).toEqual({ primary: 'My text', secondary: null, altLabelKey: null });
    expect(bubbleText(mine, false, true)).toEqual({ primary: 'My text', secondary: null, altLabelKey: null });
  });
});

describe('lastUserStatus', () => {
  it('is null with no user messages', () => {
    expect(lastUserStatus([])).toBeNull();
    expect(lastUserStatus([msg({})])).toBeNull();
  });

  it('is read when the last user message has readAt', () => {
    expect(
      lastUserStatus([
        msg({ id: 'a', author: 'user', readAt: null }),
        msg({ id: 'b', author: 'user', readAt: '2026-11-27T11:00:00.000Z' }),
        msg({ id: 'c', author: 'developer' }),
      ]),
    ).toBe('read');
  });

  it('is sent when the last user message has no readAt, whatever earlier ones say', () => {
    expect(
      lastUserStatus([
        msg({ id: 'a', author: 'user', readAt: '2026-11-27T11:00:00.000Z' }),
        msg({ id: 'b', author: 'user', readAt: null }),
      ]),
    ).toBe('sent');
  });
});

describe('supportErrorKey', () => {
  it('maps 429 to the daily-limit copy and 503 to try-again-later', () => {
    expect(supportErrorKey({ status: 429 })).toBe('support.errorLimit');
    expect(supportErrorKey({ status: 503 })).toBe('support.errorUnavailable');
  });

  it('falls back to the generic send error for anything else', () => {
    expect(supportErrorKey({ status: 400 })).toBe('support.errorSend');
    expect(supportErrorKey(new Error('Failed to fetch'))).toBe('support.errorSend');
    expect(supportErrorKey(undefined)).toBe('support.errorSend');
  });
});
