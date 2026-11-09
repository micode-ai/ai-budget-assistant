export interface FuelEntry {
  date: Date;
  odometerKm: number;
  liters: number;
  amount: number;
  isFullTank: boolean;
}

export interface FuelSeriesPoint {
  date: string;
  lPer100Km: number;
  costPer100Km: number;
}

export interface VehicleStats {
  consumptionLPer100Km: number | null;
  costPerKm: number | null;
  costPer100Km: number | null;
  totalKm: number;
  lastPricePerLiter: number | null;
  fillUps: number;
  series: FuelSeriesPoint[];
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Full-tank method; see docs/contracts/vehicle-fuel-log.md. */
export function computeFuelStats(entries: FuelEntry[]): VehicleStats {
  const sorted = [...entries].sort(
    (a, b) => a.odometerKm - b.odometerKm || a.date.getTime() - b.date.getTime(),
  );
  const last = sorted[sorted.length - 1];
  const lastPricePerLiter =
    last && last.liters > 0 ? round(last.amount / last.liters, 3) : null;

  const series: FuelSeriesPoint[] = [];
  let baseline: number | null = null;
  let accLiters = 0;
  let accCost = 0;
  let totalLiters = 0;
  let totalCost = 0;
  let totalKm = 0;

  for (const e of sorted) {
    if (baseline === null) {
      if (e.isFullTank) baseline = e.odometerKm;
      continue;
    }
    accLiters += e.liters;
    accCost += e.amount;
    if (!e.isFullTank) continue;
    const km = e.odometerKm - baseline;
    if (km > 0) {
      series.push({
        date: e.date.toISOString().slice(0, 10),
        lPer100Km: round((accLiters / km) * 100, 2),
        costPer100Km: round((accCost / km) * 100, 2),
      });
      totalLiters += accLiters;
      totalCost += accCost;
      totalKm += km;
    }
    baseline = e.odometerKm;
    accLiters = 0;
    accCost = 0;
  }

  return {
    consumptionLPer100Km: totalKm > 0 ? round((totalLiters / totalKm) * 100, 2) : null,
    costPerKm: totalKm > 0 ? round(totalCost / totalKm, 4) : null,
    costPer100Km: totalKm > 0 ? round((totalCost / totalKm) * 100, 2) : null,
    totalKm,
    lastPricePerLiter,
    fillUps: sorted.length,
    series,
  };
}
