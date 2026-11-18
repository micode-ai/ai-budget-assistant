/**
 * Fuel block of a receipt scan (fuel-receipt-litres-ocr-prefill).
 *
 * The model READS litres, price per litre and fuel type off the fuel line; this
 * module never computes them. It only decides whether what was read is
 * trustworthy enough to prefill a fuel log: litres x price per litre must land
 * within a tolerance of some line's printed value, otherwise the whole block is
 * dropped (null) rather than half-filled.
 *
 * The app and the bots both go through `extractReceiptFuel` — one
 * implementation, called from `OcrService.validateAndNormalizeReceipt`.
 */

export type ReceiptFuelType = 'petrol' | 'diesel' | 'lpg' | 'other';

export interface ReceiptFuel {
  litres: number;
  pricePerLitre: number;
  fuelType: ReceiptFuelType;
}

/** Allowed gap between litres x price and the printed line value, as a share of the value. */
export const FUEL_TOLERANCE_PCT = 2;
/** Absolute floor, so cent rounding on a small fill-up never fails the check. */
export const FUEL_TOLERANCE_ABS = 0.05;
/** Outside this range a number is a misread column, not a fill-up. */
export const FUEL_MAX_LITRES = 300;
export const FUEL_MIN_LITRES = 1;

const FUEL_TYPES: ReceiptFuelType[] = ['petrol', 'diesel', 'lpg', 'other'];

interface RawFuel {
  litres?: unknown;
  pricePerLitre?: unknown;
  fuelType?: unknown;
}

interface LineLike {
  totalPrice: number;
}

function positive(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Validate the model's `fuel` block against the receipt's lines. A fuel receipt
 * may also carry a car wash or a coffee, so the check is "some line agrees",
 * not "the total agrees".
 */
export function extractReceiptFuel(raw: unknown, items: LineLike[]): ReceiptFuel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawFuel;
  const litres = positive(r.litres);
  const pricePerLitre = positive(r.pricePerLitre);
  if (litres === null || pricePerLitre === null) return null;
  if (litres < FUEL_MIN_LITRES || litres > FUEL_MAX_LITRES) return null;

  const expected = litres * pricePerLitre;
  const agrees = items.some((item) => {
    const value = Math.abs(item.totalPrice);
    if (!(value > 0)) return false;
    return Math.abs(expected - value) <= Math.max(FUEL_TOLERANCE_ABS, (value * FUEL_TOLERANCE_PCT) / 100);
  });
  if (!agrees) return null;

  const fuelType = FUEL_TYPES.includes(r.fuelType as ReceiptFuelType) ? (r.fuelType as ReceiptFuelType) : 'other';
  return {
    litres: Math.round(litres * 1000) / 1000,
    pricePerLitre: Math.round(pricePerLitre * 1000) / 1000,
    fuelType,
  };
}
