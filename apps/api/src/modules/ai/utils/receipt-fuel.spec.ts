import { extractReceiptFuel } from './receipt-fuel';

describe('extractReceiptFuel', () => {
  const lines = [{ totalPrice: 249.87 }, { totalPrice: 12.5 }];

  it('keeps a block that reconciles with a line', () => {
    expect(extractReceiptFuel({ litres: 38.5, pricePerLitre: 6.49, fuelType: 'diesel' }, lines)).toEqual({
      litres: 38.5,
      pricePerLitre: 6.49,
      fuelType: 'diesel',
    });
  });

  it('drops the block when litres x price misses every line', () => {
    expect(extractReceiptFuel({ litres: 38.5, pricePerLitre: 6.49, fuelType: 'petrol' }, [{ totalPrice: 180 }])).toBeNull();
  });

  it('drops implausible or missing numbers', () => {
    expect(extractReceiptFuel({ litres: 0, pricePerLitre: 6, fuelType: 'petrol' }, lines)).toBeNull();
    expect(extractReceiptFuel({ litres: 4000, pricePerLitre: 0.0625, fuelType: 'petrol' }, [{ totalPrice: 250 }])).toBeNull();
    expect(extractReceiptFuel({ litres: null, pricePerLitre: 6, fuelType: 'petrol' }, lines)).toBeNull();
    expect(extractReceiptFuel(null, lines)).toBeNull();
    expect(extractReceiptFuel('x', lines)).toBeNull();
  });

  it('falls back to "other" for an unknown fuel type', () => {
    expect(extractReceiptFuel({ litres: 40, pricePerLitre: 6.25, fuelType: 'hydrogen' }, [{ totalPrice: 250 }])?.fuelType).toBe('other');
  });
});
