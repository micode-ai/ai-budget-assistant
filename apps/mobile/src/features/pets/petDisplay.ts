import type { PetCostKind, PetHistory, PetHistoryItem, PetHistoryPeriod, PetSpecies } from '@budget/shared-types';

/**
 * Pure helpers for the pet screens (ABA-831): the period chips, the kinds and
 * their colours, the breakdown rows, the list filter, the care-date status and
 * the bulk-assign chunking. Mirrors `vehicleDetailDisplay.ts`.
 */

/** The pet screen's period chips, in order. 0 = all time. */
export const PET_PERIODS: PetHistoryPeriod[] = [3, 6, 12, 24, 0];

export const PET_KINDS: PetCostKind[] = ['food', 'vet', 'grooming', 'supplies', 'insurance', 'other'];

export const PET_SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];

/** One colour per kind of cost, the same on every chart and list of the screen. */
export const PET_KIND_COLORS: Record<PetCostKind, string> = {
  food: '#F59E0B',
  vet: '#EF4444',
  grooming: '#EC4899',
  supplies: '#3B82F6',
  insurance: '#8B5CF6',
  other: '#94A3B8',
};

/** The server accepts at most this many ids per bulk request. */
export const PET_BULK_MAX = 500;

export interface PetKindRow {
  id: PetCostKind;
  amount: number;
  /** 0-100 of the shown total. */
  percentage: number;
  color: string;
}

/** Non-zero kinds of the period, or of one month of it when `month` is given, largest first. */
export function petKindRows(history: PetHistory, month: string | null): PetKindRow[] {
  const source = month ? history.monthly.find((m) => m.month === month)?.byKind ?? {} : history.byKind;
  const total = PET_KINDS.reduce((s, k) => s + (source[k] ?? 0), 0);
  return PET_KINDS.filter((k) => (source[k] ?? 0) > 0)
    .map((k) => ({
      id: k,
      amount: source[k] ?? 0,
      percentage: total > 0 ? ((source[k] ?? 0) / total) * 100 : 0,
      color: PET_KIND_COLORS[k],
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** The list under the charts: the period's items, narrowed to a month and/or a kind. */
export function filterPetItems(items: PetHistoryItem[], month: string | null, kind: PetCostKind | null): PetHistoryItem[] {
  return items.filter((i) => (!month || i.date.startsWith(month)) && (!kind || i.kind === kind));
}

/** The two largest kinds of a period, for the analytics row's caption. */
export function topPetKinds(byKind: Record<string, number>, n = 2): { kind: PetCostKind; amount: number }[] {
  return PET_KINDS.filter((k) => (byKind[k] ?? 0) > 0)
    .map((k) => ({ kind: k, amount: byKind[k] ?? 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/**
 * A row's second line: where it was bought, else its note, else nothing.
 * `local` is the device's own (decrypted) copy of the expense when there is
 * one; the server's copy of an encrypted account is ciphertext (`enc:`) and is
 * never shown.
 */
export function petItemCaption(
  item: PetHistoryItem,
  local?: { merchant?: string | null; description?: string | null } | null,
): string | null {
  const plain = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && !t.startsWith('enc:') ? t : null;
  };
  return plain(local?.merchant) ?? plain(local?.description) ?? plain(item.merchant) ?? plain(item.description);
}

/** `YYYY-MM-DD` (or a full ISO stamp) as the local calendar day it names — never `new Date(string)`, which reads UTC. */
export function parsePetDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole local calendar days from `today` to the stored date (negative when past). */
export function petDaysUntil(iso: string, today: Date): number {
  const target = parsePetDay(iso);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** How a care date reads on the pet card. */
export type CareDateStatus = 'overdue' | 'soon' | 'later';

/** Overdue once past; "soon" inside the two weeks the first reminder covers. */
export function careDateStatus(iso: string, today: Date): CareDateStatus {
  const days = petDaysUntil(iso, today);
  if (days < 0) return 'overdue';
  return days <= 14 ? 'soon' : 'later';
}

/** Whole years since a birthday, or null when unknown or in the future. */
export function petAgeYears(birthday: string | null | undefined, today: Date): number | null {
  if (!birthday) return null;
  const b = parsePetDay(birthday);
  let age = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}

/** A selection split into requests the server accepts; order kept, duplicates dropped. */
export function chunkPetIds(ids: string[], size = PET_BULK_MAX): string[][] {
  const unique = [...new Set(ids)];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}
