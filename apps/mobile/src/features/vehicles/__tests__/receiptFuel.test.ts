import type { Vehicle } from '@budget/shared-types';
import { pickFuelVehicle, rememberFuelVehicle, type ScannedFuel } from '../receiptFuel';

const v = (id: string, fuelType: Vehicle['fuelType']): Vehicle => ({
  id, accountId: 'a', name: id, fuelType, createdAt: '', updatedAt: '',
});
const fuel: ScannedFuel = { litres: 40, pricePerLitre: 6.5, fuelType: 'diesel' };

describe('pickFuelVehicle', () => {
  it('returns null for no vehicles and the only vehicle for one', () => {
    expect(pickFuelVehicle([], 'a', fuel)).toBeNull();
    expect(pickFuelVehicle([v('x', 'petrol')], 'a', fuel)?.id).toBe('x');
  });

  it('prefers the last used vehicle of that account', () => {
    rememberFuelVehicle('acc1', 'y');
    expect(pickFuelVehicle([v('x', 'diesel'), v('y', 'petrol')], 'acc1', fuel)?.id).toBe('y');
  });

  it('falls back to a unique fuel-type match, else none', () => {
    expect(pickFuelVehicle([v('x', 'diesel'), v('y', 'petrol')], 'acc2', fuel)?.id).toBe('x');
    expect(pickFuelVehicle([v('x', 'diesel'), v('y', 'diesel')], 'acc2', fuel)).toBeNull();
  });
});
