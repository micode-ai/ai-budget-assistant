import { parseServerLocation } from '../location';

describe('parseServerLocation', () => {
  it('parses Prisma Decimal strings into numbers', () => {
    expect(parseServerLocation({ locationLat: '52.2297', locationLng: '21.0122', locationName: 'Warszawa' }))
      .toEqual({ lat: 52.2297, lng: 21.0122, name: 'Warszawa' });
  });

  it('passes through plain numbers and omits empty name', () => {
    expect(parseServerLocation({ locationLat: 50.06, locationLng: 19.93, locationName: null }))
      .toEqual({ lat: 50.06, lng: 19.93, name: undefined });
  });

  it('returns undefined when either coordinate is missing', () => {
    expect(parseServerLocation({ locationLat: null, locationLng: 21, locationName: null })).toBeUndefined();
    expect(parseServerLocation({ locationLat: 52, locationLng: undefined, locationName: null })).toBeUndefined();
    expect(parseServerLocation({})).toBeUndefined();
  });

  it('returns undefined for non-numeric garbage', () => {
    expect(parseServerLocation({ locationLat: 'abc', locationLng: '21' })).toBeUndefined();
  });
});
