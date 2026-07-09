import { loadRecentPlaces, addToRecentPlaces, type RecentPlace } from '../recentPlacesStore';

const A: RecentPlace = { lat: 52.23, lng: 21.01, name: 'Warszawa' };
const B: RecentPlace = { lat: 50.06, lng: 19.94, name: 'Kraków' };

describe('recentPlacesStore pure helpers', () => {
  describe('loadRecentPlaces', () => {
    it('returns [] for undefined / empty / malformed', () => {
      expect(loadRecentPlaces(() => undefined)).toEqual([]);
      expect(loadRecentPlaces(() => '')).toEqual([]);
      expect(loadRecentPlaces(() => '{not json')).toEqual([]);
      expect(loadRecentPlaces(() => JSON.stringify({ not: 'array' }))).toEqual([]);
    });

    it('drops entries missing valid lat/lng/name', () => {
      const stored = JSON.stringify([
        A,
        { lat: 1, lng: 2 }, // no name
        { lat: 'x', lng: 2, name: 'Bad' }, // bad lat
        { lat: 1, lng: 2, name: '   ' }, // blank name
      ]);
      expect(loadRecentPlaces(() => stored)).toEqual([A]);
    });

    it('caps at 8 entries', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ lat: i, lng: i, name: `P${i}` }));
      expect(loadRecentPlaces(() => JSON.stringify(many))).toHaveLength(8);
    });
  });

  describe('addToRecentPlaces', () => {
    it('prepends the new place', () => {
      expect(addToRecentPlaces([A], B)).toEqual([B, A]);
    });

    it('dedupes by name (case-insensitive), keeping the newest pick at the front', () => {
      const out = addToRecentPlaces([A, B], { lat: 52.24, lng: 21.02, name: 'warszawa' });
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({ lat: 52.24, lng: 21.02, name: 'warszawa' });
      expect(out[1]).toEqual(B);
    });

    it('caps at 8', () => {
      const list = Array.from({ length: 8 }, (_, i) => ({ lat: i, lng: i, name: `P${i}` }));
      const out = addToRecentPlaces(list, { lat: 99, lng: 99, name: 'New' });
      expect(out).toHaveLength(8);
      expect(out[0].name).toBe('New');
    });

    it('ignores a blank-name place', () => {
      const list = [A];
      expect(addToRecentPlaces(list, { lat: 1, lng: 2, name: '  ' })).toBe(list);
    });
  });
});
