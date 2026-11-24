/** Km-based service forecast (vehicle-odometer-service-interval). Pure: no I/O. */
export const RATE_WINDOW_DAYS = 60;
/** A shorter span between the first and last reading makes a km/day rate noise. */
export const MIN_RATE_SPAN_DAYS = 7;

export interface OdometerReading {
  date: Date;
  odometerKm: number;
}

export interface ServiceForecast {
  targetKm: number;
  latestKm: number;
  estimatedKm: number;
  remainingKm: number;
  daysLeft: number | null;
  kmPerDay: number | null;
}

export interface ServiceForecastInput {
  intervalKm: number | null;
  lastServiceKm: number | null;
  legacyTargetKm: number | null;
  readings: OdometerReading[];
  today: Date;
}

const DAY_MS = 86_400_000;

/** The odometer value the next service is due at, or null when nothing is configured. */
export function serviceTargetKm(
  i: Pick<ServiceForecastInput, 'intervalKm' | 'lastServiceKm' | 'legacyTargetKm'>,
): number | null {
  if (i.intervalKm != null && i.intervalKm > 0 && i.lastServiceKm != null) return i.lastServiceKm + i.intervalKm;
  return i.legacyTargetKm;
}

/** Average km per day over the last 60 days of readings; null on sparse data. */
export function kmPerDay(readings: OdometerReading[], today: Date): number | null {
  const since = today.getTime() - RATE_WINDOW_DAYS * DAY_MS;
  const recent = readings
    .filter((r) => r.date.getTime() >= since)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (recent.length < 2) return null;
  const span = (recent[recent.length - 1].date.getTime() - recent[0].date.getTime()) / DAY_MS;
  const km = Math.max(...recent.map((r) => r.odometerKm)) - Math.min(...recent.map((r) => r.odometerKm));
  if (span < MIN_RATE_SPAN_DAYS || km <= 0) return null;
  return km / span;
}

export function serviceForecast(input: ServiceForecastInput): ServiceForecast | null {
  const targetKm = serviceTargetKm(input);
  if (targetKm == null || input.readings.length === 0) return null;
  const latest = input.readings.reduce((a, b) => (b.odometerKm > a.odometerKm ? b : a));
  const rate = kmPerDay(input.readings, input.today);
  const sinceLatest = Math.max(0, (input.today.getTime() - latest.date.getTime()) / DAY_MS);
  const estimatedKm = Math.round(latest.odometerKm + (rate ?? 0) * sinceLatest);
  const remainingKm = targetKm - estimatedKm;
  return {
    targetKm,
    latestKm: latest.odometerKm,
    estimatedKm,
    remainingKm,
    daysLeft: rate != null && remainingKm > 0 ? Math.ceil(remainingKm / rate) : null,
    kmPerDay: rate != null ? Math.round(rate * 10) / 10 : null,
  };
}
