export type ShareType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface RawShare {
  userId: string;
  value: number;
}

export interface ResolvedShare {
  userId: string;
  shareAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function distributeWithRemainder(totalAmount: number, portions: number[]): number[] {
  const sum = round2(portions.reduce((a, b) => a + b, 0));
  const remainder = round2(totalAmount - sum);
  const result = [...portions];
  result[result.length - 1] = round2(result[result.length - 1] + remainder);
  return result;
}

export function resolveShares(
  totalAmount: number,
  splitType: ShareType,
  rawShares: RawShare[],
): ResolvedShare[] {
  if (rawShares.length === 0) return [];

  switch (splitType) {
    case 'exact': {
      const sum = round2(rawShares.reduce((a, s) => a + s.value, 0));
      if (Math.abs(sum - totalAmount) > 0.01) {
        throw new Error(`Exact shares must sum to ${totalAmount}, got ${sum}`);
      }
      return rawShares.map((s) => ({ userId: s.userId, shareAmount: round2(s.value) }));
    }
    case 'equal': {
      const equalShare = Math.floor((totalAmount / rawShares.length) * 100) / 100;
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map(() => equalShare),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
    case 'percentage': {
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map((s) => Math.floor(totalAmount * (s.value / 100) * 100) / 100),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
    case 'shares': {
      const totalUnits = rawShares.reduce((sum, s) => sum + s.value, 0);
      if (totalUnits <= 0) {
        throw new Error('Total share units must be greater than zero');
      }
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map((s) => Math.floor(totalAmount * (s.value / totalUnits) * 100) / 100),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
  }
}
