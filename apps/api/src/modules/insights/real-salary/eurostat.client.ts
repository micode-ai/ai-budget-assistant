import { Injectable } from '@nestjs/common';
import type { CoicopDivision } from '@budget/shared-types';
import { DIVISIONS, isDivision, isEurostatCountry } from './coicop';

export interface OfficialRateRow {
  country: string;
  division: CoicopDivision;
  month: string;
  annualRatePct: number;
}

export const EUROSTAT_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

type CategoryIndex = Record<string, number> | string[];

function positions(index: CategoryIndex | undefined): Map<number, string> | null {
  if (!index) return null;
  const m = new Map<number, string>();
  if (Array.isArray(index)) index.forEach((code, i) => m.set(i, code));
  else for (const [code, i] of Object.entries(index)) m.set(i, code);
  return m;
}

/**
 * JSON-stat 2.0 → rows. `value` is keyed by the row-major flat index over
 * `size`, in `id` order; an absent key means "no observation". Only single
 * countries we support survive (aggregates like EU27_2020 are dropped).
 */
export function parseJsonStat(body: unknown): OfficialRateRow[] {
  const b = body as {
    id?: string[]; size?: number[]; value?: Record<string, number | null>;
    dimension?: Record<string, { category?: { index?: CategoryIndex } }>;
  } | null;
  if (!b || !Array.isArray(b.id) || !Array.isArray(b.size) || !b.value || !b.dimension) return [];
  const dims = b.id;
  const need = ['coicop18', 'geo', 'time'];
  if (!need.every((d) => dims.includes(d))) return [];

  const maps = dims.map((d) => positions(b.dimension![d]?.category?.index));
  if (maps.some((m) => m === null)) return [];

  const rows: OfficialRateRow[] = [];
  for (const [flatKey, raw] of Object.entries(b.value)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    let rest = Number(flatKey);
    const coord: string[] = new Array(dims.length);
    for (let i = dims.length - 1; i >= 0; i--) {
      const size = b.size[i];
      coord[i] = maps[i]!.get(rest % size) ?? '';
      rest = Math.floor(rest / size);
    }
    const division = coord[dims.indexOf('coicop18')];
    const country = coord[dims.indexOf('geo')];
    const month = coord[dims.indexOf('time')];
    if (!isDivision(division) || !isEurostatCountry(country) || !/^\d{4}-\d{2}$/.test(month)) continue;
    rows.push({ country, division, month, annualRatePct: raw });
  }
  const order = (d: CoicopDivision) => DIVISIONS.indexOf(d);
  return rows.sort((a, c) =>
    a.country.localeCompare(c.country) || order(a.division) - order(c.division) || a.month.localeCompare(c.month),
  );
}

@Injectable()
export class EurostatClient {
  /** Latest published month, all countries, TOTAL + CP01..CP13. Throws on HTTP failure. */
  async fetchLatest(fetchImpl: typeof fetch = fetch): Promise<OfficialRateRow[]> {
    const params = new URLSearchParams({ format: 'JSON', lang: 'EN', unit: 'RCH_A', lastTimePeriod: '1' });
    for (const d of DIVISIONS) params.append('coicop18', d);
    const res = await fetchImpl(`${EUROSTAT_URL}prc_hicp_minr?${params.toString()}`);
    if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}`);
    return parseJsonStat(await res.json());
  }
}
