import { buildLocationColumns } from './expense-location.util';

describe('buildLocationColumns', () => {
  it('undefined input leaves all columns untouched', () => {
    expect(buildLocationColumns(undefined)).toEqual({
      locationLat: undefined, locationLng: undefined, locationName: undefined,
    });
  });

  it('null input clears all three columns', () => {
    expect(buildLocationColumns(null)).toEqual({
      locationLat: null, locationLng: null, locationName: null,
    });
  });

  it('object with name sets all three', () => {
    expect(buildLocationColumns({ lat: 52.23, lng: 21.01, name: 'Marszałkowska 10' })).toEqual({
      locationLat: 52.23, locationLng: 21.01, locationName: 'Marszałkowska 10',
    });
  });

  it('object without name sets coordinates and CLEARS the stale name', () => {
    expect(buildLocationColumns({ lat: 52.23, lng: 21.01 })).toEqual({
      locationLat: 52.23, locationLng: 21.01, locationName: null,
    });
  });
});
