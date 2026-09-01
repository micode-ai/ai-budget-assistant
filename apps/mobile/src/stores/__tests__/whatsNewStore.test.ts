import { resolveLastSeenId } from '../whatsNewStore';

describe('whatsNewStore.resolveLastSeenId', () => {
  it('returns null when nothing has been persisted yet', () => {
    expect(resolveLastSeenId(() => undefined)).toBeNull();
  });

  it('returns the persisted id as-is', () => {
    expect(resolveLastSeenId((k) => (k === 'lastSeenId' ? 'inflation-shield' : undefined))).toBe(
      'inflation-shield',
    );
  });
});
