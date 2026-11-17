import type { VehicleCostKind, VehicleHistory, VehicleHistoryItem, VehicleHistoryPeriod } from '@budget/shared-types';

/** The vehicle screen's period chips, in order (ABA-811). 0 = all time. */
export const VEHICLE_PERIODS: VehicleHistoryPeriod[] = [3, 6, 12, 24, 0];

export const VEHICLE_KINDS: VehicleCostKind[] = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'];

/**
 * One colour per kind of cost, the same on every chart and list of the screen.
 * Mid-saturation, readable on both the light and the dark surface.
 */
export const KIND_COLORS: Record<VehicleCostKind, string> = {
  fuel: '#3B82F6',
  service: '#F59E0B',
  insurance: '#8B5CF6',
  parking: '#14B8A6',
  tax: '#EF4444',
  other: '#94A3B8',
};

export interface VehicleKindRow {
  id: VehicleCostKind;
  amount: number;
  /** 0-100 of the shown total. */
  percentage: number;
  color: string;
}

/**
 * Non-zero kinds of the period, or of one month of it when `month` is given,
 * largest first.
 */
export function kindRows(history: VehicleHistory, month: string | null): VehicleKindRow[] {
  const source = month ? history.monthly.find((m) => m.month === month)?.byKind ?? {} : history.byKind;
  const total = VEHICLE_KINDS.reduce((s, k) => s + (source[k] ?? 0), 0);
  return VEHICLE_KINDS.filter((k) => (source[k] ?? 0) > 0)
    .map((k) => ({
      id: k,
      amount: source[k] ?? 0,
      percentage: total > 0 ? ((source[k] ?? 0) / total) * 100 : 0,
      color: KIND_COLORS[k],
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** The list under the charts: the period's items, narrowed to a month and/or a kind. */
export function filterItems(
  items: VehicleHistoryItem[],
  month: string | null,
  kind: VehicleCostKind | null,
): VehicleHistoryItem[] {
  return items.filter((i) => (!month || i.date.startsWith(month)) && (!kind || i.kind === kind));
}

/** Nothing recorded in the period: tiles show a dash and the charts an empty note. */
export function isEmptyHistory(history: VehicleHistory): boolean {
  return history.items.length === 0;
}

/**
 * A row's second line: where it was bought, else its note, else nothing.
 * `local` is the device's own (decrypted) copy of the expense when there is
 * one; the server's copy of an encrypted account is ciphertext (`enc:`) and is
 * never shown.
 */
export function itemCaption(
  item: VehicleHistoryItem,
  local?: { merchant?: string | null; description?: string | null } | null,
): string | null {
  const plain = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && !t.startsWith('enc:') ? t : null;
  };
  return plain(local?.merchant) ?? plain(local?.description) ?? plain(item.merchant) ?? plain(item.description);
}
