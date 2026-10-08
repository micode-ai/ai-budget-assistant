import { distanceMeters, resolveStorePin, type PinCandidate } from './community-store-pin';

const c = (contributorKey: string, lat: number, lng: number): PinCandidate => ({ contributorKey, lat, lng });

describe('resolveStorePin (ABA-642 audit: pin squatting)', () => {
  it('publishes nothing for a single first writer', () => {
    expect(resolveStorePin([c('a', 52.2297, 21.0122)], 3)).toBeNull();
  });

  it('publishes nothing below k distinct contributors, even with many rows from one', () => {
    const rows = [c('a', 52.2297, 21.0122), c('a', 52.2297, 21.0122), c('b', 52.2298, 21.0123)];
    expect(resolveStorePin(rows, 3)).toBeNull();
  });

  it('publishes the MEDIAN coordinate once k distinct contributors agree within the radius', () => {
    const pin = resolveStorePin([c('a', 52.2297, 21.0122), c('b', 52.2299, 21.0124), c('c', 52.2301, 21.0126)], 3);
    expect(pin).toMatchObject({ lat: 52.2299, lng: 21.0124, agreeing: 3 });
  });

  it('a squatter far away cannot move or block the honest cluster', () => {
    const honest = [c('a', 52.2297, 21.0122), c('b', 52.2298, 21.0123), c('c', 52.2299, 21.0124)];
    const pin = resolveStorePin([c('squat', 50.0, 19.9), ...honest], 3);
    expect(pin).not.toBeNull();
    expect(distanceMeters(pin!.lat, pin!.lng, 52.2298, 21.0123)).toBeLessThan(50);
  });

  it('disagreeing contributors (spread beyond the radius) never reach k', () => {
    expect(resolveStorePin([c('a', 52.0, 21.0), c('b', 52.1, 21.1), c('c', 52.2, 21.2)], 3)).toBeNull();
  });

  it('ignores the null-island coordinate', () => {
    expect(resolveStorePin([c('a', 0, 0), c('b', 0, 0), c('c', 0, 0)], 3)).toBeNull();
  });
});
